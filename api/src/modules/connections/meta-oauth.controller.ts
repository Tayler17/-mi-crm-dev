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
  private static readonly GRAPH_API = 'https://graph.facebook.com/v21.0';

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

    // Scopes for Messenger + Instagram (only standard scopes; instagram_business_*
    // require Meta App Review and are invalid for most apps in the OAuth dialog)
    const scope = [
      'public_profile',
      'business_management',
      'pages_show_list',
      'pages_messaging',
      'pages_read_engagement',
      'pages_manage_metadata',
      'instagram_basic',
      'instagram_manage_messages',
    ].join(',');

    const url =
      `https://www.facebook.com/dialog/oauth` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&scope=${scope}` +
      `&response_type=code` +
      `&auth_type=rerequest`;

    this.logger.log(`Meta OAuth: redirecting to FB dialog (type=${type || 'facebook'}, tenant=${tenantId})`);
    return res.redirect(url);
  }

  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_reason') errorReason: string,
    @Res() res: any,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    if (error || !code) {
      this.logger.warn(`Meta OAuth error: ${error} / ${errorReason}`);
      return res.redirect(
        `${frontendUrl}/connections?oauth_error=${encodeURIComponent(error ?? 'cancelled')}`,
      );
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

      if (!appSecret) {
        this.logger.error('Meta App Secret not configured in platform settings');
        return res.redirect(`${frontendUrl}/connections?oauth_error=${encodeURIComponent('App Secret no configurado. Ve a Configuración → Plataforma → Meta.')}`);
      }

      // Exchange code for user access token
      const tokenUrl =
        `${MetaOAuthController.GRAPH_API}/oauth/access_token` +
        `?client_id=${appId}&client_secret=${appSecret}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;

      const tokenRes = await (globalThis as any).fetch(tokenUrl, { signal: AbortSignal.timeout(10000) });
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        const errMsg = tokenData.error?.message ?? 'token_error';
        this.logger.error(`Meta token exchange failed: ${JSON.stringify(tokenData)}`);
        return res.redirect(`${frontendUrl}/connections?oauth_error=${encodeURIComponent(errMsg)}`);
      }

      const userToken = tokenData.access_token;
      this.logger.log(`Meta token exchange ok (type=${parsed.type})`);

      // Fetch pages the user manages
      const pagesUrl =
        `${MetaOAuthController.GRAPH_API}/me/accounts` +
        `?fields=id,name,access_token,instagram_business_account` +
        `&access_token=${userToken}`;

      const pagesRes = await (globalThis as any).fetch(pagesUrl, { signal: AbortSignal.timeout(10000) });
      const pagesData = await pagesRes.json();

      this.logger.log(`Meta /me/accounts response: ${JSON.stringify({ count: pagesData.data?.length, error: pagesData.error })}`);

      if (pagesData.error) {
        const errMsg = pagesData.error.message ?? 'pages_error';
        this.logger.error(`Meta /me/accounts error: ${JSON.stringify(pagesData.error)}`);
        return res.redirect(`${frontendUrl}/connections?oauth_error=${encodeURIComponent(errMsg)}`);
      }

      const pages: any[] = pagesData.data ?? [];

      if (!pages.length) {
        this.logger.warn(`Meta /me/accounts returned 0 pages for tenant=${parsed.tenantId}`);
        return res.redirect(`${frontendUrl}/connections?oauth_error=no_pages`);
      }

      // For Instagram, also include the linked IG account ID
      const enriched = pages.map((p: any) => ({
        pageId:      p.id,
        pageName:    p.name,
        accessToken: p.access_token,
        igAccountId: p.instagram_business_account?.id ?? null,
      }));

      this.logger.log(`Meta OAuth success: ${enriched.length} pages for tenant=${parsed.tenantId}`);

      const encoded = Buffer.from(
        JSON.stringify({
          pages: enriched,
          type: parsed.type,
          tenantId: parsed.tenantId,
          inboxId: parsed.inboxId,
        }),
      ).toString('base64url');

      return res.redirect(`${frontendUrl}/connections?meta_pages=${encoded}`);
    } catch (e: any) {
      this.logger.error(`Meta OAuth callback error: ${e.message}`);
      return res.redirect(`${frontendUrl}/connections?oauth_error=${encodeURIComponent(e.message)}`);
    }
  }
}
