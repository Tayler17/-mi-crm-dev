import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { execSync } from 'child_process';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue('bot-messages') private readonly botQueue: Queue,
  ) {}

  // Public ping — used by external uptime monitors
  @Get('ping')
  ping() {
    return { ok: true, ts: new Date().toISOString() };
  }

  // Full health check — protected (admin only)
  @Get()
  @UseGuards(JwtAuthGuard)
  async check() {
    const checks: Record<string, any> = {};

    // ── Database ──────────────────────────────────────────────────────────
    try {
      const t0 = Date.now();
      await this.db.query('SELECT 1');
      checks.database = { ok: true, latencyMs: Date.now() - t0 };
    } catch (e: any) {
      checks.database = { ok: false, error: e.message };
    }

    // ── Redis / BullMQ ────────────────────────────────────────────────────
    try {
      const t0 = Date.now();
      await this.botQueue.getJobCounts();
      checks.redis = { ok: true, latencyMs: Date.now() - t0 };
    } catch (e: any) {
      checks.redis = { ok: false, error: e.message };
    }

    // ── Queue depth ───────────────────────────────────────────────────────
    try {
      const counts = await this.botQueue.getJobCounts('waiting', 'active', 'failed');
      checks.queue = { ok: true, ...counts };
    } catch {
      checks.queue = { ok: false };
    }

    // ── DB stats ──────────────────────────────────────────────────────────
    try {
      const [stats] = await this.db.query(`
        SELECT
          (SELECT COUNT(*) FROM tenants)::int           AS tenants,
          (SELECT COUNT(*) FROM conversations
           WHERE status='open')::int                    AS open_conversations,
          (SELECT COUNT(*) FROM messages
           WHERE created_at > NOW() - INTERVAL '1 hour')::int AS messages_last_hour,
          (SELECT COUNT(*) FROM channel_connections
           WHERE is_active=true)::int                   AS active_connections
      `);
      checks.stats = stats;
    } catch {}

    // ── Disk (Linux only) ────────────────────────────────────────────────
    try {
      const df = execSync("df -h / | tail -1 | awk '{print $3\"|\"$4\"|\"$5}'", { timeout: 3000 }).toString().trim();
      const [used, avail, pct] = df.split('|');
      checks.disk = { used, available: avail, usedPercent: pct };
    } catch {
      checks.disk = { ok: false };
    }

    const allOk = checks.database?.ok && checks.redis?.ok;
    return { ok: allOk, ts: new Date().toISOString(), checks };
  }
}
