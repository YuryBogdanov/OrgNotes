// Editor panes and their tabs. One or two panes side by side; each keeps its own tabs; exactly one pane is
// active and receives keyboard input and commands. Plain data + functions that mutate it in place, so the
// store can keep it in $state and tests can use plain objects.

export type TabKind = 'file' | 'agenda' | 'untitled' | 'review' | 'goals' | 'goalReview'; // review: «Разбор Inbox», its `path` is the card's file; goals: ТЗ 23
export interface Cursor {
  line: number;
  col: number;
}
export interface Tab {
  id: string;
  kind: TabKind;
  path?: string; // file tabs
  cursor: Cursor;
  reveal?: { line: number; n: number; focus: boolean; col?: number } | null; // a request to move the caret there and scroll to it
  fromAgenda?: { line: number; title: string } | null; // "Открыто из агенды" caption
  title?: string; // untitled tabs: "Без названия", "Без названия 2", …
  text?: string; // untitled tabs: the text, not on disk until "Сохранить как…"
  agenda?: string; // agenda tabs: the id of a custom agenda («Мои агенды»); none = the built-in one
  goals?: string; // goals tabs: the source shown (file#heading), '*' = «Обзор квартала»
}
export interface Pane {
  id: string;
  tabs: Tab[];
  active: number; // index into tabs
}
export interface Layout {
  panes: Pane[]; // left to right, 1 or 2
  active: number; // index into panes
  ratio: number; // share of the left pane when there are two
}

export const MAX_PANES = 2;
export const MIN_PANE = 320;

