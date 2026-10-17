// Search: in a file (⌘F) and in every file (⇧⌘F). Pure functions on texts: case and «ё» folded without moving
// positions, whole words, fragments around a match, the hits of a file grouped for the navigator.

import { headingLines, type Heading } from './org';

export interface FindOpts {
  cs: boolean; // «Aa»: case matters
  word: boolean; // «Слово»: whole words only
  re?: boolean; // «.*»: the query is a regular expression (⌘F of the new interface, ТЗ 42 §5.7)
}
export type Scope = 'all' | 'headings' | 'text';

/** Lower case (unless `cs`) and «ё» → «е», one character for one, so offsets stay the same. */
export function fold(s: string, cs: boolean): string {
  let out = '';
  for (const ch of s) {
    const c = cs ? ch : ch.toLowerCase();
    out += c.length === ch.length ? c : ch; // a letter whose lower case is longer stays as it is
  }
  return out.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
}
const WORD = /[\p{L}\p{N}_]/u;
const isWord = (ch: string | undefined) => !!ch && WORD.test(ch);

/** Where the query starts in the text, every time (not overlapping). */
export function findAll(text: string, q: string, o: FindOpts, folded?: string): number[] {
  if (!q) return [];
  const t = folded ?? fold(text, o.cs);
  const n = fold(q, o.cs);
  const out: number[] = [];
  for (let i = t.indexOf(n); i >= 0; i = t.indexOf(n, i + Math.max(1, n.length))) {
    if (o.word && (isWord(text[i - 1]) || isWord(text[i + n.length]))) continue;
    out.push(i);
  }
  return out;
}

/** The matches as ranges: a regular expression's have their own lengths; a wrong one finds nothing. */
export function findRanges(text: string, q: string, o: FindOpts): { from: number; to: number }[] {
  if (!q) return [];
  if (!o.re) return findAll(text, q, o).map((s) => ({ from: s, to: s + q.length }));
  let re: RegExp;
  try {
    re = new RegExp(o.word ? `\\b(?:${q})\\b` : q, o.cs ? 'gu' : 'giu');
  } catch {
    return [];
  }
  const out: { from: number; to: number }[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!m[0].length) {
      re.lastIndex++; // an empty match: no range, the search goes on
      continue;
    }
    out.push({ from: m.index, to: m.index + m[0].length });
  }
  return out;
}
/** What a match becomes: the text, or — a regular expression — with its groups ($1). */
export function replacementOf(match: string, q: string, o: FindOpts, text: string): string {
  if (!o.re) return text;
  try {
    return match.replace(new RegExp(q, o.cs ? 'u' : 'iu'), text);
  } catch {
    return text;
  }
}

/** The match that comes first at or after `pos`, round to the start (−1: none). */
export function nearest(starts: number[], pos: number): number {
  if (!starts.length) return -1;
  const i = starts.findIndex((s) => s >= pos);
  return i < 0 ? 0 : i;
}

/** A piece of a line around a match, up to `max` characters, with «…» where cut. */
export function fragment(line: string, at: number, len: number, max = 80): { pre: string; match: string; post: string } {
  const room = Math.max(0, max - len);
  let from = Math.max(0, at - Math.floor(room / 3));
  const to = Math.min(line.length, from + len + room);
  from = Math.max(0, Math.min(from, to - max));
  return {
    pre: (from > 0 ? '…' : '') + line.slice(from, at),
    match: line.slice(at, at + len),
    post: line.slice(at + len, to) + (to < line.length ? '…' : ''),
  };
}

export interface Hit {
  line: number; // 0-based
  col: number; // in the line
  len: number;
  where: string; // the headings above: «Q4 2026 › Подготовить бюджет 2027»
  heading: boolean; // the match is on a heading line
  keyword: string | null; // that heading's status
  pre: string;
  match: string;
  post: string;
  under: number | null; // the index of the heading it is under (for «Ещё N в „…“»)
}

/** The hits in a file: per line, with the heading path; a heading line is shown without its stars and status. */
export function searchFile(text: string, headings: Heading[], q: string, o: FindOpts, scope: Scope, cap = Infinity): Hit[] {
  // a regular expression's matches have their own lengths (ТЗ 43 §2.4)
  const ranges = findRanges(text, q, o);
  if (!ranges.length) return [];
  const lines = text.split('\n');
  const lineStart: number[] = [];
  let p = 0;
  for (const l of lines) {
    lineStart.push(p);
    p += l.length + 1;
  }
  const heads = headingLines(lines);
  const byLine = new Map(headings.map((h, i) => [h.line, i]));
  const out: Hit[] = [];
  let li = 0;
  let under = -1;
  for (const { from: s, to } of ranges) {
    const len = to - s;
    while (li + 1 < lines.length && lineStart[li + 1] <= s) {
      li++;
    }
    for (let k = under + 1; k < headings.length && headings[k].line <= li; k++) under = k;
    const isHead = heads.has(li);
    if ((scope === 'headings' && !isHead) || (scope === 'text' && isHead)) continue;
    const line = lines[li];
    let col = s - lineStart[li];
    if (col + len > line.length) continue; // across a line break
    const h = isHead ? headings[byLine.get(li) ?? -1] : undefined;
    // the line as shown: no stars, no indent; a heading's status apart (drawn in its colour before the text)
    let shown: string;
    let keyword: string | null = null;
    if (h) {
      const stars = /^\*+\s+/.exec(line)![0].length;
      const kw = h.keyword && line.slice(stars).startsWith(h.keyword + ' ') ? h.keyword.length + 1 : 0;
      if (col >= stars + kw) {
        shown = line.slice(stars + kw);
        col -= stars + kw;
        keyword = h.keyword;
      } else {
        shown = line.slice(stars); // the match is in the status: shown as text
        col = Math.max(0, col - stars);
      }
    } else {
      const indent = /^\s*/.exec(line)![0].length;
      shown = line.slice(indent);
      col = Math.max(0, col - indent);
    }
    const f = fragment(shown, col, len);
    const path = under >= 0 ? [...headings[under].path, headings[under].title] : [];
    out.push({
      line: li, col: s - lineStart[li], len, where: (h ? h.path : path).join(' › '), heading: !!h, keyword,
      ...f, under: h ? (byLine.get(li) ?? null) : under >= 0 ? under : null,
    });
    if (out.length >= cap) break;
  }
  return out;
}

/** «14 совпадений в 4 файлах». */
export function summary(hits: number, files: number): string {
  const w = (n: number, a: string, b: string, c: string) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c);
  return `${hits} ${w(hits, 'совпадение', 'совпадения', 'совпадений')} в ${files} ${w(files, 'файле', 'файлах', 'файлах')}`;
}
