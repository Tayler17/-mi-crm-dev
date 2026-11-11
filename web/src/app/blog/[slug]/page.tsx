import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../blog.css';
import { fetchBlogPost, formatDate } from '@/lib/blog-data';
import { renderMarkdown } from '@/lib/markdown';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: any }): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchBlogPost(String(slug));
  if (!post) return { title: 'Artículo no encontrado — AutoMarkIQ' };
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || undefined;
  return {
    title: `${title} — AutoMarkIQ`,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      images: post.coverImageUrl ? [post.coverImageUrl] : undefined,
    },
    twitter: {
      card: post.coverImageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
    },
  };
}

export default async function BlogArticlePage({ params }: { params: any }) {
  const { slug } = await params;
  const post = await fetchBlogPost(String(slug));
  if (!post) notFound();

  const html = renderMarkdown(post.body || '');

  return (
    <div className="blog-wrap">
      <div className="blog-top">
        <Link href="/" className="blog-brand">AutoMarkIQ</Link>
        <Link href="/blog" className="blog-back">← Blog</Link>
      </div>

      <article className="blog-article">
        <div className="blog-meta" style={{ marginBottom: 6 }}>
          {post.publishedAt ? <span>{formatDate(post.publishedAt)}</span> : null}
          {post.author ? <span>· {post.author}</span> : null}
          {(post.tags ?? []).slice(0, 4).map((t) => (
            <span key={t} className="blog-tag">{t}</span>
          ))}
        </div>
        <h1>{post.title}</h1>
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="blog-cover" src={post.coverImageUrl} alt={post.title} />
        ) : null}
        <div className="blog-content" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </div>
  );
}
