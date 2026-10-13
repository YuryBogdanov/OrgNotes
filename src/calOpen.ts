// An entry of the core's month (under the Inbox review's card, ТЗ 24 part 3) opened: its file in a new tab of this
// pane, or (⌘) in the neighbour pane. The days of the month: the dated entries of the notes in the layers and files
// the calendar shows (it tells them, `ui.setMonthFilter`, #99); every one without it.

import { store } from './store.svelte';
import { plugins } from './api/host.svelte';
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
/** The dated entries between two days, by day and in order: in the calendar's layers and files when it says them. */
export function allDays(from: Date, to: Date): Map<string, CalEntry[]> {
  const f = plugins.monthFilter;
  const hidden = new Set(f?.hidden ?? []);
  const layers = f ? new Set(f.layers) : null;
  const files = store.agendaFiles.filter((x) => !hidden.has(x.name));
  const open = [...new Set(store.files.flatMap((x) => x.wf.open))];
  return byDay(entriesIn(files, from, to).filter((e) => !layers || layers.has(e.layer)), open);
}
