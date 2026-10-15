// The navigator's rows (ТЗ 02; tech sprint 4.1, from Navigator.svelte): the tree of the folder walked into what is
// shown — folders first by name, then files, then (with «Показывать заголовки») their headings down to the folded
// ones; the row of a new file or folder being named; progress and the colour of each status.

import { subtreeProgress, toneFor, type Heading, type Workflow } from './org';
import { toneStyle } from './colors';
import { fileTypeOf } from './fileTypes.svelte';
import { folderKey, headingKey, parentOf } from './navTree';

export type NavRow = {
  key: string; kind: 'folder' | 'file' | 'heading' | 'new'; depth: number; label: string;
  open: boolean; hasKids: boolean; rel: string; file?: number; line?: number;
  kw?: string | null; tone?: string; cnt?: string; selected?: boolean; done?: boolean;
};
export interface NavFile {
  name: string; // relative path
  path: string;
  headings: Heading[];
  wf: Workflow;
}
export interface NavOpts {
  /** «Показывать заголовки в навигаторе». */
  headings: boolean;
  /** The folder a new file or folder is being named in (null: none). */
  creating: string | null;
  /** The current file (its index) and heading (-1: none). */
  cur: number;
  selected: number;
}

const base = (n: string) => n.split('/').pop()!;
const noExt = (n: string) => n.replace(/\.org$/, '').replace(fileTypeOf(n) ? /\.[^.]+$/ : /$^/, '');

/** The rows shown, top to bottom; `open`: the keys of the open nodes. */
export function visibleRows(folders: string[], files: NavFile[], open: ReadonlySet<string>, o: NavOpts): NavRow[] {
  type Node = { name: string; rel: string; children: Map<string, Node>; files: number[] };
  const root: Node = { name: '', rel: '', children: new Map(), files: [] };
  const ensure = (rel: string) => {
    let n = root;
    let acc = '';
    for (const p of rel.split('/').filter(Boolean)) {
      acc = acc ? acc + '/' + p : p;
      if (!n.children.has(p)) n.children.set(p, { name: p, rel: acc, children: new Map(), files: [] });
      n = n.children.get(p)!;
    }
    return n;
  };
  folders.forEach(ensure);
  files.forEach((f, i) => ensure(parentOf(f.name)).files.push(i));

  const out: NavRow[] = [];
  const newRow = (dir: string, depth: number) => {
    if (o.creating !== null && o.creating === dir)
      out.push({ key: '\u0000new:' + dir, kind: 'new', depth, label: '', open: false, hasKids: false, rel: dir });
  };
  const walk = (n: Node, depth: number) => {
    newRow(n.rel, depth);
    const kids = [...n.children.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    for (const c of kids) {
      const key = folderKey(c.rel);
      const isOpen = open.has(key);
      // an empty folder has no chevron (its column stays, so the names line up)
      const full = c.children.size + c.files.length > 0 || o.creating === c.rel;
      out.push({ key, kind: 'folder', depth, label: c.name, open: isOpen && full, hasKids: full, rel: c.rel });
      if (isOpen) walk(c, depth + 1);
    }
    for (const i of n.files) {
      const f = files[i];
      // headings show only with "Показывать заголовки в навигаторе"; the outline lives in the inspector
      const kids = o.headings && f.headings.length > 0;
      const fopen = kids && open.has(f.path);
      out.push({
        key: f.path, kind: 'file', depth, label: noExt(base(f.name)), open: fopen, hasKids: kids,
        rel: f.name, file: i, selected: i === o.cur && (!fopen || o.selected < 0),
      });
      if (!fopen) continue;
      let hiddenUntil = -1;
      f.headings.forEach((h, hi) => {
        if (h.line < hiddenUntil) return;
        const hasKids = f.headings[hi + 1]?.parent === hi;
        const key = headingKey(f, hi);
        const isOpen = hasKids && open.has(key);
        if (hasKids && !isOpen) hiddenUntil = h.end;
        const p = hasKids ? subtreeProgress(f.headings, hi, f.wf) : { done: 0, total: 0 };
        out.push({
          key, kind: 'heading', depth: depth + h.level, label: h.title, open: isOpen, hasKids, rel: f.name,
          file: i, line: h.line, kw: h.keyword, tone: h.keyword ? toneStyle(toneFor(h.keyword, f.wf)) : undefined,
          cnt: p.total ? `${p.done}/${p.total}` : '',
          selected: i === o.cur && hi === o.selected,
          done: !!h.keyword && f.wf.done.includes(h.keyword),
        });
      });
    }
  };
  walk(root, 0);
  return out;
}
