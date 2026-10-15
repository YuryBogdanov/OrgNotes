// Moving a heading with its subtree to another place: a file, then a heading in it (or the file's 1st level).
// Pure functions on texts and headings, shared by the palette's «Перенести в другой файл…» and the Inbox's
// «Перенести», and tested on their own.

import { fuzzy, type Match } from './fuzzy';
import { headingLines, type Heading } from './org';
import { displayName, displayPath } from './names';
import { isOrgName } from './fileTypes.svelte';

/** «Бюджет [1/3]» → «Бюджет» (the cookie is not searched or shown). */
export const bareTitle = (title: string) => title.replace(/\s*\[\d*(?:\/\d*|%)\]/g, '').trim();
/** A heading's place that survives edits around it: its ancestors' titles and its own. */
export const keyOf = (h: Heading) => [...h.path, h.title].join('\u0001');

/** Russian plural: 1 совпадение, 2 совпадения, 5 совпадений. */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ---- step 1: files --------------------------------------------------------------------------------------------

export interface FileLike {
  path: string;
  name: string; // relative to the notes folder
}
export interface FileRow {
  path: string;
  label: string; // the name without .org
  sub: string; // where it is: «Работа › Финансы», the notes folder's name for the root
  group: 'НЕДАВНИЕ' | 'ВСЕ ФАЙЛЫ' | 'ФАЙЛЫ';
  at: number[]; // matched characters of the label
  self?: boolean; // the file the heading comes from
}

/**
 * The files to move into. Without a query: up to 5 recent ones (the last places moved to, then recently opened
 * files), then the rest by path. With a query: one list, a match in the name before a match in the path.
 */
