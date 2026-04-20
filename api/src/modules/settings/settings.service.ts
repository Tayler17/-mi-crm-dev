import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class SettingsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async getSettings(tenantId: string) {
    const rows = await this.db.query(
      `SELECT id, name, slug, plan, is_active, logo_url, timezone, language, currency, settings, created_at
       FROM tenants WHERE id = $1`,
      [tenantId],
    );
    return rows[0] ?? null;
  }

  async updateSettings(tenantId: string, dto: any) {
    const allowed = ['name', 'logo_url', 'timezone', 'language', 'currency'];
    const sets: string[] = [];
    const values: any[] = [tenantId];
    let i = 2;

    for (const key of allowed) {
      if (dto[key] !== undefined) {
        sets.push(`${key} = $${i++}`);
        values.push(dto[key]);
      }
    }

    // merge JSONB settings — deep-merge aiKeys so individual keys aren't wiped
    if (dto.settings && typeof dto.settings === 'object') {
      const { aiKeys, ...rest } = dto.settings;
      if (Object.keys(rest).length > 0) {
        sets.push(`settings = settings || $${i++}`);
        values.push(JSON.stringify(rest));
      }
      if (aiKeys && typeof aiKeys === 'object') {
        // Build a patch object of only the non-empty keys, then merge into settings->'aiKeys'
        // using || so existing sibling keys are preserved.
        // jsonb_set with a nested path fails when the intermediate key doesn't exist yet,
        // so we merge the whole aiKeys object in one step instead.
        const aiKeysPatch: Record<string, string> = {};
        for (const [provider, key] of Object.entries(aiKeys)) {
          if (typeof key === 'string' && key) aiKeysPatch[provider] = key;
        }
        if (Object.keys(aiKeysPatch).length > 0) {
          sets.push(
            `settings = jsonb_set(settings, '{aiKeys}', COALESCE(settings->'aiKeys', '{}'::jsonb) || $${i++}::jsonb, true)`,
          );
          values.push(JSON.stringify(aiKeysPatch));
        }
      }
    }

    if (sets.length === 0) return this.getSettings(tenantId);

    sets.push(`updated_at = NOW()`);
    await this.db.query(
      `UPDATE tenants SET ${sets.join(', ')} WHERE id = $1`,
      values,
    );
    return this.getSettings(tenantId);
  }

  // ── Announcements ─────────────────────────────────────────────────────────────

  async getAnnouncements(tenantId: string) {
    return this.db.query(
      `SELECT a.*,
              u.full_name AS author_name,
              COUNT(ar.user_id)::int AS read_count
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id
       WHERE a.tenant_id = $1
       GROUP BY a.id, u.full_name
       ORDER BY a.created_at DESC`,
      [tenantId],
    );
  }

  async createAnnouncement(dto: any, tenantId: string, userId: string) {
    const rows = await this.db.query(
      `INSERT INTO announcements (tenant_id, title, body, type, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenantId, dto.title, dto.body, dto.type ?? 'info', dto.expiresAt ?? null, userId],
    );
    return rows[0];
  }

  async updateAnnouncement(id: string, dto: any, tenantId: string) {
    const rows = await this.db.query(
      `UPDATE announcements
       SET title = COALESCE($3, title),
           body = COALESCE($4, body),
           type = COALESCE($5, type),
           expires_at = COALESCE($6, expires_at),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId, dto.title, dto.body, dto.type, dto.expiresAt, dto.isActive],
    );
    return rows[0];
  }

  async deleteAnnouncement(id: string, tenantId: string) {
    await this.db.query(`DELETE FROM announcements WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  }

  async markAnnouncementRead(id: string, userId: string) {
    await this.db.query(
      `INSERT INTO announcement_reads (announcement_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, userId],
    );
    return { ok: true };
  }

  async getUnreadAnnouncements(tenantId: string, userId: string) {
    return this.db.query(
      `SELECT a.* FROM announcements a
       WHERE a.tenant_id = $1
         AND a.is_active = true
         AND (a.expires_at IS NULL OR a.expires_at > NOW())
         AND NOT EXISTS (
           SELECT 1 FROM announcement_reads ar
           WHERE ar.announcement_id = a.id AND ar.user_id = $2
         )
       ORDER BY a.created_at DESC`,
      [tenantId, userId],
    );
  }
}
