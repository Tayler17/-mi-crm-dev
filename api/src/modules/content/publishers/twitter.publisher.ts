import { Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { ContentPost } from '../entities/content-post.entity';

const API_URL = 'https://api.twitter.com/2/tweets';
const log = new Logger('TwitterPublisher');

/**
 * Publishes a ContentPost to Twitter/X via API v2.
 *
 * Credentials (from PlatformSettingsService.getTwitter()):
 *   apiKey       – OAuth 1.0a Consumer Key
 *   apiSecret    – OAuth 1.0a Consumer Secret
 *   accessToken  – OAuth 1.0a Access Token (granted to the app's own account)
 *   accessSecret – OAuth 1.0a Access Token Secret
 */
export async function publishToTwitter(
  post: ContentPost,
  credentials: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string },
): Promise<{ platformPostId: string }> {
  const { apiKey, apiSecret, accessToken, accessSecret } = credentials;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error('Twitter: faltan credenciales (api_key, api_secret, access_token, access_secret) en la configuración de plataforma');
  }

  const text = buildTweet(post);
  const body = JSON.stringify({ text });

  const authHeader = buildOauth1Header(apiKey, apiSecret, accessToken, accessSecret, API_URL, 'POST');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body,
  });

  const data: any = await res.json();

  if (!data?.data?.id) {
    throw new Error(`Twitter: error al publicar — ${JSON.stringify(data)}`);
  }

  log.log(`Post ${post.id} publicado en Twitter/X: tweet_id=${data.data.id}`);
  return { platformPostId: data.data.id };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds tweet text from post. Truncates to 280 chars. */
function buildTweet(post: ContentPost): string {
  const parts: string[] = [];
  if (post.title) parts.push(post.title);
  if (post.body)  parts.push(post.body);
  if (post.tags?.length) {
    parts.push(post.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '));
  }
  return parts.join('\n\n').slice(0, 280);
}

/**
 * Builds an OAuth 1.0a Authorization header for Twitter API v2.
 *
 * Spec: https://developer.twitter.com/en/docs/authentication/oauth-1-0a/authorizing-a-request
 * Note: JSON body is NOT included in the signature base string (not form-encoded).
 */
function buildOauth1Header(
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string,
  url: string,
  method: string,
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');

  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     consumerKey,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        timestamp,
    oauth_token:            accessToken,
    oauth_version:          '1.0',
  };

  // Percent-encode key=value pairs and sort lexicographically
  const paramStr = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${pctEncode(k)}=${pctEncode(v)}`)
    .join('&');

  // Signature base string
  const baseString = [
    method.toUpperCase(),
    pctEncode(url),
    pctEncode(paramStr),
  ].join('&');

  // Signing key
  const signingKey = `${pctEncode(consumerSecret)}&${pctEncode(accessTokenSecret)}`;
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams['oauth_signature'] = signature;

  // Build Authorization header
  const headerParts = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${pctEncode(k)}="${pctEncode(v)}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}

/** RFC 3986 percent-encoding (stricter than encodeURIComponent). */
function pctEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g,  '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g,  '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}
