// The navigator's tree (ТЗ 02): which nodes are open. Folded by default, the path to the current file opened; the
// state is kept per notes folder. A node is known by its key: a folder by its path and «/», a file by its path, a
// heading by its file and the chain of titles above it (so it survives edits elsewhere in the file).

export const EXPAND_CAP = 2000; // «Развернуть всё»: with more nodes than this, headings stay closed

export interface TreeFile {
  name: string; // relative path
  path: string;
  headings: { title: string; level: number; parent: number; line: number; end: number }[];
}
export interface TreeNode {
  key: string;
  parent: string | null;
  kind: 'folder' | 'file' | 'heading';
  kids: boolean; // it can be opened
}

const parentOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
export const folderKey = (rel: string) => rel + '/';

/** «path#Цели › Q4 › Бюджет»: the titles from the top of the file down to heading `i`. */
export function headingKey(f: TreeFile, i: number): string {
  const chain: string[] = [];
  for (let j = i; j >= 0; j = f.headings[j].parent) chain.unshift(f.headings[j].title);
  return f.path + '#' + chain.join(' › ');
}

/** Every node of the tree, parents before children. Headings only when the tree shows them. */
export function treeNodes(folders: string[], files: TreeFile[], withHeadings: boolean): TreeNode[] {
  const dirs = new Set<string>();
  const add = (rel: string) => {
    for (let r = rel; r && !dirs.has(r); r = parentOf(r)) dirs.add(r);
  };
  folders.forEach(add);
  files.forEach((f) => add(parentOf(f.name)));
  const full = new Set<string>(); // folders with something inside
  for (const d of dirs) if (parentOf(d)) full.add(parentOf(d));
  for (const f of files) if (parentOf(f.name)) full.add(parentOf(f.name));
  const out: TreeNode[] = [...dirs]
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
    .map((d) => ({ key: folderKey(d), parent: parentOf(d) ? folderKey(parentOf(d)) : null, kind: 'folder' as const, kids: full.has(d) }));
  for (const f of files) {
    const dir = parentOf(f.name);
    const hs = withHeadings ? f.headings : [];
    out.push({ key: f.path, parent: dir ? folderKey(dir) : null, kind: 'file', kids: hs.length > 0 });
    hs.forEach((h, i) =>
      out.push({ key: headingKey(f, i), parent: h.parent >= 0 ? headingKey(f, h.parent) : f.path, kind: 'heading', kids: f.headings[i + 1]?.parent === i }),
    );
  }
  return out;
}

/** What is opened to show the current file: its folders, the file and the headings above the current heading. */
export function pathKeys(f: TreeFile | undefined, selected: number, withHeadings: boolean): string[] {
  if (!f) return [];
  const out: string[] = [];
  for (let d = parentOf(f.name); d; d = parentOf(d)) out.unshift(folderKey(d));
  if (withHeadings && f.headings.length) {
    out.push(f.path);
    const chain: string[] = [];
    for (let j = selected >= 0 ? f.headings[selected]?.parent ?? -1 : -1; j >= 0; j = f.headings[j].parent) chain.unshift(headingKey(f, j));
    out.push(...chain);
  }
  return out;
}

/** «Развернуть всё»: every node that can be opened; headings left out of a tree bigger than the cap. */
export function expandAll(nodes: TreeNode[], cap = EXPAND_CAP): { keys: string[]; capped: boolean } {
  const capped = nodes.length > cap && nodes.some((n) => n.kind === 'heading' && n.kids);
  return { keys: nodes.filter((n) => n.kids && !(capped && n.kind === 'heading')).map((n) => n.key), capped };
}

/** The node and everything under it that can be opened (⌥-click, ⌥→ ⌥←). */
export function subtreeKeys(nodes: TreeNode[], key: string): string[] {
  const kids = new Map<string, TreeNode[]>();
  for (const n of nodes) if (n.parent) (kids.get(n.parent) ?? kids.set(n.parent, []).get(n.parent)!).push(n);
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const out: string[] = [];
  const walk = (k: string) => {
    const n = byKey.get(k);
    if (n?.kids) out.push(k);
    for (const c of kids.get(k) ?? []) walk(c.key);
  };
  walk(key);
  return out;
}

/** Can the buttons change anything: something open beyond the path; something openable still closed. */
export function buttons(nodes: TreeNode[], open: Set<string>, path: string[], cap = EXPAND_CAP) {
  const exists = new Set(nodes.filter((n) => n.kids).map((n) => n.key));
  const keep = new Set(path);
  const collapse = [...open].some((k) => exists.has(k) && !keep.has(k));
  const expand = expandAll(nodes, cap).keys.some((k) => !open.has(k));
  return { collapse, expand };
}

// ---- kept per notes folder, on this Mac ---------------------------------------------------------------------------

const storeKey = (dir: string) => 'nav:open:' + dir;
export function readOpen(dir: string | null): Set<string> | null {
  if (!dir) return null;
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(dir)) ?? 'null');
    return Array.isArray(v) ? new Set(v.filter((x): x is string => typeof x === 'string')) : null;
  } catch {
    return null;
  }
}
export function writeOpen(dir: string | null, open: Set<string>) {
  if (!dir) return;
  try {
    localStorage.setItem(storeKey(dir), JSON.stringify([...open]));
  } catch {
    /* no storage: the tree starts folded next time */
  }
}
