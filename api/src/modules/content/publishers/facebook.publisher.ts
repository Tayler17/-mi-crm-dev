import { Logger } from '@nestjs/common';
import { ContentPost } from '../entities/content-post.entity';

const GQL = 'https://graph.facebook.com/v19.0';
const log = new Logger('FacebookPublisher');

/**
 * Publishes a ContentPost to a Facebook Page via Meta Graph API.
 *
 * Credentials expected:
 *   accessToken – Page access token with pages_manage_posts scope
 *   pageId      – Facebook Page ID
 */
export async function publishToFacebook(
  post: ContentPost,
  credentials: Record<string, any>,
): Promise<{ platformPostId: string }> {
  const { accessToken, pageId } = credentials;
  if (!accessToken || !pageId) throw new Error('Facebook: faltan accessToken o pageId en la conexión');

  const message = buildMessage(post);

  // Video → publish as a Facebook Reel.
  if (post.mediaUrl && post.mediaType === 'video') {
    const base = process.env.API_PUBLIC_URL || 'https://api.automarkiq.com';
    const videoUrl = /^https?:\/\//.test(post.mediaUrl) ? post.mediaUrl : `${base}${post.mediaUrl}`;
    const platformPostId = await publishFacebookReel(pageId, accessToken, videoUrl, message);
    log.log(`Post ${post.id} publicado como Reel en Facebook: video_id=${platformPostId}`);
    return { platformPostId };
  }

  let res: Response;
  if (post.mediaUrl) {
    // Photo post: POST /{page-id}/photos
    const base = process.env.API_PUBLIC_URL || 'https://api.automarkiq.com';
    const imageUrl = /^https?:\/\//.test(post.mediaUrl) ? post.mediaUrl : `${base}${post.mediaUrl}`;
    const body = new URLSearchParams({ url: imageUrl, caption: message, published: 'true', access_token: accessToken });
    res = await fetch(`${GQL}/${pageId}/photos`, { method: 'POST', body });
  } else {
    // Text post: POST /{page-id}/feed
    const body = new URLSearchParams({ message, access_token: accessToken });
    res = await fetch(`${GQL}/${pageId}/feed`, { method: 'POST', body });
  }

  const data = await res.json();
  const platformPostId: string | undefined = data?.id ?? data?.post_id;
  if (!platformPostId) {
    throw new Error(`Facebook: error al publicar — ${JSON.stringify(data)}`);
  }

  log.log(`Post ${post.id} publicado en Facebook: post_id=${platformPostId}`);
  return { platformPostId };
}

/**
 * Publishes a video as a Facebook Reel using the 3-phase /video_reels flow.
 * Uses the hosted-file method: Meta downloads the video from a public URL,
 * so we never stream the bytes ourselves.
 */
async function publishFacebookReel(
  pageId: string,
  accessToken: string,
  videoUrl: string,
  description: string,
): Promise<string> {
  // Phase 1 — start an upload session
  const startRes = await fetch(`${GQL}/${pageId}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_phase: 'start', access_token: accessToken }),
  });
  const start = await startRes.json();
  const videoId: string | undefined = start?.video_id;
  const uploadUrl: string | undefined = start?.upload_url;
  if (!videoId || !uploadUrl) {
    throw new Error(`Facebook Reel: no se pudo iniciar la subida — ${JSON.stringify(start)}`);
  }

  // Phase 2 — tell Meta to fetch the hosted video (file_url header, no body)
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `OAuth ${accessToken}`, file_url: videoUrl },
  });
  const upload = await uploadRes.json().catch(() => ({}));
  if (upload?.success === false || upload?.error) {
    throw new Error(`Facebook Reel: fallo al transferir el video — ${JSON.stringify(upload)}`);
  }

  // Phase 3 — finish & publish
  const finishUrl =
    `${GQL}/${pageId}/video_reels` +
    `?upload_phase=finish&video_id=${videoId}&video_state=PUBLISHED` +
    `&description=${encodeURIComponent(description)}&access_token=${accessToken}`;
  const finishRes = await fetch(finishUrl, { method: 'POST' });
  const finish = await finishRes.json();
  if (finish?.success === false || finish?.error) {
    throw new Error(`Facebook Reel: fallo al publicar — ${JSON.stringify(finish)}`);
  }

  // Give Meta a moment to move the reel out of processing (best-effort; not fatal).
  await sleep(3000);
  return videoId;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function buildMessage(post: ContentPost): string {
  const parts: string[] = [];
  if (post.title) parts.push(`**${post.title}**`);
  if (post.body)  parts.push(post.body);
  if (post.tags?.length) parts.push(post.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '));
  return parts.join('\n\n');
}
