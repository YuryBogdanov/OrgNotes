// An entry of the core's month (under the Inbox review's card, ТЗ 24 part 3) opened: its file in a new tab of this
// pane, or (⌘) in the neighbour pane. The days of the month: every dated entry of the notes (the calendar's layers and
// hidden files are the plugin's, ТЗ 29 — tech debt #99).

import { store } from './store.svelte';
import { openFile, openFromAgenda } from './layout';
import { byDay, entriesIn, type CalEntry } from './calIndex';

export function openEntry(e: { path: string; line: number }, neighbour = false) {
  const pi = store.layout.active;
  if (neighbour) {
    const t = openFromAgenda(store.layout, pi, e.path, e.line, '', 'neighbor');
    t.fromAgenda = null;
  } else {
    openFile(store.layout, pi, e.path, e.line, { focus: true });
    store.layout.active = pi;
  }
}
/** Every dated entry between two days, by day and in order. */
export function allDays(from: Date, to: Date): Map<string, CalEntry[]> {
  const open = [...new Set(store.files.flatMap((f) => f.wf.open))];
  return byDay(entriesIn(store.files, from, to), open);
}