export function fileRows(files: FileLike[], o: { q: string; exclude?: string; self?: string; recent: string[]; root: string }): FileRow[] {
  const where = (rel: string) => displayPath(rel).slice(0, -1).join(' › ') || o.root;
  const pool = files.filter((f) => f.path !== o.exclude && isOrgName(f.name)); // not a plugin's file (a canvas)
  const row = (f: FileLike, group: FileRow['group'], at: number[] = []): FileRow => ({
    path: f.path, label: displayName(f.name), sub: where(f.name), group, at, ...(f.path === o.self ? { self: true } : {}),
  });
  const q = o.q.trim();
  if (!q) {
    const byPath = new Map(pool.map((f) => [f.path, f]));
    const recent = [...new Set(o.recent)].filter((p) => byPath.has(p)).slice(0, 5);
    const rest = pool.filter((f) => !recent.includes(f.path)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return [...recent.map((p) => row(byPath.get(p)!, 'НЕДАВНИЕ')), ...rest.map((f) => row(f, 'ВСЕ ФАЙЛЫ'))];
  }
  const found: { r: FileRow; inName: boolean; m: Match; name: string }[] = [];
  for (const f of pool) {
    const label = displayName(f.name);
    const m = fuzzy(q, label);
    if (m) {
      found.push({ r: row(f, 'ФАЙЛЫ', m.at), inName: true, m, name: f.name });
      continue;
    }
    const p = fuzzy(q, f.name.replace(/\.org$/i, '').split('/').join(' '));
    if (p) found.push({ r: row(f, 'ФАЙЛЫ'), inName: false, m: p, name: f.name });
  }
  found.sort((a, b) =>
    a.inName !== b.inName ? (a.inName ? -1 : 1)
    : a.m.wordStart !== b.m.wordStart ? (a.m.wordStart ? -1 : 1)
    : a.m.span - b.m.span || a.name.localeCompare(b.name, 'ru'));
  return found.map((x) => x.r);
}

// ---- step 2: the tree of headings -----------------------------------------------------------------------------

export interface TreeRow {
  i: number; // index into the headings
  depth: number; // how deep in the tree: one guide line per level above
  hasKids: boolean;
  open: boolean;
  kids: number; // direct sub-headings (shown on a closed branch)
  at: number[]; // matched characters of the bare title
  dim: boolean; // a search: an ancestor without a match itself
  blocked: boolean; // the heading being moved or inside it: not a place to move to
}

/** Depth in the tree (levels may skip: `*` then `***` is one step). */
function depths(hs: Heading[]): number[] {
  const d: number[] = [];
  hs.forEach((h, i) => (d[i] = h.parent < 0 ? 0 : d[h.parent] + 1));
  return d;
}

/** What is open when a file is first shown: the 1st level, and the way to the last place moved to in it. */
export function initialOpen(hs: Heading[], lastKey?: string): Set<string> {
  const open = new Set<string>();
  for (const h of hs) if (h.parent < 0) open.add(keyOf(h));
  const last = lastKey ? hs.find((h) => keyOf(h) === lastKey) : undefined;
  for (let p = last ? last.parent : -1; p >= 0; p = hs[p].parent) open.add(keyOf(hs[p]));
  return open;
}

/**
 * The visible rows. Without a query: a child shows when its parent and all above are open. With one: the
 * matches and their ancestors (the ancestors dimmed unless they match too), every branch on the way open.
 * `block` is the line range of the heading being moved (moving within one file).
 */
export function treeRows(hs: Heading[], open: Set<string>, q: string, block?: { line: number; end: number }): { rows: TreeRow[]; matches: number } {
  const d = depths(hs);
  const kids = hs.map(() => 0);
  for (const h of hs) if (h.parent >= 0) kids[h.parent]++;
  const blocked = (h: Heading) => !!block && h.line >= block.line && h.line < block.end;
  const query = q.trim();
  if (!query) {
    const rows: TreeRow[] = [];
    const shown: boolean[] = [];
    hs.forEach((h, i) => {
      const up = h.parent;
      shown[i] = up < 0 || (shown[up] && open.has(keyOf(hs[up])));
      if (shown[i]) rows.push({ i, depth: d[i], hasKids: kids[i] > 0, open: kids[i] > 0 && open.has(keyOf(h)), kids: kids[i], at: [], dim: false, blocked: blocked(h) });
    });
    return { rows, matches: 0 };
  }
  const at: (number[] | null)[] = hs.map((h) => fuzzy(query, bareTitle(h.title))?.at ?? null);
  const keep = hs.map(() => false);
  let matches = 0;
  hs.forEach((_, i) => {
    if (!at[i]) return;
    matches++;
    for (let p = i; p >= 0 && !keep[p]; p = hs[p].parent) keep[p] = true;
  });
  const rows: TreeRow[] = [];
  hs.forEach((h, i) => {
    if (!keep[i]) return;
    const openHere = hs.some((c, j) => j > i && c.parent === i && keep[j]);
    rows.push({ i, depth: d[i], hasKids: kids[i] > 0, open: openHere, kids: kids[i], at: at[i] ?? [], dim: !at[i], blocked: blocked(h) });
  });
  return { rows, matches };
}

// ---- moving the text ------------------------------------------------------------------------------------------

/** The subtree's lines with its levels moved so its root is at `level` (only real headings: not `*` lines in
 *  blocks); trailing blank lines left out. */
export function relevel(tree: string[], from: number, level: number): string[] {
  const shift = level - from;
  const heads = headingLines(tree);
  const out = tree.map((l, i) => (heads.has(i) ? l.replace(/^(\*+)/, (s) => '*'.repeat(Math.max(1, s.length + shift))) : l));
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
}

/**
 * The lines placed into a text: as the last child of `under` (after its last descendant, before the blank lines
 * that end its subtree), or at the end of the file. Returns the text and the line of the placed root.
 */
export function place(dst: string, lines: string[], under: { line: number; end: number } | null): { text: string; line: number } {
  if (!under) {
    const body = dst.replace(/\n*$/, '');
    const before = body ? body.split('\n') : [];
    return { text: [...before, ...lines].join('\n') + '\n', line: before.length };
  }
  const all = dst.split('\n');
  let at = under.end;
  while (at > under.line + 1 && (all[at - 1] ?? '').trim() === '') at--;
  // the last line of the file without a line break: a break goes before the new lines
  all.splice(at, 0, ...lines);
  const text = all.join('\n');
  return { text: text.endsWith('\n') ? text : text + '\n', line: at };
}

/** Into another file: both texts and the placed root's line. */
export function moveTo(src: string, h: Heading, dst: string, under: Heading | null): { src: string; dst: string; line: number } {
  const lines = src.split('\n');
  const tree = lines.splice(h.line, h.end - h.line);
  const r = place(dst, relevel(tree, h.level, under ? under.level + 1 : 1), under);
  return { src: lines.join('\n'), dst: r.text, line: r.line };
}

/** Within one file: under another heading there (not inside itself), or to its end. */
export function moveWithin(text: string, h: Heading, under: Heading | null): { text: string; line: number } {
  if (under && under.line >= h.line && under.line < h.end) throw new Error('a heading cannot go inside itself');
  const lines = text.split('\n');
  const tree = lines.splice(h.line, h.end - h.line);
  const n = h.end - h.line;
  const shift = (x: number) => (x <= h.line ? x : x - n);
  const u = under ? { line: shift(under.line), end: shift(under.end) } : null;
  return place(lines.join('\n'), relevel(tree, h.level, under ? under.level + 1 : 1), u);
}

/** Where the caret goes after a heading left: the next heading in its place, else the one before. */
export function caretAfter(hs: Heading[], line: number): number {
  const next = hs.find((h) => h.line >= line);
  if (next) return next.line;
  const prev = hs.filter((h) => h.line < line).pop();
  return prev ? prev.line : 0;
}
