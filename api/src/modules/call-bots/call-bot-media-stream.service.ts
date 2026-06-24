import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IncomingMessage, Server as HttpServer } from 'http';
import { Duplex } from 'stream';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { CallBotTwilioService } from './call-bot-twilio.service';

/**
 * Real-time voice via Twilio Media Streams ↔ Deepgram Voice Agent.
 *
 *   Twilio ──(wss, mulaw 8kHz)──► this bridge ──► Deepgram Voice Agent
 *      ▲                                          (STT + turn-taking + LLM + TTS)
 *      └──────────(mulaw 8kHz audio)──────────────┘
 *
 * The Voice Agent handles listening, interruptions, thinking and speaking in a
 * single connection (far more stable than a hand-built STT+LLM+TTS pipeline).
 * CRM/Dentally tools run as client-side functions: the agent sends
 * FunctionCallRequest, we execute it and reply with FunctionCallResponse.
 *
 * Path: wss://<api-host>/call-bots/twilio/media-stream
 */
@Injectable()
export class CallBotMediaStreamService {
  private readonly logger = new Logger(CallBotMediaStreamService.name);
  private wss?: WebSocketServer;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
    private readonly twilio: CallBotTwilioService,
  ) {}

  /** Attach the WebSocket server to the HTTP server (called from main.ts). */
  bind(server: HttpServer) {
    if (this.wss) return;
    this.wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      let pathname = '';
      try { pathname = new URL(req.url ?? '', 'http://localhost').pathname; } catch { /* ignore */ }
      if (pathname !== '/call-bots/twilio/media-stream') return; // leave other upgrades alone
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.handleConnection(ws));
    });
    this.logger.log('[voice-agent] bound at /call-bots/twilio/media-stream');
  }

  private async handleConnection(twilioWs: WebSocket) {
    let streamSid = '';
    let callSid = '';
    let bot: any = null;
    let agentWs: WebSocket | null = null;
    let closed = false;
    let keepAlive: ReturnType<typeof setInterval> | null = null;
    // Deepgram rejects any audio sent before the Settings message ("Received binary
    // before Settings"). Gate audio forwarding until Settings has been sent.
    let settingsSent = false;
    // Safety net: the LLM doesn't reliably call end_call, so when the caller clearly
    // says goodbye we hang up ourselves after the bot's next reply finishes playing.
    let pendingHangup = false;
    // Set when the agent calls transfer_to_human / transfer_to_department; executed
    // after the agent's "putting you through" line plays (or a fallback timeout).
    let pendingTransfer: { kind: 'human' | 'department'; department?: string } | null = null;

    const sendToTwilio = (obj: any) => {
      if (twilioWs.readyState === WebSocket.OPEN) twilioWs.send(JSON.stringify(obj));
    };

    // Run the pending transfer exactly once, then tear down the bridge.
    const executeTransfer = () => {
      if (!pendingTransfer || closed) return;
      const t = pendingTransfer;
      pendingTransfer = null;
      this.logger.log(`[voice-agent] transferring call=${callSid} → ${t.kind}${t.department ? ` (${t.department})` : ''}`);
      this.twilio.transferCall(callSid, bot, t).finally(() => cleanup());
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
      try { agentWs?.close(); } catch { /* ignore */ }
      try { twilioWs.close(); } catch { /* ignore */ }
    };

    /** Open the Deepgram Voice Agent socket and wire its events.
     *  `settings` is built BEFORE opening so we can send it synchronously on open
     *  (no async gap during which Twilio audio could race ahead of Settings). */
    const openAgent = async (settings: any) => {
      const dgKey = (await this.platformSettings.get('deepgram.api_key').catch(() => '')) as string;
      if (!dgKey) { this.logger.error('[voice-agent] no Deepgram key configured'); cleanup(); return; }

      agentWs = new WebSocket('wss://agent.deepgram.com/v1/agent/converse', ['token', dgKey]);

      agentWs.on('open', () => {
        try {
          agentWs!.send(JSON.stringify(settings));
          settingsSent = true; // now it's safe to forward audio
          this.logger.log(`[voice-agent] settings sent call=${callSid} listen=${settings.agent?.listen?.provider?.language ?? '?'} fns=${settings.agent.think.functions?.length ?? 0}`);
          keepAlive = setInterval(() => {
            if (agentWs?.readyState === WebSocket.OPEN) agentWs.send(JSON.stringify({ type: 'KeepAlive' }));
          }, 8000);
        } catch (e: any) { this.logger.error(`[voice-agent] settings send failed: ${e.message}`); cleanup(); }
      });

      agentWs.on('message', async (data: RawData, isBinary: boolean) => {
        // Binary frames = TTS audio (mulaw 8k) → forward to Twilio in small frames.
        if (isBinary) {
          const buf = data as Buffer;
          for (let i = 0; i < buf.length; i += 640) {
            sendToTwilio({ event: 'media', streamSid, media: { payload: buf.subarray(i, i + 640).toString('base64') } });
          }
          return;
        }
        let msg: any;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        // TEMP diagnostic: see every non-audio event Deepgram sends.
        if (msg.type && msg.type !== 'ConversationText') this.logger.log(`[voice-agent] evt ${msg.type}`);
        switch (msg.type) {
          case 'UserStartedSpeaking':
            // Barge-in: stop whatever the bot is playing.
            sendToTwilio({ event: 'clear', streamSid });
            break;
          case 'ConversationText': {
            const content = msg.content || '';
            this.logger.log(`[voice-agent] ${msg.role}: ${content.slice(0, 70)}`);
            if (content) this.twilio.appendCallTranscript(callSid, msg.role === 'user' ? 'user' : 'bot', content);
            // The LLM almost never calls end_call on its own, so we close the call by
            // watching the transcript and hanging up on the NEXT AgentAudioDone (so the
            // farewell finishes playing). Two triggers:
            //   • the CALLER clearly says goodbye, OR
            //   • the BOT delivers a terminal sign-off ("hasta luego", "que tengas un
            //     buen día", "nos vemos"…) — this used to be ignored, leaving the call
            //     alive in silence until the caller happened to say a goodbye word.
            const userGoodbye = msg.role === 'user' &&
              /\b(bye|good\s?bye|adi[oó]s|hasta luego|hasta pronto|eso es todo|that'?s all|nothing else|nada m[aá]s)\b/i.test(content);
            const botFarewell = msg.role !== 'user' &&
              /(\badi[oó]s\b|hasta (luego|pronto|mañana)|nos vemos|(buen|buena|excelente|gran|lindo|linda|bonito|bonita|maravilloso|maravillosa) (d[ií]a|tarde|noche|jornada)|feliz (d[ií]a|tarde|noche)|\bgood\s?bye\b|take care|have a (great|good|nice|wonderful|lovely) (day|one|evening))/i.test(content);
            if (userGoodbye || botFarewell) {
              if (botFarewell) this.logger.log('[voice-agent] bot farewell detected → will hang up after it plays');
              pendingHangup = true;
            }
            break;
          }
          case 'AgentAudioDone':
            // Transfer takes priority over hangup: execute it once the heads-up plays.
            if (pendingTransfer && !closed) {
              setTimeout(executeTransfer, 800);
            } else if (pendingHangup && !closed) {
              this.logger.log(`[voice-agent] goodbye detected → hanging up call=${callSid}`);
              setTimeout(() => { this.twilio.hangupCall(callSid).finally(() => cleanup()); }, 800);
            }
            break;
          case 'FunctionCallRequest': {
            const fns = Array.isArray(msg.functions) ? msg.functions : [];
            for (const fn of fns) {
              if (fn.client_side === false) continue; // server-side function: nothing to do
              // end_call: acknowledge, then hang up after the farewell has played.
              if (fn.name === 'end_call') {
                if (agentWs?.readyState === WebSocket.OPEN) {
                  agentWs.send(JSON.stringify({ type: 'FunctionCallResponse', id: fn.id, name: fn.name, content: 'ok' }));
                }
                this.logger.log(`[voice-agent] end_call → hanging up call=${callSid}`);
                setTimeout(() => { this.twilio.hangupCall(callSid).finally(() => cleanup()); }, 4000);
                continue;
              }
              // transfer_to_human / transfer_to_department: ack so the agent says its
              // heads-up line, then redirect the call (on AgentAudioDone, or 6s fallback).
              if (fn.name === 'transfer_to_human' || fn.name === 'transfer_to_department') {
                let targs: any = {};
                try { targs = fn.arguments ? JSON.parse(fn.arguments) : {}; } catch { /* ignore */ }
                pendingTransfer = fn.name === 'transfer_to_human'
                  ? { kind: 'human' }
                  : { kind: 'department', department: targs.department };
                if (agentWs?.readyState === WebSocket.OPEN) {
                  agentWs.send(JSON.stringify({ type: 'FunctionCallResponse', id: fn.id, name: fn.name, content: 'ok, transferring now' }));
                }
                this.logger.log(`[voice-agent] ${fn.name}(${(fn.arguments || '{}').slice(0, 80)}) → will transfer call=${callSid}`);
                setTimeout(executeTransfer, 6000); // fallback if no AgentAudioDone arrives
                continue;
              }
              let args: any = {};
              try { args = fn.arguments ? JSON.parse(fn.arguments) : {}; } catch { /* ignore */ }
              this.logger.log(`[voice-agent] fn ${fn.name}(${(fn.arguments || '{}').slice(0, 120)})`);
              let content = '';
              try { content = await this.twilio.runVoiceAgentFunction(bot, callSid, fn.name, args); }
              catch (e: any) { content = `Error: ${e.message}`; }
              if (agentWs?.readyState === WebSocket.OPEN) {
                agentWs.send(JSON.stringify({ type: 'FunctionCallResponse', id: fn.id, name: fn.name, content: content || 'OK' }));
              }
            }
            break;
          }
          case 'Error':
          case 'Warning':
            this.logger.warn(`[voice-agent] ${msg.type}: ${JSON.stringify(msg).slice(0, 200)}`);
            break;
          // Welcome / SettingsApplied / AgentStartedSpeaking / AgentAudioDone / AgentThinking → ignore
        }
      });

      agentWs.on('error', (e) => this.logger.warn(`[voice-agent] ws error: ${(e as any).message}`));
      agentWs.on('close', (code: number) => { this.logger.log(`[voice-agent] agent closed code=${code} call=${callSid}`); agentWs = null; });
    };

    twilioWs.on('message', async (raw: RawData) => {
      let data: any;
      try { data = JSON.parse(raw.toString()); } catch { return; }
      switch (data.event) {
        case 'start': {
          streamSid = data.start?.streamSid ?? data.streamSid ?? '';
          callSid   = data.start?.callSid ?? '';
          const botId = data.start?.customParameters?.botId ?? '';
          this.logger.log(`[voice-agent] start call=${callSid} bot=${botId} streamSid=${streamSid}`);
          try { bot = await this.twilio.getBot(botId); }
          catch (e: any) { this.logger.error(`[voice-agent] bot load failed: ${e.message}`); }
          if (!bot) { cleanup(); return; }
          // Build Settings BEFORE opening the agent socket (avoids the audio-before-
          // Settings race that intermittently closed the connection).
          let settings: any;
          try { settings = await this.twilio.buildVoiceAgentSettings(bot, callSid); }
          catch (e: any) { this.logger.error(`[voice-agent] settings build failed: ${e.message}`); cleanup(); return; }
          await openAgent(settings);
          break;
        }
        case 'media': {
          const payload = data.media?.payload;
          // Only after Settings is sent (dropping the first ~ms of audio is fine).
          if (payload && settingsSent && agentWs?.readyState === WebSocket.OPEN) agentWs.send(Buffer.from(payload, 'base64'));
          break;
        }
        case 'stop':
          this.logger.log(`[voice-agent] stop call=${callSid}`);
          cleanup();
          break;
      }
    });

    twilioWs.on('close', cleanup);
    twilioWs.on('error', cleanup);
  }
}
