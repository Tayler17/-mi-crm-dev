// Server-side data access for the PUBLIC blog pages (/blog, /blog/[slug]).
// These run in Server Components, so they fetch the public API directly (no auth,
// no localStorage) and are cached/revalidated for performance + SEO.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface PublicBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  coverImageUrl?: string | null;
  body?: string | null;
  tags: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchBlogPosts(): Promise<PublicBlogPost[]> {
  try {
    const res = await fetch(`${API_URL}/blog`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    return (await res.json()) as PublicBlogPost[];
  } catch {
    return [];
  }
}

export async function fetchBlogPost(slug: string): Promise<PublicBlogPost | null> {
  try {
    const res = await fetch(`${API_URL}/blog/${encodeURIComponent(slug)}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as PublicBlogPost;
  } catch {
    return null;
  }
}

export function formatDate(d?: string | null): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(d).slice(0, 10);
  }
}
