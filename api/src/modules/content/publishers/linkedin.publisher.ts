import { Logger } from '@nestjs/common';
import { ContentPost } from '../entities/content-post.entity';

const UGC_URL = 'https://api.linkedin.com/v2/ugcPosts';
const log = new Logger('LinkedInPublisher');

/**
 * Publishes a ContentPost to a LinkedIn Organization page via UGC Posts API.
 *
 * Credentials (from PlatformSettingsService.getLinkedIn()):
 *   accessToken – OAuth 2.0 Bearer token with w_organization_social scope
 *   orgId       – LinkedIn Organization numeric ID (e.g. "12345678")
 *
 * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/ugc-post-api
 */
export async function publishToLinkedIn(
  post: ContentPost,
  credentials: { accessToken: string; orgId: string },
): Promise<{ platformPostId: string }> {
  const { accessToken, orgId } = credentials;
  if (!accessToken || !orgId) {
    throw new Error('LinkedIn: faltan credenciales (access_token, org_id) en la configuración de plataforma');
  }

  const text = buildLinkedInText(post);
  const author = `urn:li:organization:${orgId}`;

  const payload: Record<string, any> = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  // If post has a media URL, include it as an IMAGE share
  if (post.mediaUrl && post.mediaType === 'image') {
    payload.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'IMAGE';
    payload.specificContent['com.linkedin.ugc.ShareContent'].media = [
      {
        status: 'READY',
        description: { text: post.altText || post.body?.slice(0, 200) || post.title },
        media: post.mediaUrl,
        title: { text: post.title },
      },
    ];
  }

  const res = await fetch(UGC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(payload),
  });

  // LinkedIn returns the post ID in the "id" field or in the X-RestLi-Id header
  const data: any = await res.json().catch(() => ({}));
  const postId: string | undefined =
    data?.id ||
    res.headers.get('x-restli-id') ||
    res.headers.get('X-RestLi-Id') ||
    undefined;

  if (!res.ok && !postId) {
    throw new Error(`LinkedIn: error al publicar — ${res.status} ${JSON.stringify(data)}`);
  }

  log.log(`Post ${post.id} publicado en LinkedIn: id=${postId ?? 'n/a'}`);
  return { platformPostId: postId ?? 'unknown' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLinkedInText(post: ContentPost): string {
  const parts: string[] = [];
  if (post.title) parts.push(post.title);
  if (post.body)  parts.push(post.body);
  if (post.tags?.length) {
    parts.push(post.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '));
  }
  return parts.join('\n\n');
}
