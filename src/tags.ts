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