let n = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(++n).toString(36)}`;
let revealSeq = 0;
const reveal = (line: number, focus = false) => ({ line, n: ++revealSeq, focus });

export function newTab(kind: TabKind, path?: string, line = 0, focus = false): Tab {
  return { id: uid('t'), kind, path, cursor: { line, col: 0 }, reveal: kind === 'file' ? reveal(line, focus) : null, fromAgenda: null };
}
export const copyTab = (t: Tab): Tab => ({ ...newTab(t.kind, t.path, t.cursor.line), cursor: { ...t.cursor }, reveal: t.kind === 'file' ? reveal(t.cursor.line) : null, agenda: t.agenda, goals: t.goals });
const newPane = (tabs: Tab[]): Pane => ({ id: uid('p'), tabs, active: 0 });

export const emptyLayout = (first?: Tab): Layout => ({ panes: [newPane(first ? [first] : [])], active: 0, ratio: 0.5 });

export const activePane = (L: Layout) => L.panes[L.active];
export const activeTab = (L: Layout): Tab | undefined => {
  const p = activePane(L);
  return p?.tabs[p.active];
};
export const neighbor = (L: Layout, pane: number) => (L.panes.length === 2 ? 1 - pane : -1);

/** The kind shown by the second pane, which is what the toolbar buttons reflect (null: no second pane). */
export const secondKind = (L: Layout): TabKind | null => {
  if (L.panes.length < 2) return null;
  const p = L.panes[1];
  const k = p.tabs[p.active]?.kind ?? null;
  return k === 'untitled' ? 'file' : k; // a text tab of any kind lights "Второй редактор"
};

function insertAfterActive(p: Pane, t: Tab) {
  const at = p.tabs.length ? p.active + 1 : 0;
  p.tabs.splice(at, 0, t);
  p.active = at;
}

/** Add a pane with one tab on the left or the right; returns its index. No-op (returns -1) with two panes. */
export function addPane(L: Layout, side: 'left' | 'right', tab: Tab): number {
  if (L.panes.length >= MAX_PANES) return -1;
  const p = newPane([tab]);
  if (side === 'left') {
    L.panes.unshift(p);
    L.active += 1; // the panes after it moved one to the right
    return 0;
  }
  L.panes.push(p);
  return L.panes.length - 1;
}

/**
 * Open `path` at `line` in pane `pi`. A tab that already shows the file is reused; otherwise the active file
 * tab is retargeted when `replace` is set, else a new tab goes after the active one.
 */
export function openFile(L: Layout, pi: number, path: string, line: number, opts: { replace?: boolean; focus?: boolean } = {}): Tab {
  const p = L.panes[pi];
  let i = p.tabs.findIndex((t) => t.kind === 'file' && t.path === path);
  if (i < 0 && opts.replace && p.tabs[p.active]?.kind === 'file') i = p.active;
  if (i >= 0) {
    const t = p.tabs[i];
    t.path = path;
    t.cursor = { line, col: 0 };
    t.reveal = reveal(line, opts.focus ?? true);
    t.fromAgenda = null;
    p.active = i;
    return t;
  }
  const t = newTab('file', path, line, opts.focus ?? true);
  insertAfterActive(p, t);
  return t;
}

export function openAgenda(L: Layout, pi: number): Tab {
  const p = L.panes[pi];
  const i = p.tabs.findIndex((t) => t.kind === 'agenda');
  if (i >= 0) {
    p.active = i;
    return p.tabs[i];
  }
  const t = newTab('agenda');
  insertAfterActive(p, t);
  return t;
}

/** «Цели»: the goals tab of the pane shows `key` (made if there is none). */
export function openGoals(L: Layout, pi: number, key: string): Tab {
  const p = L.panes[pi];
  const i = p.tabs.findIndex((t) => t.kind === 'goals');
  if (i >= 0) {
    p.active = i;
    p.tabs[i].goals = key;
    return p.tabs[i];
  }
  const t = { ...newTab('goals'), goals: key };
  insertAfterActive(p, t);
  return t;
}

/** Close one tab. The neighbour to the right (else left) becomes active; an empty second pane closes. */
export function closeTab(L: Layout, pi: number, ti: number) {
  const p = L.panes[pi];
  if (!p || ti < 0 || ti >= p.tabs.length) return;
  p.tabs.splice(ti, 1);
  if (ti < p.active) p.active -= 1; // a tab before the active one went away
  else if (ti === p.active) p.active = Math.min(ti, p.tabs.length - 1); // the one to the right takes its place, else the left one
  p.active = Math.max(0, p.active);
  if (!p.tabs.length && L.panes.length > 1) {
    L.panes.splice(pi, 1);
    L.active = 0;
  }
}

/**
 * Close pane `pi`; its tabs move into the remaining pane after that pane's tabs, so nothing is lost.
 * The remaining pane becomes active.
 */
export function closePane(L: Layout, pi: number) {
  if (L.panes.length < 2) return;
  const gone = L.panes[pi];
  const keep = L.panes[1 - pi];
  for (const t of gone.tabs) if (!keep.tabs.some((x) => sameContent(x, t))) keep.tabs.push(t);
  L.panes = [keep];
  L.active = 0;
}
const sameContent = (a: Tab, b: Tab) => a.kind === b.kind && ((a.kind === 'agenda' && (a.agenda ?? '') === (b.agenda ?? '')) || (a.kind === 'file' && a.path === b.path) || a.id === b.id);

/** "Оставить одну панель": close the inactive pane. */
export const keepOne = (L: Layout) => closePane(L, 1 - L.active);

/** Swap left and right, with all tabs; the same pane stays active. */
export function swap(L: Layout) {
  if (L.panes.length < 2) return;
  L.panes.reverse();
  L.active = 1 - L.active;
  L.ratio = 1 - L.ratio;
}

/** "Разделить вправо": a second pane on the right with a copy of the current tab; it becomes active. */
export function splitRight(L: Layout): boolean {
  const t = activeTab(L);
  if (L.panes.length >= MAX_PANES || !t) return false;
  L.active = addPane(L, 'right', copyTab(t));
  return true;
}

export function focusPane(L: Layout, dir: -1 | 1) {
  const to = L.active + dir;
  if (to >= 0 && to < L.panes.length) L.active = to;
}

/**
 * The three toolbar buttons ("Второй редактор", "Агенда", "Календарь"): exactly one is pressed and it reflects
 * the kind of the second pane's active tab.
 *  - pressing an unpressed one opens that content in the second pane (creating it on the right if needed);
 *  - pressing the pressed "Второй редактор" closes the second pane, its tabs move to the first one (nothing is lost);
 *  - pressing the pressed "Агенда" closes the agenda tab (and the pane with it when that was its only tab).
 * `fileTab` is what a new second editor shows: a copy of the current tab.
 */
export function toggleSecond(L: Layout, kind: TabKind, fileTab: () => Tab | undefined) {
  const pressed = secondKind(L);
  if (pressed === kind && kind === 'file') return closePane(L, 1);
  if (pressed === kind) {
    const p = L.panes[1];
    if (p.tabs.length === 1) {
      L.panes.splice(1, 1);
      L.active = 0;
    } else closeTab(L, 1, p.active);
    return;
  }
  const make = () => (kind === 'agenda' ? newTab('agenda') : fileTab());
  if (L.panes.length < 2) {
    const t = make();
    if (!t) return;
    L.active = addPane(L, 'right', t);
    return;
  }
  if (kind === 'agenda') openAgenda(L, 1);
  else {
    const t = fileTab();
    if (t) insertAfterActive(L.panes[1], t);
  }
  L.active = 1;
}

/**
 * A task picked in an agenda that lives in pane `ai`.
 *  - 'neighbor': open it in the other pane (created on the LEFT if there is none: the file goes left, the agenda
 *    stays right), keep the focus in the agenda;
 *  - 'neighbor-focus': the same, focus moves to the file;
 *  - 'here': open it as a new tab in the agenda's own pane.
 */
export function openFromAgenda(L: Layout, ai: number, path: string, line: number, title: string, mode: 'neighbor' | 'neighbor-focus' | 'here'): Tab {
  if (mode === 'here') {
    const t = openFile(L, ai, path, line, { focus: true });
    t.fromAgenda = { line, title };
    L.active = ai;
    return t;
  }
  let target = neighbor(L, ai);
  let agenda = ai;
  if (target < 0) {
    target = addPane(L, 'left', newTab('file', path, line, mode === 'neighbor-focus'));
    agenda = ai + 1;
    L.active = agenda;
  }
  const t = openFile(L, target, path, line, { replace: true, focus: mode === 'neighbor-focus' });
  t.fromAgenda = { line, title };
  L.active = mode === 'neighbor-focus' ? target : agenda;
  return t;
}

// ---- tabs: new, move, duplicate, close others ------------------------------------------

export const UNTITLED = 'Без названия';

/** A new empty tab at the end of pane `pi`'s row: "Без названия", then "Без названия 2", … */
export function newUntitled(L: Layout, pi: number): Tab {
  const p = L.panes[pi];
  const taken = new Set(p.tabs.filter((t) => t.kind === 'untitled').map((t) => t.title));
  let title = UNTITLED;
  for (let k = 2; taken.has(title); k++) title = `${UNTITLED} ${k}`;
  const t: Tab = { ...newTab('untitled'), title, text: '' };
  p.tabs.push(t);
  p.active = p.tabs.length - 1;
  L.active = pi;
  return t;
}

/** The neighbour pane to send a tab to: the nearest one to the right, else to the left; -1 with one pane. */
export const targetOf = (L: Layout, pi: number) => (pi + 1 < L.panes.length ? pi + 1 : pi - 1 >= 0 ? pi - 1 : -1);

/** "Переместить в соседний редактор": goes after the target's active tab and becomes active there. */
export function moveTab(L: Layout, pi: number, ti: number): boolean {
  const to = targetOf(L, pi);
  const t = L.panes[pi]?.tabs[ti];
  if (to < 0 || !t) return false;
  const target = L.panes[to];
  const same = target.tabs.findIndex((x) => sameContent(x, t) && x.kind !== 'untitled');
  closeTab(L, pi, ti); // may remove the source pane
  const ti2 = L.panes.indexOf(target);
  if (same >= 0) target.active = same; // already open there: no second tab
  else insertAfterActive(target, t);
  L.active = ti2;
  return true;
}

/** "Продублировать в соседнем редакторе": the same tab in the neighbour pane; the original stays. */
export function duplicateTab(L: Layout, pi: number, ti: number): boolean {
  const to = targetOf(L, pi);
  const t = L.panes[pi]?.tabs[ti];
  if (to < 0 || !t || t.kind === 'untitled') return false;
  const target = L.panes[to];
  const same = target.tabs.findIndex((x) => sameContent(x, t));
  if (same >= 0) target.active = same;
  else insertAfterActive(target, copyTab(t));
  L.active = to;
  return true;
}

/** Tabs of pane `pi` other than `ti`, in order (what "Закрыть остальные" has to close). */
export const othersOf = (L: Layout, pi: number, ti: number) => (L.panes[pi]?.tabs ?? []).filter((_, i) => i !== ti);

// ---- paths of files that moved or disappeared ------------------------------------------

export function mapPaths(L: Layout, map: (p: string) => string) {
  for (const p of L.panes) for (const t of p.tabs) if (t.path) t.path = map(t.path);
}

/** Close tabs whose file is gone. */
export function dropMissing(L: Layout, exists: (path: string) => boolean) {
  for (let pi = L.panes.length - 1; pi >= 0; pi--) {
    const p = L.panes[pi];
    for (let ti = p.tabs.length - 1; ti >= 0; ti--) {
      const t = p.tabs[ti];
      if (t.kind === 'file' && t.path && !exists(t.path)) closeTab(L, pi, ti);
    }
  }
  if (L.active >= L.panes.length) L.active = L.panes.length - 1;
}

// ---- restoring after a restart -----------------------------------------------------------

export function serialize(L: Layout): string {
  return JSON.stringify({
    v: 1,
    active: L.active,
    ratio: L.ratio,
    // untitled tabs are not restored after a restart (their text is not on disk), nor a review (it is a session)
    panes: L.panes.map((p) => {
      const tabs = p.tabs.filter((t) => t.kind !== 'untitled' && t.kind !== 'review' && t.kind !== 'goalReview');
      const act = p.tabs[p.active];
      return { active: Math.max(0, tabs.indexOf(act)), tabs: tabs.map((t) => ({ kind: t.kind, path: t.path, cursor: t.cursor, ...(t.agenda ? { agenda: t.agenda } : {}), ...(t.goals ? { goals: t.goals } : {}) })) };
    }),
  });
}

/** Rebuild a saved layout; files that can no longer be opened are skipped. Null when nothing usable is left. */
export function restore(raw: string | null, exists: (path: string) => boolean): Layout | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    const panes: Pane[] = [];
    for (const sp of Array.isArray(d?.panes) ? d.panes.slice(0, MAX_PANES) : []) {
      const tabs: Tab[] = [];
      let active = 0;
      (Array.isArray(sp.tabs) ? sp.tabs : []).forEach((st: any, i: number) => {
        if (st?.kind === 'agenda') tabs.push({ ...newTab('agenda'), ...(typeof st.agenda === 'string' && st.agenda ? { agenda: st.agenda } : {}) });
        else if (st?.kind === 'goals') tabs.push({ ...newTab('goals'), goals: typeof st.goals === 'string' && st.goals ? st.goals : '*' });
        else if (st?.kind === 'file' && typeof st.path === 'string' && exists(st.path)) {
          const t = newTab('file', st.path, st.cursor?.line ?? 0);
          t.cursor = { line: st.cursor?.line ?? 0, col: st.cursor?.col ?? 0 };
          t.reveal = null; // the editor restores the caret, column included
          tabs.push(t);
        } else return;
        if (i === sp.active) active = tabs.length - 1;
      });
      if (tabs.length) panes.push({ id: uid('p'), tabs, active });
    }
    if (!panes.length) return null;
    const ratio = typeof d.ratio === 'number' && d.ratio > 0.1 && d.ratio < 0.9 ? d.ratio : 0.5;
    return { panes, active: Math.min(Math.max(0, d.active | 0), panes.length - 1), ratio };
  } catch {
    return null;
  }
}
