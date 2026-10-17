// Tags (ТЗ 38): the folder's tags and how often they are set, the tags of a heading with where each came from (its
// own, a parent's — `org-use-tag-inheritance` — or the file's #+FILETAGS), the headings that have all the tags of a
// filter, the tags often found with them. Pure: the files are given.

import type { Heading } from './org';

export interface TagFile {
  name: string;
  headings: Heading[];
  filetags: string[];
}
/** A tag of a heading: its own, a parent's (that parent's title), or the file's. */
export interface HeadTag {
  tag: string;
  from: 'own' | 'parent' | 'file';
  parent?: string;
}
export interface TagHit {
  file: TagFile;
  idx: number;
  h: Heading;
  tags: HeadTag[];
}

const key = (t: string) => t.toLowerCase();

/** «:infra:» → «infra»; a name Org takes: letters, digits, `_`, `@`, `#`, `%`. */
export const tagOk = (t: string) => /^[\p{L}\p{N}_@#%]+$/u.test(t);
export const bareTag = (t: string) => t.trim().replace(/^:+|:+$/g, '');

/**
 * The folder's tags: each with how many headings have it set on themselves (not inherited); the tags of #+FILETAGS
 * are listed too. The first spelling met is kept.
 */
export function tagCounts(files: TagFile[]): { tag: string; n: number }[] {
  const out = new Map<string, { tag: string; n: number }>();
  const add = (t: string, n: number) => {
    const k = key(t);
    const e = out.get(k);
    if (e) e.n += n;
    else out.set(k, { tag: t, n });
  };
  for (const f of files) {
    for (const t of f.filetags) add(t, 0);
    for (const h of f.headings) for (const t of h.tags) add(t, 1);
  }
  return [...out.values()];
}
export function sortTags(list: { tag: string; n: number }[], by: 'count' | 'name') {
  const name = (a: { tag: string }, b: { tag: string }) => a.tag.localeCompare(b.tag, 'ru');
  return [...list].sort(by === 'count' ? (a, b) => b.n - a.n || name(a, b) : name);
}

/** A heading's tags: its own first, then its parents' (nearest first), then the file's; each tag once. `noInherit` —
 *  tags that are not passed down (`org-tags-exclude-from-inheritance`). */
export function tagsOf(f: TagFile, idx: number, noInherit: Set<string> = new Set()): HeadTag[] {
  const h = f.headings[idx];
  const out: HeadTag[] = [];
  const seen = new Set<string>();
  const add = (t: string, from: HeadTag['from'], parent?: string) => {
    const k = key(t);
    if (seen.has(k) || (from !== 'own' && noInherit.has(k))) return;
    seen.add(k);
    out.push({ tag: t, from, ...(parent !== undefined ? { parent } : {}) });
  };
  for (const t of h.tags) add(t, 'own');
  for (let p = h.parent; p >= 0; p = f.headings[p].parent) for (const t of f.headings[p].tags) add(t, 'parent', f.headings[p].title);
  for (const t of f.filetags) add(t, 'file');
  return out;
}

/**
 * The headings that have every tag of `want` (И): set on themselves, or — `inherit` — got from a parent or the file.
 * By file: the files with more hits first; inside, in the file's order.
 */
export function headingsWith(files: TagFile[], want: string[], inherit = true, noInherit: Set<string> = new Set()): { file: TagFile; hits: TagHit[] }[] {
  const need = want.map(key);
  if (!need.length) return [];
  const out: { file: TagFile; hits: TagHit[] }[] = [];
  for (const f of files) {
    const hits: TagHit[] = [];
    f.headings.forEach((h, idx) => {
      const tags = tagsOf(f, idx, noInherit);
      const have = new Set(tags.filter((t) => inherit || t.from === 'own').map((t) => key(t.tag)));
      if (need.every((k) => have.has(k))) hits.push({ file: f, idx, h, tags });
    });
    if (hits.length) out.push({ file: f, hits });
  }
  return out.sort((a, b) => b.hits.length - a.hits.length || a.file.name.localeCompare(b.file.name, 'ru'));
}

/** «Часто вместе»: the other tags of the headings found, by how many of them have each; three at most. */
export function oftenWith(found: { hits: TagHit[] }[], want: string[], max = 3): { tag: string; n: number }[] {
  const skip = new Set(want.map(key));
  const n = new Map<string, { tag: string; n: number }>();
  for (const g of found)
    for (const hit of g.hits)
      for (const t of hit.tags) {
        const k = key(t.tag);
        if (skip.has(k)) continue;
        const e = n.get(k);
        if (e) e.n++;
        else n.set(k, { tag: t.tag, n: 1 });
      }
  return [...n.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'ru')).slice(0, max);
}

