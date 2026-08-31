import { Logger } from '@nestjs/common';
import { ContentPost } from '../entities/content-post.entity';

const GQL = 'https://graph.facebook.com/v19.0';
const log = new Logger('InstagramPublisher');

/**
 * Publishes a ContentPost to an Instagram Business Account via Meta Graph API.
 *
 * Credentials expected (from Connection entity):
 *   accessToken  – Page access token with instagram_basic + instagram_content_publish scopes
 *   pageId       – Facebook Page ID linked to the Instagram Business Account
 */
export async function publishToInstagram(
  post: ContentPost,
  credentials: Record<string, any>,
): Promise<{ platformPostId: string }> {
  const { accessToken, pageId, igAccountId } = credentials;
  if (!accessToken) throw new Error('Instagram: falta accessToken en la conexión');

  // Resolve the Instagram Business Account id:
  //  1) use igAccountId if stored;
  //  2) if the stored id is already an IG account id (17841…), use it directly;
  //  3) else resolve it from a Facebook Page id.
  let igUserId: string | undefined = igAccountId;
  if (!igUserId && pageId && String(pageId).startsWith('17841')) igUserId = String(pageId);
  if (!igUserId && pageId) {
    const igRes = await fetch(`${GQL}/${pageId}?fields=instagram_business_account&access_token=${accessToken}`);
    const igData = await igRes.json();
    igUserId = igData?.instagram_business_account?.id;
  }
  if (!igUserId) throw new Error('Instagram: no se encontró la cuenta de Instagram Business (revisa la conexión).');

  // Step 2 — build caption (title + body + hashtags)
  const caption = buildCaption(post);

  // Step 3 — create media container
  const containerParams = new URLSearchParams({ caption, access_token: accessToken });
  if (post.mediaUrl) {
    // Instagram must FETCH the image → it needs a public https URL, not a local path.
    const base = process.env.API_PUBLIC_URL || 'https://api.automarkiq.com';
    const imageUrl = /^https?:\/\//.test(post.mediaUrl) ? post.mediaUrl : `${base}${post.mediaUrl}`;
    containerParams.set('image_url', imageUrl);
  } else {
    // Instagram requires media; fall back to text-as-caption with a 1×1 placeholder
    throw new Error('Instagram: se requiere una imagen para publicar (añade media al post)');
  }

  const containerRes = await fetch(`${GQL}/${igUserId}/media`, {
    method: 'POST',
    body: containerParams,
  });
  const container = await containerRes.json();
  if (!container?.id) {
    throw new Error(`Instagram: error al crear el container — ${JSON.stringify(container)}`);
  }

  // Brief wait for the container to be ready (Meta recommends polling, but 1 s is usually enough)
  await sleep(1000);

  // Step 4 — publish the container
  const publishParams = new URLSearchParams({ creation_id: container.id, access_token: accessToken });
  const publishRes = await fetch(`${GQL}/${igUserId}/media_publish`, {
    method: 'POST',
    body: publishParams,
  });
  const published = await publishRes.json();
  if (!published?.id) {
    throw new Error(`Instagram: error al publicar — ${JSON.stringify(published)}`);
  }

  log.log(`Post ${post.id} publicado en Instagram: media_id=${published.id}`);
  return { platformPostId: published.id };
}

function buildCaption(post: ContentPost): string {
  const parts: string[] = [];
  if (post.title) parts.push(post.title);
  if (post.body)  parts.push(post.body);
  if (post.tags?.length) parts.push(post.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '));
  return parts.join('\n\n');
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
