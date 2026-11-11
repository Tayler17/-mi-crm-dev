// Minimal, dependency-free Markdown → HTML for blog article bodies.
// The body is authored ONLY by the platform owner (trusted), but we still escape
// HTML first so raw markup is never injected, then apply a small, safe subset:
// headings, bold, italic, inline code, links, images, blockquotes, hr, lists,
// paragraphs and line breaks. Good enough for articles; not a full CommonMark parser.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(text: string): string {
  let t = text;
  // images ![alt](url) — before links
  t = t.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_m, alt, url) => `<img src="${url}" alt="${alt}" loading="lazy" />`);
  // links [text](url) — only http(s)
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  // inline code `code`
  t = t.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  // bold **text**
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic *text* (avoid matching bold leftovers)
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return t;
}

export function renderMarkdown(md: string): string {
  const src = escapeHtml(md || '').replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const html: string[] = [];
  let i = 0;
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => { if (listType) { html.push(`</${listType}>`); listType = null; } };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { closeList(); i++; continue; }

    // horizontal rule
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { closeList(); html.push('<hr />'); i++; continue; }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); const lvl = h[1].length; html.push(`<h${lvl}>${inline(h[2].trim())}</h${lvl}>`); i++; continue; }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      closeList();
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { quote.push(inline(lines[i].replace(/^\s*>\s?/, ''))); i++; }
      html.push(`<blockquote>${quote.join('<br />')}</blockquote>`);
      continue;
    }

    // unordered list item
    if (/^\s*[-*+]\s+/.test(line)) {
      if (listType !== 'ul') { closeList(); html.push('<ul>'); listType = 'ul'; }
      html.push(`<li>${inline(line.replace(/^\s*[-*+]\s+/, ''))}</li>`);
      i++; continue;
    }
    // ordered list item
    if (/^\s*\d+\.\s+/.test(line)) {
      if (listType !== 'ol') { closeList(); html.push('<ol>'); listType = 'ol'; }
      html.push(`<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
      i++; continue;
    }

    // paragraph (gather consecutive non-blank, non-special lines)
    closeList();
    const para: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*(---|\*\*\*|___)\s*$/.test(lines[i])
    ) {
      para.push(inline(lines[i].trim()));
      i++;
    }
    html.push(`<p>${para.join('<br />')}</p>`);
  }
  closeList();
  return html.join('\n');
}
