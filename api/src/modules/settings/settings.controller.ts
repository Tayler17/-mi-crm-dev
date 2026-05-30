import { Controller, Get, Patch, Post, Delete, Param, Body, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PlatformSettingsService } from './platform-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import * as nodemailer from 'nodemailer';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(
    private readonly svc: SettingsService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  // ── Platform settings (owner only) ───────────────────────────────────────────

  @Get('platform')
  async getPlatformSettings(@Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    return this.platformSettings.getAll();
  }

  @Patch('platform')
  async updatePlatformSettings(@Body() dto: Record<string, string>, @Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    await this.platformSettings.setMultiple(dto);
    return this.platformSettings.getAll();
  }

  /** Send a test email using the current platform SMTP settings */
  @Post('platform/test-smtp')
  async testSmtp(@Body() body: { to?: string }, @Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    const smtp = await this.platformSettings.getSMTP().catch(() => null);
    if (!smtp?.host || smtp.host === 'mailhog') {
      return { ok: false, error: 'No hay SMTP configurado en Platform Settings. Configura host, user y password primero.' };
    }
    try {
      const transport = nodemailer.createTransport({
        host:   smtp.host,
        port:   smtp.port,
        secure: smtp.secure,
        auth:   smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
        tls:    { rejectUnauthorized: false },
      });
      await transport.verify();
      const to = body.to || smtp.user || smtp.from;
      await transport.sendMail({
        from:    smtp.from || smtp.user,
        to,
        subject: '✅ Prueba SMTP — AutoMarkIQ',
        html:    `<p>El servidor SMTP está correctamente configurado.<br><br><b>Host:</b> ${smtp.host}:${smtp.port}<br><b>Usuario:</b> ${smtp.user}</p>`,
      });
      return { ok: true, message: `Email de prueba enviado a ${to}` };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  // ── Tenant settings ───────────────────────────────────────────────────────────

  @Get()
  getSettings(@TenantId() tenantId: string) {
    return this.svc.getSettings(tenantId);
  }

  @Patch()
  updateSettings(@Body() dto: any, @TenantId() tenantId: string) {
    return this.svc.updateSettings(tenantId, dto);
  }

  // ── Announcements ─────────────────────────────────────────────────────────────

  @Get('announcements')
  getAnnouncements(@TenantId() tenantId: string) {
    return this.svc.getAnnouncements(tenantId);
  }

  @Get('announcements/unread')
  getUnread(@TenantId() tenantId: string, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.svc.getUnreadAnnouncements(tenantId, userId);
  }

  // Owner: list all system-level announcements (broadcasts)
  @Get('system-announcements')
  getSystemAnnouncements(@Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    return this.svc.getSystemAnnouncements();
  }

  @Post('announcements')
  createAnnouncement(@Body() dto: any, @TenantId() tenantId: string, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    // Only owner can create system-level announcements
    if (dto.isSystem && req.user?.role !== 'owner') {
      throw new ForbiddenException('Solo el owner puede crear anuncios del sistema');
    }
    return this.svc.createAnnouncement(dto, tenantId, userId);
  }

  @Patch('announcements/:id')
  updateAnnouncement(@Param('id') id: string, @Body() dto: any, @TenantId() tenantId: string) {
    return this.svc.updateAnnouncement(id, dto, tenantId);
  }

  @Delete('announcements/:id')
  deleteAnnouncement(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.deleteAnnouncement(id, tenantId);
  }

  @Post('announcements/:id/read')
  markRead(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.svc.markAnnouncementRead(id, userId);
  }
}
