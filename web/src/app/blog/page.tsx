import Link from 'next/link';
import type { Metadata } from 'next';
import './blog.css';
import { fetchBlogPosts, formatDate } from '@/lib/blog-data';

export const metadata: Metadata = {
  title: 'Blog — AutoMarkIQ',
  description: 'Novedades, guías y noticias de AutoMarkIQ: automatización, bots de IA y CRM para tu negocio.',
};

export const revalidate = 60;

export default async function BlogIndexPage() {
  const posts = await fetchBlogPosts();

  return (
    <div className="blog-wrap">
      <div className="blog-top">
        <Link href="/" className="blog-brand">AutoMarkIQ</Link>
        <Link href="/" className="blog-back">← Inicio</Link>
      </div>

      <header className="blog-header">
        <h1>Blog</h1>
        <p>Novedades, guías y noticias sobre automatización, bots de IA y CRM.</p>
      </header>

      {posts.length === 0 ? (
        <div className="blog-empty">Aún no hay artículos publicados. ¡Vuelve pronto! ✨</div>
      ) : (
        <ul className="blog-list">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/blog/${p.slug}`} className="blog-card">
                {p.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="blog-card-cover" src={p.coverImageUrl} alt={p.title} />
                ) : null}
                <div className="blog-card-body">
                  <h2>{p.title}</h2>
                  {p.excerpt ? <p>{p.excerpt}</p> : null}
                  <div className="blog-meta">
                    {p.publishedAt ? <span>{formatDate(p.publishedAt)}</span> : null}
                    {(p.tags ?? []).slice(0, 3).map((t) => (
                      <span key={t} className="blog-tag">{t}</span>
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
