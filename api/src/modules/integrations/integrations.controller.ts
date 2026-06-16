import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  /** Connectors available to connect */
  @Get('catalog')
  catalog() {
    return this.svc.catalog();
  }

  /** Tenant's connected integrations (no credentials returned) */
  @Get()
  list(@TenantId() tenantId: string) {
    return this.svc.list(tenantId);
  }

  /** Connect / update a provider (admin/owner only) */
  @Post(':provider')
  connect(@Param('provider') provider: string, @Body() config: Record<string, any>, @TenantId() tenantId: string, @Request() req: any) {
    if (req.user?.role === 'agent') throw new ForbiddenException('Solo administradores pueden gestionar integraciones.');
    return this.svc.connect(tenantId, provider, config ?? {});
  }

  /** Re-test an existing connection */
  @Post(':provider/test')
  test(@Param('provider') provider: string, @TenantId() tenantId: string, @Request() req: any) {
    if (req.user?.role === 'agent') throw new ForbiddenException();
    return this.svc.test(tenantId, provider);
  }

  /** Import contacts/patients from the external system into CRM contacts */
  @Post(':provider/sync')
  sync(@Param('provider') provider: string, @TenantId() tenantId: string, @Request() req: any) {
    if (req.user?.role === 'agent') throw new ForbiddenException('Solo administradores pueden importar contactos.');
    return this.svc.syncContacts(tenantId, provider);
  }

  /** Phase 3: bookable professionals */
  @Get(':provider/practitioners')
  practitioners(@Param('provider') provider: string, @TenantId() tenantId: string) {
    return this.svc.listPractitioners(tenantId, provider);
  }

  /** Phase 3: open slots for a practitioner over a date range */
  @Get(':provider/availability')
  availability(
    @Param('provider') provider: string,
    @TenantId() tenantId: string,
    @Query('practitionerId') practitionerId: string,
    @Query('startDate') startDate: string,
    @Query('finishDate') finishDate: string,
    @Query('duration') duration?: string,
  ) {
    return this.svc.listAvailability(tenantId, provider, {
      practitionerId, startDate, finishDate,
      durationMinutes: duration ? Number(duration) : undefined,
    });
  }

  /** Phase 3: book an appointment for a CRM contact */
  @Post(':provider/appointments')
  book(@Param('provider') provider: string, @Body() body: any, @TenantId() tenantId: string, @Request() req: any) {
    if (req.user?.role === 'agent') throw new ForbiddenException('Solo administradores pueden agendar citas.');
    return this.svc.bookAppointment(tenantId, provider, body ?? {});
  }

  /** Phase 4: webhook URL + status for this tenant */
  @Get(':provider/webhook')
  webhookInfo(@Param('provider') provider: string, @TenantId() tenantId: string) {
    return this.svc.webhookInfo(tenantId, provider);
  }

  /** Phase 4: enable webhooks — returns the URL to paste into the provider */
  @Post(':provider/webhook')
  enableWebhook(@Param('provider') provider: string, @TenantId() tenantId: string, @Request() req: any) {
    if (req.user?.role === 'agent') throw new ForbiddenException();
    return this.svc.enableWebhook(tenantId, provider);
  }

  /** Disconnect a provider */
  @Delete(':provider')
  disconnect(@Param('provider') provider: string, @TenantId() tenantId: string, @Request() req: any) {
    if (req.user?.role === 'agent') throw new ForbiddenException();
    return this.svc.disconnect(tenantId, provider);
  }
}
