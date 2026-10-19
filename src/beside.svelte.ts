// The file beside a list (ТЗ 56): a tab of a list (the agenda, «Сегодня», the search's results, a tag, a plugin's
// list) shows on its right the file of the row chosen, in «Исходник», edited in place. It lives with its tab — kept
// while another tab is shown — and not after a restart (here, in memory, by the tab's id).

import { store } from './store.svelte';
import { lsGet, lsSet } from './storage';

export interface Beside {
  path: string;
  /** The heading's line (0-based): its subtree marked, in the upper third. */
  line: number;
  /** Where the caret goes: the end of the first line of the text under it, or a search's match. */
  caret: { line: number; col: number };
  /** A search's match to show (ТЗ 56 §4), its length. */
  hit?: { line: number; col: number; len: number };
  /** «закреплён»: the choice in the list does not change it (§3). */
  pinned: boolean;
  /** Bumped on each open: the editor reveals again. */
  n: number;
}
const byTab = $state<Record<string, Beside>>({});
/** The list's share of the width (35–65 %), one for every list, on this Mac. */
export const besideShare = $state({ v: Math.min(0.65, Math.max(0.35, Number(lsGet('next:besideShare')) || 0.46)) });
export const setBesideShare = (v: number) => {
  besideShare.v = Math.round(Math.min(0.65, Math.max(0.35, v)) * 1000) / 1000;
  lsSet('next:besideShare', String(besideShare.v));
};
let seq = 0;

export const besideOf = (tabId: string | undefined): Beside | null => (tabId ? (byTab[tabId] ?? null) : null);
/** The active tab's file beside (its list hides its second columns while it is open). */
export const besideNow = () => besideOf(store.tab?.id);

/** Where the caret goes under a heading: the end of the first line of its text, else the end of the heading. */
export function caretUnder(text: string, line: number): { line: number; col: number } {
  const lines = text.split('\n');
  const next = lines[line + 1];
  if (next !== undefined && !/^\*+\s/.test(next)) return { line: line + 1, col: next.length };
  return { line, col: (lines[line] ?? '').length };
}

/** The file of `at` beside the tab (its path from the folder or absolute; its heading's line). */
export function openBeside(tabId: string, at: { path: string; line: number; hit?: Beside['hit'] }, o: { keepPin?: boolean } = {}) {
  const f = store.files.find((x) => x.path === at.path || x.name === at.path);
  if (!f) return false;
  const was = byTab[tabId];
  byTab[tabId] = {
    path: f.path,
    line: at.line,
    caret: at.hit ? { line: at.hit.line, col: at.hit.col } : caretUnder(f.text, at.line),
    ...(at.hit ? { hit: at.hit } : {}),
    pinned: o.keepPin ? !!was?.pinned : false,
    n: ++seq,
  };
  return true;
}
export function closeBeside(tabId: string) {
  delete byTab[tabId];
}
export function togglePin(tabId: string) {
  const b = byTab[tabId];
  if (b) b.pinned = !b.pinned;
}

/** The focus into the file beside the tab (⌃⌘→, a second ⌥↩ on the same row). */
export function focusBesideFile(tabId: string) {
  const ed = document.querySelector<HTMLElement>(`[data-beside="${CSS.escape(tabId)}"] .side .cm-content`);
  ed?.focus();
  return !!ed;
}
/** §3: the row chosen in the list, 120 ms after (the caller waits): its file, unless pinned, unless the caret is in
 *  the file (typing does not take it away), unless it is shown already. */
export function followBeside(tabId: string, at: { path: string; line: number; hit?: Beside['hit'] }) {
  const b = byTab[tabId];
  if (!b || b.pinned || (b.path === at.path && b.line === at.line && b.hit?.line === at.hit?.line && b.hit?.col === at.hit?.col)) return;
  if (document.querySelector(`[data-beside="${CSS.escape(tabId)}"] .side`)?.contains(document.activeElement)) return;
  openBeside(tabId, at, { keepPin: true });
}
