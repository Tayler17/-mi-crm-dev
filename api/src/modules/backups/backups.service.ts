import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CronJob } from 'cron';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, statSync, unlinkSync, readdirSync } from 'fs';
import { createReadStream } from 'fs';
import { join } from 'path';
import { PlatformSettingsService } from '../settings/platform-settings.service';

const BACKUP_DIR = join(process.cwd(), 'backups');
const JOB_NAME   = 'auto-backup';

@Injectable()
export class BackupsService implements OnModuleInit {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
    await this.reschedule();
  }

  // ── Scheduling ─────────────────────────────────────────────────────────────

  async reschedule() {
    const cfg = await this.platformSettings.getBackup();

    // Remove existing job if any
    try { this.schedulerRegistry.deleteCronJob(JOB_NAME); } catch {}

    if (!cfg.enabled) { this.logger.log('Auto-backup disabled'); return; }

    const job = new CronJob(cfg.cron, async () => {
      this.logger.log(`[backup] cron fired (${cfg.cron})`);
      await this.runBackup('cron').catch((e) =>
        this.logger.error('[backup] cron run failed', e?.message),
      );
    });
    this.schedulerRegistry.addCronJob(JOB_NAME, job as any);
    job.start();
    this.logger.log(`Auto-backup scheduled: ${cfg.cron}`);
  }

  // ── Core backup logic ──────────────────────────────────────────────────────

  async runBackup(triggeredBy: 'cron' | 'manual'): Promise<string> {
    const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_${ts}.dump`;
    const filePath = join(BACKUP_DIR, filename);

    const [log] = await this.db.query(
      `INSERT INTO backup_logs (filename, status, triggered_by, storage)
       VALUES ($1, 'running', $2, 'local') RETURNING id`,
      [filename, triggeredBy],
    );
    const logId = log.id;
    const started = Date.now();

    try {
      await this.pgDump(filePath);

      const size = statSync(filePath).size;
      const cfg  = await this.platformSettings.getBackup();
      let storage = 'local';
      let storagePath = filePath;

      if (cfg.s3Bucket && cfg.s3AccessKey && cfg.s3SecretKey) {
        storagePath = await this.uploadToS3(filePath, filename, cfg);
        storage = 's3';
        unlinkSync(filePath); // remove local copy after S3 upload
      }

      await this.db.query(
        `UPDATE backup_logs
         SET status='success', size_bytes=$2, storage=$3, storage_path=$4,
             duration_ms=$5, completed_at=NOW()
         WHERE id=$1`,
        [logId, size, storage, storagePath, Date.now() - started],
      );

      await this.cleanup(cfg.retentionDays);
      this.logger.log(`[backup] completed: ${filename} (${Math.round(size / 1024)} KB)`);
      return logId;

    } catch (err: any) {
      await this.db.query(
        `UPDATE backup_logs SET status='failed', error_message=$2, duration_ms=$3, completed_at=NOW() WHERE id=$1`,
        [logId, err.message ?? String(err), Date.now() - started],
      );
      throw err;
    }
  }

  // ── pg_dump ────────────────────────────────────────────────────────────────

  private pgDump(outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) return reject(new Error('DATABASE_URL not set'));

      const args = [dbUrl, '-F', 'c', '-f', outputPath, '--no-password'];
      const proc = spawn('pg_dump', args, { env: { ...process.env } });

      let stderr = '';
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pg_dump exited ${code}: ${stderr.slice(0, 500)}`));
      });
      proc.on('error', (e) => reject(new Error(`pg_dump not found: ${e.message}`)));
    });
  }

  // ── S3 upload ──────────────────────────────────────────────────────────────

  private async uploadToS3(filePath: string, filename: string, cfg: Awaited<ReturnType<PlatformSettingsService['getBackup']>>): Promise<string> {
    const key = `${cfg.s3Prefix}${filename}`;

    // Lazy import — package is optional
    let S3Client: any, PutObjectCommand: any, Upload: any;
    try {
      // @ts-ignore optional package
      ({ S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3'));
      // @ts-ignore optional package
      ({ Upload } = await import('@aws-sdk/lib-storage'));
    } catch {
      throw new Error('@aws-sdk/client-s3 not installed — cannot upload to S3');
    }

    const client = new S3Client({
      region: cfg.s3Region,
      credentials: { accessKeyId: cfg.s3AccessKey, secretAccessKey: cfg.s3SecretKey },
    });

    const upload = new Upload({
      client,
      params: {
        Bucket: cfg.s3Bucket,
        Key:    key,
        Body:   createReadStream(filePath),
        ContentType: 'application/octet-stream',
      },
    });

    await upload.done();
    return `s3://${cfg.s3Bucket}/${key}`;
  }

  // ── Retention cleanup ──────────────────────────────────────────────────────

  private async cleanup(retentionDays: number) {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();

    // Delete old DB log entries
    const old: Array<{ id: string; storage: string; storage_path: string }> = await this.db.query(
      `SELECT id, storage, storage_path FROM backup_logs WHERE created_at < $1 AND status = 'success'`,
      [cutoff],
    );

    for (const row of old) {
      if (row.storage === 'local' && row.storage_path && existsSync(row.storage_path)) {
        try { unlinkSync(row.storage_path); } catch {}
      }
      await this.db.query(`DELETE FROM backup_logs WHERE id=$1`, [row.id]);
    }

    // Also remove orphaned local files not in DB
    if (existsSync(BACKUP_DIR)) {
      const dbFiles = new Set(
        (await this.db.query(`SELECT filename FROM backup_logs WHERE storage='local'`) as { filename: string }[])
          .map((r) => r.filename),
      );
      readdirSync(BACKUP_DIR).forEach((f) => {
        if (!dbFiles.has(f)) {
          try { unlinkSync(join(BACKUP_DIR, f)); } catch {}
        }
      });
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  async list() {
    return this.db.query(
      `SELECT id, filename, size_bytes, storage, status, triggered_by, error_message, duration_ms, created_at, completed_at
       FROM backup_logs ORDER BY created_at DESC LIMIT 100`,
    );
  }

  async deleteBackup(id: string) {
    const [row] = await this.db.query(`SELECT * FROM backup_logs WHERE id=$1`, [id]);
    if (!row) return;
    if (row.storage === 'local' && row.storage_path && existsSync(row.storage_path)) {
      try { unlinkSync(row.storage_path); } catch {}
    }
    await this.db.query(`DELETE FROM backup_logs WHERE id=$1`, [id]);
  }

  getFileStream(filename: string) {
    const filePath = join(BACKUP_DIR, filename);
    if (!existsSync(filePath)) return null;
    return { stream: createReadStream(filePath), size: statSync(filePath).size };
  }

  get backupDir() { return BACKUP_DIR; }
}
