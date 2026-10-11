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

/**
 * Every link of a note, with its offsets. A whole-document parse costs seconds on a big file (and almost every Org
 * file has a `<` of a timestamp), so only the lines that can hold a link are parsed, each on its own; blocks
 * (#+BEGIN_…/#+END_…) are skipped, as a full parse would read them as code. A link is on one line.
 */
export function extractLinks(text: string): OrgLink[] {
  if (!text.includes('[[') && !text.includes('://') && !text.includes('mailto:') && !text.includes('file:')) return [];
  const out: OrgLink[] = [];
  let block: RegExp | null = null;
  let base = 0;
  let lineNo = 0;
  for (const lineText of text.split('\n')) {
    if (block) {
      if (block.test(lineText)) block = null;
    } else {
      const b = /^\s*#\+BEGIN_(\w+)/i.exec(lineText);
      if (b) block = new RegExp(`^\\s*#\\+END_${b[1]}\\b`, 'i');
      else if (/\[\[|:\/\/|mailto:|file:/.test(lineText)) {
        for (const l of linksOfLine(lineText)) {
          const a: OrgLink = { ...l, from: base + l.from, to: base + l.to, line: lineNo };
          if (l.descFrom != null) {
            a.descFrom = base + l.descFrom;
            a.descTo = base + l.descTo!;
          }
          out.push(a);
        }
      }
    }
    base += lineText.length + 1;
    lineNo++;
  }
  return out.sort((a, b) => a.from - b.from);
}

/** The links of one line, offsets from its start; remembered by the line's text (most lines stay the same between
 *  two versions of a note, so typing re-parses only the line being edited). */
const lineCache = new Map<string, OrgLink[]>();
function linksOfLine(text: string): OrgLink[] {
  const known = lineCache.get(text);
  if (known) return known;
  const out: OrgLink[] = [];
  let ast: UNode | null = null;
  try {
    ast = parse(text, { trackPosition: true }) as unknown as UNode;
  } catch {
    /* no links */
  }
  const walk = (n: UNode) => {
    if (n.type === 'link' && n.position) {
      const l: OrgLink = {
        from: n.position.start.offset,
        to: n.position.end.offset,
        format: (n.format as OrgLink['format']) ?? 'bracket',
        type: n.linkType ?? 'fuzzy',
        raw: n.rawLink ?? '',
        path: n.path ?? '',
        line: 0,
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
  if (ast) walk(ast);
  if (lineCache.size > 50000) lineCache.clear(); // a bound, not an exact LRU
  lineCache.set(text, out);
  return out;
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

export function dirname(p: string) {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}
export function normalize(p: string) {
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

// ---- keeping file links valid when notes are renamed or moved --------------------

function relativePath(fromDir: string, to: string): string {
  const a = normalize(fromDir).split('/').filter(Boolean);
  const b = normalize(to).split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

/**
 * Rewrites `[[file:…]]` links of one note after notes were renamed/moved.
 * `oldPath`/`newPath` are the note's own location before/after (equal if it did not move);
 * `mapTarget` maps an absolute target path to where it lives now.
 * Relative links stay relative, `::search` and descriptions are preserved.
 */
export function rewriteFileLinks(
  text: string,
  oldPath: string,
  newPath: string,
  mapTarget: (abs: string) => string,
): { text: string; count: number } {
  const links = extractLinks(text)
    .filter((l) => l.type === 'file' && l.format === 'bracket' && l.path)
    .sort((a, b) => b.from - a.from); // back to front keeps earlier offsets valid
  let out = text;
  let count = 0;
  for (const l of links) {
    const [p, search] = splitSearch(l.path);
    if (!p) continue;
    const absolute = p.startsWith('/');
    const abs = absolute ? normalize(p) : normalize(dirname(oldPath) + '/' + p);
    const target = mapTarget(abs);
    let np: string;
    if (absolute) np = target;
    else {
      np = relativePath(dirname(newPath), target);
      if (p.startsWith('./') && !np.startsWith('..')) np = './' + np;
    }
    if (np === p) continue;
    const next = 'file:' + np + (search != null ? '::' + search : '');
    const slice = out.slice(l.from, l.to);
    const at = slice.indexOf(l.raw);
    if (at < 0) continue;
    out = out.slice(0, l.from + at) + next + out.slice(l.from + at + l.raw.length);
    count++;
  }
  return { text: out, count };
}

/** Target mapper for renaming/moving one file or a whole folder. */
export function mapperFor(oldAbs: string, newAbs: string) {
  return (abs: string) => (abs === oldAbs ? newAbs : abs.startsWith(oldAbs + '/') ? newAbs + abs.slice(oldAbs.length) : abs);
}
