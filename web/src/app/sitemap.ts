import type { MetadataRoute } from 'next';
import { fetchBlogPosts } from '@/lib/blog-data';

// Public sitemap for SEO. Uses the production site URL (overridable via env).
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://automarkiq.com';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await fetchBlogPosts();
  const postUrls: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE}/blog/${p.slug}`,
    lastModified: p.updatedAt ? new Date(p.updatedAt) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));
  return [
    { url: SITE, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    ...postUrls,
  ];
}
