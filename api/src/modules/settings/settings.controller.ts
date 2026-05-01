import { Controller, Get, Patch, Post, Delete, Param, Body, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PlatformSettingsService } from './platform-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

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
