import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IncomingMessage, Server as HttpServer } from 'http';
import { Duplex } from 'stream';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import axios from 'axios';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { CallBotTwilioService } from './call-bot-twilio.service';

/**
 * Real-time voice via Twilio Media Streams.
 *
 *   Twilio ──(wss, mulaw 8kHz)──► this server
 *      ▲                            │ audio → Deepgram (streaming STT: VAD + noise-robust)
 *      │                            │ utterance end → LLM (reuses CallBotTwilioService)
 *      └────────(mulaw 8kHz)────────┘ reply → ElevenLabs streaming TTS (ulaw_8000) → Twilio
 *
 * Barge-in: if the caller talks while the bot is playing, we flush Twilio's
 * buffer and abort the in-flight TTS.
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
    this.logger.log('[media-stream] bound at /call-bots/twilio/media-stream');
  }

  private async handleConnection(twilioWs: WebSocket) {
    let streamSid = '';
    let callSid = '';
    let bot: any = null;
    let aiCfg: { apiKey: string; provider: string; model: string } | null = null;
    let dgWs: WebSocket | null = null;
    let speaking = false;
    let processing = false;
    let closed = false;
    let ttsAbort: AbortController | null = null;

    const sendToTwilio = (obj: any) => {
      if (twilioWs.readyState === WebSocket.OPEN) twilioWs.send(JSON.stringify(obj));
    };

    /** Stop whatever the bot is saying (barge-in). */
    const stopSpeaking = () => {
      if (!speaking) return;
      speaking = false;
      try { ttsAbort?.abort(); } catch { /* ignore */ }
      ttsAbort = null;
      sendToTwilio({ event: 'clear', streamSid });
    };

    /** ElevenLabs streaming TTS (ulaw_8000) → Twilio media frames. */
    const speak = async (text: string) => {
      const clean = (text ?? '').trim();
      if (!clean || closed) return;
      const elevenKey = (await this.platformSettings.get('elevenlabs.api_key').catch(() => '')) as string;
      if (!elevenKey) { this.logger.warn('[media-stream] no ElevenLabs key; cannot speak'); return; }
      const voiceId = bot?.tts_voice_id || '21m00Tcm4TlvDq8ikWAM';

      speaking = true;
      ttsAbort = new AbortController();
      try {
        const res = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=ulaw_8000&optimize_streaming_latency=3`,
          { text: clean, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.8 } },
          {
            headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json', Accept: 'audio/basic' },
            responseType: 'stream',
            signal: ttsAbort.signal,
            timeout: 30000,
          },
        );
        await new Promise<void>((resolve, reject) => {
          res.data.on('data', (chunk: Buffer) => {
            if (!speaking || closed) return;
            for (let i = 0; i < chunk.length; i += 320) {
              const slice = chunk.subarray(i, i + 320);
              sendToTwilio({ event: 'media', streamSid, media: { payload: slice.toString('base64') } });
            }
          });
          res.data.on('end', () => resolve());
          res.data.on('error', reject);
        });
        sendToTwilio({ event: 'mark', streamSid, mark: { name: 'end-of-turn' } });
      } catch (e: any) {
        if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
          this.logger.warn(`[media-stream] TTS failed: ${e.message}`);
        }
      } finally {
        speaking = false;
      }
    };

    /** A finished user utterance → LLM reply → speak. */
    const onUserUtterance = (text: string) => {
      if (processing || closed || !bot || !aiCfg) return;
      processing = true;
      this.logger.log(`[media-stream] user said: "${text}"`);
      stopSpeaking();
      this.twilio.generateVoiceReply(bot, callSid, text, aiCfg!)
        .then(async ({ text: spoken, hangup }) => {
          if (spoken) await speak(spoken);
          if (hangup) setTimeout(() => { try { twilioWs.close(); } catch { /* ignore */ } }, 1500);
        })
        .catch((e) => this.logger.warn(`[media-stream] reply failed: ${e.message}`))
        .finally(() => { processing = false; });
    };

    /** Open the Deepgram streaming STT connection. */
    const openDeepgram = async () => {
      const dgKey = (await this.platformSettings.get('deepgram.api_key').catch(() => '')) as string;
      if (!dgKey) { this.logger.error('[media-stream] no Deepgram key configured'); return; }
      const lang = (bot?.language || 'es').slice(0, 2);
      const qs = new URLSearchParams({
        encoding: 'mulaw', sample_rate: '8000', channels: '1',
        model: 'nova-2', language: lang, smart_format: 'true',
        interim_results: 'true', vad_events: 'true',
        endpointing: '300', utterance_end_ms: '1000',
      });
      dgWs = new WebSocket(`wss://api.deepgram.com/v1/listen?${qs.toString()}`, {
        headers: { Authorization: `Token ${dgKey}` },
      });
      dgWs.on('open', () => this.logger.log(`[media-stream] Deepgram open (call ${callSid})`));
      dgWs.on('message', (raw: RawData) => {
        let msg: any;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg.type === 'SpeechStarted') { stopSpeaking(); return; }   // barge-in
        if (msg.type === 'Results') {
          const transcript: string = msg.channel?.alternatives?.[0]?.transcript ?? '';
          if (transcript && msg.is_final && msg.speech_final) onUserUtterance(transcript);
        }
      });
      dgWs.on('error', (e) => this.logger.warn(`[media-stream] Deepgram error: ${(e as any).message}`));
      dgWs.on('close', () => { dgWs = null; });
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      stopSpeaking();
      try { dgWs?.close(); } catch { /* ignore */ }
      try { twilioWs.close(); } catch { /* ignore */ }
      if (callSid) this.twilio.endVoiceSession(callSid);
    };

    twilioWs.on('message', async (raw: RawData) => {
      let data: any;
      try { data = JSON.parse(raw.toString()); } catch { return; }
      switch (data.event) {
        case 'start': {
          streamSid = data.start?.streamSid ?? '';
          callSid   = data.start?.callSid ?? '';
          const botId = data.start?.customParameters?.botId ?? '';
          this.logger.log(`[media-stream] start call=${callSid} bot=${botId}`);
          try {
            // getBot resolves the voice catalog (voice_catalog_id) into tts_provider/tts_voice_id,
            // so streaming uses the same ElevenLabs voice as the standard bot.
            bot = await this.twilio.getBot(botId);
            const ai = await this.platformSettings.getAI();
            aiCfg = { apiKey: ai.apiKey, provider: ai.provider, model: ai.model };
            this.logger.log(`[media-stream] bot loaded: ttsProvider=${bot?.tts_provider} voiceId=${bot?.tts_voice_id || '(default)'}`);
          } catch (e: any) { this.logger.error(`[media-stream] bot load failed: ${e.message}`); }
          await openDeepgram();
          const welcome = bot?.welcome_message || ((bot?.language || 'es').startsWith('es')
            ? 'Hola, ¿en qué puedo ayudarte?' : 'Hello, how can I help you?');
          await speak(welcome);
          break;
        }
        case 'media': {
          const payload = data.media?.payload;
          if (payload && dgWs?.readyState === WebSocket.OPEN) dgWs.send(Buffer.from(payload, 'base64'));
          break;
        }
        case 'stop': {
          this.logger.log(`[media-stream] stop call=${callSid}`);
          cleanup();
          break;
        }
      }
    });

    twilioWs.on('close', cleanup);
    twilioWs.on('error', cleanup);
  }
}
