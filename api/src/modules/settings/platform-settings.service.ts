import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export const PLATFORM_KEYS = [
  'ai.provider',
  'ai.api_key',
  'ai.model',
  'voice.provider',
  'voice.account_sid',
  'voice.auth_token',
  'voice.phone_numbers',
  'meta.app_id',
  'meta.app_secret',
  'meta.verify_token',
  'elevenlabs.api_key',
  'stripe.secret_key',
  'stripe.webhook_secret',
  'stripe.publishable_key',
  'backup.enabled',
  'backup.cron',
  'backup.retention_days',
  'backup.s3_bucket',
  'backup.s3_region',
  'backup.s3_access_key',
  'backup.s3_secret_key',
  'backup.s3_prefix',
] as const;

export type PlatformKey = (typeof PLATFORM_KEYS)[number];

const SENSITIVE = new Set<PlatformKey>(['ai.api_key', 'voice.auth_token', 'meta.app_secret', 'meta.verify_token', 'elevenlabs.api_key', 'stripe.secret_key', 'stripe.webhook_secret', 'backup.s3_secret_key']);
const MASK = '••••••••';

/** Maps each platform key to its env-var fallback (for local dev / initial setup). */
const ENV_FALLBACKS: Record<PlatformKey, string> = {
  'ai.provider':       'PLATFORM_AI_PROVIDER',
  'ai.api_key':        'PLATFORM_AI_API_KEY',
  'ai.model':          'PLATFORM_AI_MODEL',
  'voice.provider':       'VOICE_PROVIDER',
  'voice.account_sid':    'TWILIO_ACCOUNT_SID',
  'voice.auth_token':     'TWILIO_AUTH_TOKEN',
  'voice.phone_numbers':  'TWILIO_PHONE_NUMBERS',
  'meta.app_id':          'META_APP_ID',
  'meta.app_secret':      'META_APP_SECRET',
  'meta.verify_token':    'META_WEBHOOK_VERIFY_TOKEN',
  'elevenlabs.api_key':   'ELEVENLABS_API_KEY',
  'stripe.secret_key':     'STRIPE_SECRET_KEY',
  'stripe.webhook_secret': 'STRIPE_WEBHOOK_SECRET',
  'stripe.publishable_key':'STRIPE_PUBLISHABLE_KEY',
  'backup.enabled':        'BACKUP_ENABLED',
  'backup.cron':           'BACKUP_CRON',
  'backup.retention_days': 'BACKUP_RETENTION_DAYS',
  'backup.s3_bucket':      'BACKUP_S3_BUCKET',
  'backup.s3_region':      'BACKUP_S3_REGION',
  'backup.s3_access_key':  'BACKUP_S3_ACCESS_KEY',
  'backup.s3_secret_key':  'BACKUP_S3_SECRET_KEY',
  'backup.s3_prefix':      'BACKUP_S3_PREFIX',
};

