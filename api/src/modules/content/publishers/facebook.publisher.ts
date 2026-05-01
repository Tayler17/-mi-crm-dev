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

  let res: Response;
  if (post.mediaUrl) {
    // Photo post: POST /{page-id}/photos
    const body = new URLSearchParams({ url: post.mediaUrl, caption: message, published: 'true', access_token: accessToken });
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

function buildMessage(post: ContentPost): string {
  const parts: string[] = [];
  if (post.title) parts.push(`**${post.title}**`);
  if (post.body)  parts.push(post.body);
  if (post.tags?.length) parts.push(post.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '));
  return parts.join('\n\n');
}
