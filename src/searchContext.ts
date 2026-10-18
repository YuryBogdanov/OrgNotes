// The context of the results of the search in a tab (ТЗ 53 §3): each match with the line before and after it; a
// neighbour left out when it is not there, empty, a heading's line (another heading's) or in a drawer. Matches in
// lines near each other under the same heading are one block: the lines they share are not shown twice. A heading's
// line is shown without its stars and status (the status is the block's capsule). Pure: the file and its hits in.

import type { Heading } from './org';
import type { Hit } from './search';

export interface CtxLine {
  n: number; // 0-based
  text: string; // as shown
  match: boolean; // a line with a match
  heading: boolean;
  marks: [number, number][]; // the matches in `text`: [from, to)
}
export interface CtxBlock {
  hits: number[]; // the indexes of the group's hits in it
  lines: CtxLine[];
  where: string; // «Переезд хранилища › Риски»
  keyword: string | null; // the status of the heading it is under
}

const HEAD = /^\*+\s/;
const DRAWER = /^\s*:[A-Za-z][\w-]*:\s*$/;
const END = /^\s*:END:\s*$/i;

/** The lines of a drawer, its opener and its :END: too. */
function drawerLines(lines: string[]): boolean[] {
  const out = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (!DRAWER.test(lines[i]) || END.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && !END.test(lines[j]) && !HEAD.test(lines[j])) j++;
    if (j < lines.length && END.test(lines[j])) {
      for (let k = i; k <= j; k++) out[k] = true;
      i = j;
    }
  }
  return out;
}
/** The heading a line is under (its index in `headings`), -1 before the first. */
function underOf(headings: Heading[], line: number): number {
  let u = -1;
  for (let i = 0; i < headings.length && headings[i].line <= line; i++) u = i;
  return u;
}

export function contextBlocks(text: string, headings: Heading[], hits: Hit[]): CtxBlock[] {
  const lines = text.split('\n');
  const drawer = drawerLines(lines);
  const byLine = new Map(headings.map((h) => [h.line, h]));
  /** A line as shown and how far its text moved: a heading's without its stars and status, a text's without indent. */
  const shown = (n: number): { text: string; cut: number } => {
    const l = lines[n] ?? '';
    const h = byLine.get(n);
    if (h && HEAD.test(l)) {
      const stars = /^\*+\s+/.exec(l)![0].length;
      const kw = h.keyword && l.slice(stars).startsWith(h.keyword + ' ') ? h.keyword.length + 1 : 0;
      return { text: l.slice(stars + kw), cut: stars + kw };
    }
    const indent = /^\s*/.exec(l)![0].length;
    return { text: l.slice(indent), cut: indent };
  };
  const neighbour = (n: number, under: number) =>
    n >= 0 && n < lines.length && !!lines[n].trim() && !HEAD.test(lines[n]) && !drawer[n] && underOf(headings, n) === under;

  const order = hits.map((h, i) => ({ h, i })).sort((a, b) => a.h.line - b.h.line || a.h.col - b.h.col);
  const blocks: CtxBlock[] = [];
  let cur: { under: number; last: number; lines: Set<number>; hits: number[]; first: Hit } | null = null;
  const close = () => {
    if (!cur) return;
    const ns = [...cur.lines].sort((a, b) => a - b);
    const matchLines = new Set(cur.hits.map((i) => hits[i].line));
    blocks.push({
      hits: cur.hits,
      where: cur.first.where,
      keyword: cur.under >= 0 ? headings[cur.under].keyword : null,
      lines: ns.map((n) => {
        const s = shown(n);
        const marks = cur!.hits
          .map((i) => hits[i])
          .filter((h) => h.line === n)
          .map((h): [number, number] => [Math.max(0, h.col - s.cut), Math.max(0, h.col - s.cut) + h.len])
          .filter(([a, b]) => b > a && a < s.text.length);
        return { n, text: s.text, match: matchLines.has(n), heading: byLine.has(n) && HEAD.test(lines[n] ?? ''), marks };
      }),
    });
    cur = null;
  };
  for (const { h, i } of order) {
    const under = underOf(headings, h.line);
    // near the block before under the same heading (its lines touch this one's): the same block
    if (cur && cur.under === under && h.line <= cur.last + 2) {
      cur.hits.push(i);
    } else {
      close();
      cur = { under, last: h.line, lines: new Set(), hits: [i], first: h };
    }
    cur.last = h.line;
    cur.lines.add(h.line);
    if (neighbour(h.line - 1, under) || (h.line - 1 >= 0 && cur.lines.has(h.line - 1))) cur.lines.add(h.line - 1);
    if (neighbour(h.line + 1, under)) cur.lines.add(h.line + 1);
  }
  close();
  return blocks;
}
