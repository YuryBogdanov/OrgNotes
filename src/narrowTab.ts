// Narrowing a tab to one heading (ТЗ 42 §5.8, `⌃X N S` as in Emacs): which lines of the file it shows now. The tab
// keeps the heading's line and title; an edit above moves the line, so the title finds it again; the heading gone,
// the narrowing goes too. Pure.

import type { Heading } from './org';

export interface TabNarrow {
  line: number;
  title: string;
}
/** The lines shown — the heading's subtree, `end` exclusive — and its path; null: the heading is gone. */
export function narrowRangeOf(hs: Heading[], n: TabNarrow | undefined | null): { line: number; end: number; path: string[]; title: string } | null {
  if (!n) return null;
  const at = hs.find((h) => h.line === n.line && h.title === n.title) ?? nearest(hs.filter((h) => h.title === n.title), n.line);
  return at ? { line: at.line, end: at.end, path: [...at.path, at.title], title: at.title } : null;
}
const nearest = (hs: Heading[], line: number) => hs.reduce<Heading | undefined>((b, h) => (!b || Math.abs(h.line - line) < Math.abs(b.line - line) ? h : b), undefined);

/** The heading the caret is under (its line), to narrow to; null above the first heading. */
export function narrowTarget(hs: Heading[], line: number): TabNarrow | null {
  let best: Heading | undefined;
  for (const h of hs) if (h.line <= line && line < h.end && (!best || h.line > best.line)) best = h;
  return best ? { line: best.line, title: best.title } : null;
}
