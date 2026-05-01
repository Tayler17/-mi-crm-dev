import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { PlatformSettingsService } from '../settings/platform-settings.service';

/**
 * Handles Meta (Facebook/Instagram) OAuth 2.0 flow.
 * No JWT guard — these endpoints are browser-facing redirects.
 *
 * Flow:
 *  1. Frontend opens /connections/meta/oauth?type=facebook&tenantId=X&inboxId=Y
 *  2. This controller redirects to Facebook's OAuth dialog
 *  3. Facebook redirects back to /connections/meta/callback?code=...&state=...
 *  4. We exchange the code for a page access token and list the user's pages
 *  5. Redirect to the frontend with the pages encoded in the URL
 *  6. Frontend shows a page picker modal, user selects a page → POST /connections
 */
@Controller('connections/meta')
export class MetaOAuthController {
  private readonly logger = new Logger(MetaOAuthController.name);

  constructor(private readonly platformSettings: PlatformSettingsService) {}

  @Get('oauth')
  async initiateOAuth(
    @Query('type') type: string,
    @Query('tenantId') tenantId: string,
    @Query('inboxId') inboxId: string,
    @Res() res: any,
  ) {
    const { appId } = await this.platformSettings.getMeta();
    const apiUrl = process.env.API_PUBLIC_URL ?? 'http://localhost:4000';
    const redirectUri = `${apiUrl}/connections/meta/callback`;

    if (!appId) {
      return res.status(500).send('META_APP_ID no configurado. Ve a Configuración → Plataforma para añadirlo.');
    }

    const state = Buffer.from(
      JSON.stringify({ type: type || 'facebook', tenantId, inboxId, ts: Date.now() }),
    ).toString('base64url');

    // Instagram also requires these scopes via a linked Facebook page
    const scope = [
      'pages_messaging',
      'pages_show_list',
      'pages_read_engagement',
      'instagram_basic',
      'instagram_manage_messages',
    ].join(',');

    const url =
      `https://www.facebook.com/dialog/oauth` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&scope=${scope}` +
      `&response_type=code`;

    return res.redirect(url);
  }

  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: any,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    if (error || !code) {
      this.logger.warn(`Meta OAuth error: ${error}`);
      return res.redirect(`${frontendUrl}/connections?oauth_error=${encodeURIComponent(error ?? 'cancelled')}`);
    }

    let parsed: { type: string; tenantId: string; inboxId?: string } = { type: 'facebook', tenantId: '' };
    try {
      parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return res.redirect(`${frontendUrl}/connections?oauth_error=invalid_state`);
    }

    try {
      const { appId, appSecret } = await this.platformSettings.getMeta();
      const apiUrl = process.env.API_PUBLIC_URL ?? 'http://localhost:4000';
      const redirectUri = `${apiUrl}/connections/meta/callback`;

      // Exchange code for user access token
      const tokenRes = await (globalThis as any).fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token` +
        `?client_id=${appId}&client_secret=${appSecret}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        this.logger.error(`Meta token exchange failed: ${JSON.stringify(tokenData)}`);
        return res.redirect(`${frontendUrl}/connections?oauth_error=${encodeURIComponent(tokenData.error?.message ?? 'token_error')}`);
      }

      const userToken = tokenData.access_token;

      // Fetch pages the user manages (each page has its own access token)
      const pagesRes = await (globalThis as any).fetch(
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userToken}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const pagesData = await pagesRes.json();
      const pages: any[] = pagesData.data ?? [];

      if (!pages.length) {
        return res.redirect(`${frontendUrl}/connections?oauth_error=no_pages`);
      }

      // For Instagram, also fetch the linked IG account id
      const enriched = pages.map((p: any) => ({
        pageId:        p.id,
        pageName:      p.name,
        accessToken:   p.access_token,
        igAccountId:   p.instagram_business_account?.id ?? null,
      }));

      const encoded = Buffer.from(
        JSON.stringify({ pages: enriched, type: parsed.type, tenantId: parsed.tenantId, inboxId: parsed.inboxId }),
      ).toString('base64url');

      return res.redirect(`${frontendUrl}/connections?meta_pages=${encoded}`);
    } catch (e: any) {
      this.logger.error(`Meta OAuth callback error: ${e.message}`);
      return res.redirect(`${frontendUrl}/connections?oauth_error=${encodeURIComponent(e.message)}`);
    }
  }
}
