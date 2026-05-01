import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const TTS_DIR = '/app/uploads/tts';
const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';

// Popular multilingual voices — shown in the UI selector
export const ELEVENLABS_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (EN, neutral)' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (EN, male)' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (EN, female)' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (EN, soft)' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian (EN, deep)' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica (ES, female)' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris (ES, male)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (ES, authoritative)' },
];

function httpsPost(url: string, body: Buffer | string, headers: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'POST', headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`ElevenLabs ${res.statusCode}: ${buf.toString().slice(0, 200)}`));
          } else {
            resolve(buf);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

@Injectable()
export class ElevenLabsTtsService {
  private readonly logger = new Logger(ElevenLabsTtsService.name);

  constructor() {
    fs.mkdirSync(TTS_DIR, { recursive: true });
  }

  /**
   * Generates speech audio via ElevenLabs and saves it to disk.
   * Returns the filename (callers build the public URL themselves).
   * Throws on API error — caller falls back to Twilio <Say>.
   */
  async generateAudio(text: string, apiKey: string, voiceId: string): Promise<string> {
    const cleanText = text.replace(/[<>]/g, '').slice(0, 500);
    const voiceIdResolved = voiceId || ELEVENLABS_VOICES[0].id;

    const bodyJson = JSON.stringify({
      text: cleanText,
      model_id: 'eleven_turbo_v2_5',   // lowest latency multilingual model
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
    });

    const audioBuffer = await httpsPost(
      `${ELEVENLABS_API}/text-to-speech/${voiceIdResolved}?output_format=mp3_44100_128`,
      bodyJson,
      {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyJson).toString(),
      },
    );

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
    fs.writeFileSync(path.join(TTS_DIR, filename), audioBuffer);
    this.logger.log(`[ElevenLabs] Generated ${filename} (${audioBuffer.length} bytes)`);
    return filename;
  }

  /** Delete a previously generated file (called after call ends). */
  cleanup(filename: string) {
    try { fs.unlinkSync(path.join(TTS_DIR, filename)); } catch { /* already gone */ }
  }

  /** Sweep files older than maxAgeMs (default 10 min). */
  sweepOld(maxAgeMs = 10 * 60 * 1000) {
    try {
      const now = Date.now();
      for (const f of fs.readdirSync(TTS_DIR)) {
        const fp = path.join(TTS_DIR, f);
        const { mtimeMs } = fs.statSync(fp);
        if (now - mtimeMs > maxAgeMs) fs.unlinkSync(fp);
      }
    } catch { /* best-effort */ }
  }
}
