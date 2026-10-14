// A plugin's README for the catalog's page (ТЗ 37 §6): a small Markdown — headings, paragraphs, lists, quotes, code,
// **bold**, *italic*, `code`, links. Everything is escaped first: no HTML of the README gets through; links only to
// http(s), opened outside; an image is a link to it (the page loads nothing from the network itself).

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = (u: string) => (/^https?:\/\/[^\s"<>]+$/.test(u) ? u : null);

/** Inline marks of an escaped line; `base` — the repository's page, for links relative to it. */
function inline(text: string, base: string): string {
  const codes: string[] = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  const href = (u: string) => safeUrl(/^[a-z]+:/i.test(u) ? u : `${base}/blob/HEAD/${u.replace(/^\.?\//, '')}`);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m, alt, u) => {
    const h = href(u.replace(/&amp;/g, '&'));
    return h ? `<a href="${esc(h)}" class="img">Картинка${alt ? `: ${alt}` : ''} ↗</a>` : '';
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (m, t, u) => {
    const h = href(u.replace(/&amp;/g, '&'));
    return h ? `<a href="${esc(h)}">${t}</a>` : t;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<i>$2</i>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

export function renderReadme(md: string, repoUrl: string): string {
  const out: string[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '), repoUrl)}</p>`);
    para = [];
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i, repoUrl)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const fence = /^\s*(```|~~~)/.exec(l);
    if (fence) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\s*<!--/.test(l) || /^\s*<\/?[a-z][^>]*>\s*$/i.test(l)) continue; // raw HTML lines: left out
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (h) {
      flush();
      const n = Math.min(4, h[1].length + 1);
      out.push(`<h${n}>${inline(h[2], repoUrl)}</h${n}>`);
      continue;
    }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(l);
    if (li) {
      const tag = /\d/.test(li[1]) ? 'ol' : 'ul';
      if (para.length || (list && list.tag !== tag)) flush();
      list ??= { tag, items: [] };
      list.items.push(li[2]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(l)) {
      list.items[list.items.length - 1] += ' ' + l.trim();
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(l);
    if (q) {
      flush();
      out.push(`<blockquote>${inline(q[1], repoUrl)}</blockquote>`);
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)) {
      flush();
      out.push('<hr />');
      continue;
    }
    if (!l.trim()) {
      flush();
      continue;
    }
    if (list) flush();
    para.push(l.trim());
  }
  flush();
  return out.join('\n');
}