@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private cache: Partial<Record<PlatformKey, string>> = {};
  private cacheExpiry = 0;

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Get a single setting value. Falls back to env var if not in DB. */
  async get(key: PlatformKey): Promise<string> {
    await this.loadCache();
    const dbValue = this.cache[key];
    if (dbValue) return dbValue;
    const envKey = ENV_FALLBACKS[key];
    return envKey ? (process.env[envKey] ?? '') : '';
  }

  /** Get AI credentials in one shot (used by bot service on every call). */
  async getAI(): Promise<{ apiKey: string; provider: string; model: string }> {
    await this.loadCache();
    return {
      apiKey:   await this.get('ai.api_key'),
      provider: (await this.get('ai.provider')) || 'openai',
      model:    await this.get('ai.model'),
    };
  }

  /** Get Meta (Facebook/Instagram) credentials in one shot. */
  async getMeta(): Promise<{ appId: string; appSecret: string; verifyToken: string }> {
    await this.loadCache();
    return {
      appId:       await this.get('meta.app_id'),
      appSecret:   await this.get('meta.app_secret'),
      verifyToken: (await this.get('meta.verify_token')) || 'automarkiq_meta_webhook',
    };
  }

  /** Get backup configuration in one shot. */
  async getBackup(): Promise<{
    enabled: boolean; cron: string; retentionDays: number;
    s3Bucket: string; s3Region: string; s3AccessKey: string; s3SecretKey: string; s3Prefix: string;
  }> {
    await this.loadCache();
    return {
      enabled:       (await this.get('backup.enabled')) === 'true',
      cron:          (await this.get('backup.cron'))    || '0 2 * * *',
      retentionDays: parseInt(await this.get('backup.retention_days')) || 7,
      s3Bucket:      await this.get('backup.s3_bucket'),
      s3Region:      (await this.get('backup.s3_region')) || 'us-east-1',
      s3AccessKey:   await this.get('backup.s3_access_key'),
      s3SecretKey:   await this.get('backup.s3_secret_key'),
      s3Prefix:      (await this.get('backup.s3_prefix')) || 'backups/',
    };
  }

  /** Get Stripe credentials in one shot. */
  async getStripe(): Promise<{ secretKey: string; webhookSecret: string; publishableKey: string }> {
    await this.loadCache();
    return {
      secretKey:      await this.get('stripe.secret_key'),
      webhookSecret:  await this.get('stripe.webhook_secret'),
      publishableKey: await this.get('stripe.publishable_key'),
    };
  }

  /** Get voice/Twilio credentials in one shot (used by outbound calls). */
  async getVoice(): Promise<{ provider: string; accountSid: string; authToken: string }> {
    await this.loadCache();
    return {
      provider:   (await this.get('voice.provider')) || 'twilio',
      accountSid: await this.get('voice.account_sid'),
      authToken:  await this.get('voice.auth_token'),
    };
  }

  /** Returns the list of Twilio phone numbers owned by the platform. */
  async getPhoneNumbers(): Promise<string[]> {
    const raw = await this.get('voice.phone_numbers');
    if (!raw) return [];
    return raw.split(',').map((n) => n.trim()).filter(Boolean);
  }

  /** Returns phone numbers not yet assigned to any active call bot. */
  async getAvailablePhoneNumbers(db: DataSource): Promise<string[]> {
    const all = await this.getPhoneNumbers();
    if (!all.length) return [];
    const used: Array<{ phone_number: string }> = await db.query(
      `SELECT phone_number FROM call_bots WHERE phone_number IS NOT NULL AND status != 'deleted'`,
    );
    const usedSet = new Set(used.map((r) => r.phone_number));
    return all.filter((n) => !usedSet.has(n));
  }

  /**
   * Returns all settings for the admin UI.
   * Sensitive values are masked unless they're being freshly read for internal use.
   */
  async getAll(): Promise<Record<PlatformKey, { value: string; masked: boolean; fromEnv: boolean }>> {
    await this.loadCache();
    const result = {} as Record<PlatformKey, { value: string; masked: boolean; fromEnv: boolean }>;

    for (const key of PLATFORM_KEYS) {
      const dbValue  = this.cache[key] ?? '';
      const envValue = process.env[ENV_FALLBACKS[key]] ?? '';
      const raw      = dbValue || envValue;
      const fromEnv  = !dbValue && !!envValue;
      const sensitive = SENSITIVE.has(key);

      result[key] = {
        value:   sensitive && raw ? MASK : raw,
        masked:  sensitive && !!raw,
        fromEnv,
      };
    }
    return result;
  }

  /**
   * Upsert multiple settings. Skips masked values (unchanged) and empty values (delete → fall back to env).
   */
  async setMultiple(settings: Partial<Record<string, string>>): Promise<void> {
    const updates = Object.entries(settings).filter(
      ([k, v]) => PLATFORM_KEYS.includes(k as PlatformKey) && v !== undefined && v !== MASK,
    );

    for (const [key, value] of updates) {
      if (!value) {
        await this.db.query(`DELETE FROM platform_settings WHERE key = $1`, [key]).catch(() => {});
      } else {
        await this.db.query(
          `INSERT INTO platform_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, value],
        );
      }
    }
    this.invalidateCache();
  }

  invalidateCache(): void {
    this.cacheExpiry = 0;
  }

  private async loadCache(): Promise<void> {
    if (Date.now() < this.cacheExpiry) return;
    try {
      const rows: Array<{ key: string; value: string }> = await this.db.query(
        `SELECT key, value FROM platform_settings`,
      );
      this.cache = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Record<PlatformKey, string>>;
      this.cacheExpiry = Date.now() + 5 * 60 * 1000; // 5-min TTL
    } catch (err) {
      this.logger.error(`Failed to load platform settings: ${err}`);
      this.cache = {};
      this.cacheExpiry = Date.now() + 30_000; // retry in 30s
    }
  }
}
