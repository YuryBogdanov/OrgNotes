// What the editor reads of a document, once per version of it (tech sprint 4.3, from Editor.svelte): the heading
// lines (not `* x` inside #+BEGIN_…/#+END_… blocks), the drawers by their first line, the links.

import type { Text } from '@codemirror/state';
import { drawerRanges, headingLines, type DrawerRange } from '../org';
import { extractLinks, type OrgLink } from '../links';

export const HEAD = /^(\*+)\s/;
// heading lines per document version; ignores `* x` inside #+BEGIN_…/#+END_… blocks
const cache = new WeakMap<Text, Set<number>>();
export const headingSet = (doc: Text) => {
  let s = cache.get(doc);
  if (!s) cache.set(doc, (s = headingLines(doc.toString().split('\n'))));
  return s;
};

// drawers per document version, by the line (0-based) they start on
const drawerCache = new WeakMap<Text, Map<number, DrawerRange>>();
export const drawerMap = (doc: Text) => {
  let m = drawerCache.get(doc);
  if (!m) drawerCache.set(doc, (m = new Map(drawerRanges(doc.toString().split('\n')).map((d) => [d.start, d]))));
  return m;
};
/** The folded range of a drawer: from the end of its first line to the end of its :END: line. */
export const drawerFold = (doc: Text, d: DrawerRange) => ({ from: doc.line(d.start + 1).to, to: doc.line(d.end + 1).to });

const linkCache = new WeakMap<Text, OrgLink[]>();
export const linksIn = (doc: Text) => {
  let l = linkCache.get(doc);
  if (!l) linkCache.set(doc, (l = extractLinks(doc.toString())));
  return l;
};
export const linkAt = (doc: Text, pos: number) => linksIn(doc).find((l) => pos >= l.from && pos <= l.to);
