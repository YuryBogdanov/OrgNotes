// Org links: extraction with uniorg (exact offsets) and resolution to notes / headings / URLs.
import { parse } from 'uniorg-parse/lib/parser.js';
import type { Heading } from './org';

export interface OrgLink {
  from: number; // offsets of the whole link in the file text
  to: number;
  format: 'bracket' | 'plain' | 'angle';
  type: string; // file | id | custom-id | fuzzy | http | https | mailto | …
  raw: string; // link target as written, e.g. "file:a.org::*Heading"
  path: string; // path part as uniorg reports it
  descFrom?: number; // description range (bracket links with a description)
  descTo?: number;
  desc?: string;
  line: number; // 0-based line where the link starts
}

type UNode = {
  type: string;
  format?: string;
  linkType?: string;
  rawLink?: string;
  path?: string;
  contentsBegin?: number;
  contentsEnd?: number;
  position?: { start: { offset: number }; end: { offset: number } };
  children?: UNode[];
};

export function extractLinks(text: string): OrgLink[] {
  if (!text.includes('[[') && !text.includes('://') && !text.includes('mailto:') && !text.includes('<')) return [];
  let ast: UNode;
  try {
    ast = parse(text, { trackPosition: true }) as unknown as UNode;
  } catch {
    return [];
  }
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  const lineOf = (off: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const out: OrgLink[] = [];
  const walk = (n: UNode) => {
    if (n.type === 'link' && n.position) {
      const from = n.position.start.offset;
      const to = n.position.end.offset;
      const l: OrgLink = {
        from, to,
        format: (n.format as OrgLink['format']) ?? 'bracket',
        type: n.linkType ?? 'fuzzy',
        raw: n.rawLink ?? '',
        path: n.path ?? '',
        line: lineOf(from),
      };
      const hasDesc = l.format === 'bracket' && n.contentsBegin != null && n.contentsEnd != null && n.contentsEnd > n.contentsBegin;
      if (hasDesc) {
        l.descFrom = n.contentsBegin;
        l.descTo = n.contentsEnd;
        l.desc = text.slice(n.contentsBegin, n.contentsEnd);
      }
      out.push(l);
    }
    n.children?.forEach(walk);
  };
  walk(ast);
  return out.sort((a, b) => a.from - b.from);
}

/** Title shown for a link in lists: description, else the target. */
export const linkLabel = (l: OrgLink) => l.desc ?? l.raw.replace(/^file:/, '');

export type Target =
  | { kind: 'url'; url: string }
  | { kind: 'note'; file: number; line: number | null; missingSection?: string }
  | { kind: 'missing'; what: string };

export interface NoteRef {
  path: string;
  name: string;
  text: string;
  headings: Heading[];
}

const URL_TYPES = new Set(['http', 'https', 'mailto', 'tel', 'ftp']);

function dirname(p: string) {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}
function normalize(p: string) {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return (p.startsWith('/') ? '/' : '') + out.join('/');
}

function findLine(f: NoteRef, search: string): number | null {
  const s = search.trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (s.startsWith('*')) {
    const t = s.slice(1).trim().toLowerCase();
    return f.headings.find((h) => h.title.toLowerCase() === t)?.line ?? null;
  }
  if (s.startsWith('#')) {
    const id = s.slice(1);
    return f.headings.find((h) => h.customId === id)?.line ?? null;
  }
  if (/^\d+$/.test(s)) return Math.max(0, +s - 1);
  const lines = f.text.split('\n');
  let i = lines.findIndex((l) => l.includes('<<' + s + '>>'));
  if (i < 0) i = lines.findIndex((l) => l.toLowerCase().includes(low));
  return i >= 0 ? i : null;
}

/** Resolve a link found in `files[from]` to something we can open. */
export function resolveLink(link: OrgLink, from: number, files: NoteRef[]): Target {
  const here = files[from];
  const t = link.type;

  if (URL_TYPES.has(t)) return { kind: 'url', url: link.raw };

  if (t === 'file') {
    const [p, search] = splitSearch(link.path);
    if (!p) return { kind: 'missing', what: link.raw };
    const abs = p.startsWith('/') ? normalize(p) : normalize(dirname(here.path) + '/' + p);
    let idx = files.findIndex((f) => normalize(f.path) === abs);
    if (idx < 0 && !p.startsWith('/')) {
      // fall back to a path relative to the notes root
      idx = files.findIndex((f) => f.name === normalize(p));
    }
    if (idx < 0) return { kind: 'missing', what: p };
    if (search == null) return { kind: 'note', file: idx, line: null };
    const line = findLine(files[idx], search);
    return line == null ? { kind: 'note', file: idx, line: null, missingSection: search } : { kind: 'note', file: idx, line };
  }

  if (t === 'id') {
    for (let i = 0; i < files.length; i++) {
      const h = files[i].headings.find((x) => x.id === link.path);
      if (h) return { kind: 'note', file: i, line: h.line };
    }
    return { kind: 'missing', what: 'id:' + link.path };
  }

  if (t === 'custom-id') {
    const order = [from, ...files.keys()].filter((v, i, a) => a.indexOf(v) === i);
    for (const i of order) {
      const h = files[i].headings.find((x) => x.customId === link.path);
      if (h) return { kind: 'note', file: i, line: h.line };
    }
    return { kind: 'missing', what: '#' + link.path };
  }

  if (t === 'fuzzy' || t === 'heading') {
    const raw = link.path || link.raw;
    const line = raw.startsWith('*')
      ? findLine(here, raw)
      : (findLine(here, '*' + raw) ?? findLine(here, raw));
    return line == null ? { kind: 'missing', what: raw } : { kind: 'note', file: from, line };
  }

  return { kind: 'missing', what: link.raw };
}

function splitSearch(path: string): [string, string | null] {
  const i = path.indexOf('::');
  return i < 0 ? [path, null] : [path.slice(0, i), path.slice(i + 2)];
}

// ---- per-file cache (typing only re-parses the file being edited) ----------------

const cache = new Map<string, { text: string; links: OrgLink[] }>();
export function linksOf(f: { path: string; text: string }): OrgLink[] {
  const c = cache.get(f.path);
  if (c && c.text === f.text) return c.links;
  const links = extractLinks(f.text);
  cache.set(f.path, { text: f.text, links });
  return links;
}

export interface Backlink {
  file: number;
  line: number; // line of the link itself
  heading: string; // title of the heading containing the link, '' for preamble
  label: string;
}

/** Links elsewhere that point at `files[file]`'s heading on `line` (or at the whole file when null). */
export function backlinks(files: NoteRef[], file: number, line: number | null): Backlink[] {
  const out: Backlink[] = [];
  files.forEach((f, fi) => {
    for (const l of linksOf(f)) {
      const t = resolveLink(l, fi, files);
      if (t.kind !== 'note' || t.file !== file) continue;
      if (fi === file && l.line === (line ?? -1)) continue;
      if (line == null ? t.line != null : t.line !== line) continue;
      const hs = f.headings;
      let hi = -1;
      for (let k = 0; k < hs.length; k++) if (hs[k].line <= l.line) hi = k;
      out.push({ file: fi, line: l.line, heading: hi >= 0 ? hs[hi].title : '', label: linkLabel(l) });
    }
  });
  return out;
}