/** «23 заголовка в 7 файлах». */
export function foundText(found: { hits: TagHit[] }[]): string {
  const h = found.reduce((s, g) => s + g.hits.length, 0);
  const f = found.length;
  const pl = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
  return `${h} ${pl(h, 'заголовок', 'заголовка', 'заголовков')} в ${f} ${pl(f, 'файле', 'файлах', 'файлах')}`;
}

/**
 * A tag renamed (`to`) or removed (null) in a file's text: in its headings' tags (the column of spaces before them
 * kept; a tag there twice after a rename kept once; no tags left — the spaces go too) and in #+FILETAGS. `lines` —
 * the heading lines (0-based) the parser found: a «* x :t:» inside a block is not touched. How many headings changed.
 */
export function retag(text: string, lines: number[], from: string, to: string | null): { text: string; n: number; file: boolean } {
  const k = key(from);
  const ls = text.split('\n');
  const swap = (tags: string[]) => {
    const out: string[] = [];
    for (const t of tags) {
      const x = key(t) === k ? to : t;
      if (x && !out.some((o) => key(o) === key(x))) out.push(x);
    }
    return out;
  };
  let n = 0;
  for (const i of lines) {
    const m = /^(.*?)(\s+):((?:[^\s:]+:)+)\s*$/.exec(ls[i] ?? '');
    if (!m) continue;
    const tags = m[3].split(':').filter(Boolean);
    if (!tags.some((t) => key(t) === k)) continue;
    const next = swap(tags);
    ls[i] = next.length ? `${m[1]}${m[2]}:${next.join(':')}:` : m[1];
    n++;
  }
  let file = false;
  ls.forEach((l, i) => {
    const m = /^(#\+FILETAGS:\s*)(.*)$/i.exec(l);
    if (!m) return;
    const tags = m[2].split(':').map((s) => s.trim()).filter(Boolean);
    if (!tags.some((t) => key(t) === k)) return;
    const next = swap(tags);
    ls[i] = next.length ? `${m[1]}:${next.join(':')}:` : m[1].trimEnd();
    file = true;
  });
  return { text: ls.join('\n'), n, file };
}

/** «platform.org 9 · work.org 5 · … · ещё 3 файла»: the files by how many headings change, four at most named. */
export function perFile(counts: { name: string; n: number }[], shown = 4): string {
  const l = counts.filter((c) => c.n > 0).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru'));
  const rest = l.length - shown;
  const pl = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'файл' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'файла' : 'файлов');
  return [...l.slice(0, shown).map((c) => `${c.name} ${c.n}`), ...(rest > 0 ? [`ещё ${rest} ${pl(rest)}`] : [])].join(' · ');
}

const LINE_TAGS = /^(.*?)(\s+):((?:[^\s:]+:)+)\s*$/;
/** The tags at the end of a heading line, and where they start (the column of the first «:»); none — its end. */
export function lineTags(line: string): { tags: string[]; at: number } {
  const m = LINE_TAGS.exec(line);
  return m ? { tags: m[3].split(':').filter(Boolean), at: m[1].length + m[2].length } : { tags: [], at: line.trimEnd().length };
}
/** A heading line with these tags: the spaces before the old ones kept (one space when there were none); none left —
 *  the line ends at its title. */
export function withTags(line: string, tags: string[]): string {
  const m = LINE_TAGS.exec(line);
  const base = m ? m[1] : line.trimEnd();
  if (!tags.length) return base;
  return `${base}${m ? m[2] : ' '}:${tags.join(':')}:`;
}

/** The tags offered in a heading's field (ТЗ 38 §6): the folder's tags not on it yet, by substring of the query, the
 *  most used first, up to 7; and «Создать тег :x:» for a new name. `list` is the folder's, by use. */
export function tagRows(list: { tag: string; n: number }[], tags: string[], q: string): { tag: string; n: number; create: boolean }[] {
  const key = (t: string) => t.toLowerCase();
  const have = new Set(tags.map(key));
  const name = bareTag(q);
  const s = key(name);
  const found = list.filter((t) => !have.has(key(t.tag)) && (!s || key(t.tag).includes(s))).slice(0, 7);
  const create = !!name && tagOk(name) && !have.has(key(name)) && !list.some((t) => key(t.tag) === key(name));
  return [...found.map((t) => ({ tag: t.tag, n: t.n, create: false })), ...(create ? [{ tag: name, n: 0, create: true }] : [])];
}
