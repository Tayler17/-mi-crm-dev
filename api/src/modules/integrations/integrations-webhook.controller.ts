import { Controller, Post, Param, Body, HttpCode } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';

/**
 * Public inbound-webhook receiver. No auth guard — the per-tenant secret in the
 * URL path identifies the tenant. The tenant pastes this URL into the provider
 * (e.g. Dentally → Settings → Webhooks).
 *
 *   POST /integrations/:provider/webhook/:secret
 */
@Controller('integrations')
export class IntegrationsWebhookController {
  constructor(private readonly svc: IntegrationsService) {}

  @Post(':provider/webhook/:secret')
  @HttpCode(200)
  receive(@Param('provider') provider: string, @Param('secret') secret: string, @Body() payload: any) {
    // Always 200 so the provider doesn't retry/disable the hook on our errors.
    return this.svc.handleInboundWebhook(provider, secret, payload).catch(() => ({ ok: true }));
  }
}
