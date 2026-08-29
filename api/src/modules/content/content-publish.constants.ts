export const CONTENT_PUBLISH_QUEUE = 'content-publish';

export interface ContentPublishJobData {
  postId: string;
  tenantId: string;
  /** Cross-post override: publish this post to a channel other than post.channel
   *  (used to publish the same content to several networks at once). */
  channel?: string;
}
