// A drawn date of «Оформленный текст» clicked (ТЗ 19; out of Pane.svelte for the new interface, ТЗ 42): the palette's
// calendar for its SCHEDULED or DEADLINE, with the file's day names. A status or a priority is the shell's menu.

import { store } from './store.svelte';
import { setPlanning, weekdayNames } from './edits';
import type { RichPick } from './orgRich';

/** A date: the calendar opened, true; anything else: false (the shell shows its menu). */
export function pickDate(pick: RichPick, path: string): boolean {
  if (pick.kind !== 'date') return false;
  const f = store.files.find((x) => x.path === path);
  const h = f?.headings.find((x) => x.line === pick.line);
  if (!f || !h) return true;
  const kind = pick.date ?? 'SCHEDULED';
  const old = new RegExp(`${kind}:\\s*(<[^>]*>)`).exec(f.text.split('\n')[h.line + 1] ?? '')?.[1];
  store.openCalendar({
    kind, initial: pick.value ?? new Date(), current: pick.value ?? null, old, names: weekdayNames(f.text), plate: { kind: 'heading', h, file: f },
    pick: (d) => store.patchAt(path, pick.line, (t, hh) => setPlanning(t, hh, kind, d)),
  });
  return true;
}
