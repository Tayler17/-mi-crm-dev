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

  // Instagram must FETCH the media → it needs a public https URL, not a local path.
  if (!post.mediaUrl) {
    throw new Error('Instagram: se requiere una imagen o video para publicar (añade media al post)');
  }
  const base = process.env.API_PUBLIC_URL || 'https://api.automarkiq.com';
  const mediaUrl = /^https?:\/\//.test(post.mediaUrl) ? post.mediaUrl : `${base}${post.mediaUrl}`;
  const isVideo = post.mediaType === 'video';

  // Step 3 — create media container (REELS for video, IMAGE otherwise)
  const containerParams = new URLSearchParams({ caption, access_token: accessToken });
  if (isVideo) {
    containerParams.set('media_type', 'REELS');
    containerParams.set('video_url', mediaUrl);
  } else {
    containerParams.set('image_url', mediaUrl);
  }

  const containerRes = await fetch(`${GQL}/${igUserId}/media`, {
    method: 'POST',
    body: containerParams,
  });
  const container = await containerRes.json();
  if (!container?.id) {
    throw new Error(`Instagram: error al crear el container — ${JSON.stringify(container)}`);
  }

  if (isVideo) {
    // Reels must finish transcoding before publishing — poll status (up to ~2.5 min).
    await waitForContainerReady(container.id, accessToken);
  } else {
    // Brief wait for the image container to be ready.
    await sleep(1000);
  }

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

/**
 * Polls a media container until Meta finishes processing it (mainly for Reels/video,
 * which transcode asynchronously). Throws if it errors or times out.
 */
async function waitForContainerReady(containerId: string, accessToken: string): Promise<void> {
  const maxAttempts = 30;          // 30 × 5 s ≈ 2.5 min
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(5000);
    const res = await fetch(`${GQL}/${containerId}?fields=status_code,status&access_token=${accessToken}`);
    const data = await res.json();
    const code = data?.status_code;
    if (code === 'FINISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(`Instagram: el video no se pudo procesar (${code}) — ${data?.status ?? ''}`);
    }
    // IN_PROGRESS / PUBLISHED → keep waiting
  }
  throw new Error('Instagram: el video tardó demasiado en procesarse. Inténtalo de nuevo.');
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
