// The menu of a heading in the new interface's editor (ТЗ 44 §3.1): as the old one has it, with what a heading
// takes — «Сменить статус ›» (the statuses as capsules, §3.2), «Запланировать…», «Срок…», «Теги…»; «Перенести в…», «В архив»,
// «Сузить до заголовка», «Добавить заметку…»; «Копировать ссылку», «Открыть в мини-окне»; each plugin's section under
// its name; «Удалить заголовок» in `todo`. The editor (cm/orgEditor.ts) puts its own items above or below.

import { store } from '../store.svelte';
import { plugins } from '../api/host.svelte';
import { headingActionsByPlugin } from '../headingActions.svelte';
import { statusChoices } from '../headingChoices';
import { setStatusAt } from '../headingWrite';
import { toneFor } from '../org';
import { toneStyle } from '../colors';
import { isArchive } from '../names';
import type { MenuItem } from '../menuItems';

const PLUG = 'M8 2.5v4M12 2.5v4M5.5 6.5h9v3a4.5 4.5 0 0 1-9 0zM10 14v3.5';

/** What the editor does itself: the tags' popover, the note, the narrowing, the removal (one step of ⌘Z). */
export interface HeadingLocal {
  path: string; // the file in the notes folder
  line: number; // the heading's (0-based)
  tags: () => void;
  note: () => void;
  narrow?: () => void;
  remove: () => void;
}

export function headingMenu(l: HeadingLocal): MenuItem[] {
  const f = store.files.find((x) => x.name === l.path || x.path === l.path);
  const h = f?.headings.find((x) => x.line === l.line);
  if (!f || !h) return [];
  const key = (id: string) => store.keyHint(id) || undefined;
  const palette = (start: 'schedule' | 'deadline') => () => store.openPalette(start);
  const { open, done, set } = statusChoices(f.wf, h.keyword);
  const st = (s: { name: string; current: boolean }): MenuItem => ({
    label: s.name, capsule: toneStyle(toneFor(s.name, f.wf)), checked: s.current, ...(s.current ? { shortcut: 'сейчас' } : {}),
    action: () => setStatusAt(f.path, l.line, s.name),
  });
  const statuses: MenuItem[] = [
    ...open.map(st),
    ...(open.length && done.length ? ['sep' as const] : []),
    ...done.map(st),
    'sep',
    { note: '⇧← ⇧→ — предыдущий / следующий' },
    { note: `набор «${set}» · ${f.name.split('/').pop()}` },
  ];
  const items: MenuItem[] = [
    { label: 'Сменить статус', action: () => {}, sub: statuses, subWidth: 230, soft: true },
    { label: 'Запланировать…', shortcut: key('schedule'), action: palette('schedule') },
    { label: 'Срок…', shortcut: key('deadline'), action: palette('deadline') },
    { label: 'Теги…', shortcut: key('tags'), action: l.tags },
    'sep',
    { label: 'Перенести в…', shortcut: key('refile'), action: () => store.startRefile() },
    ...(isArchive(f.name) ? [] : [{ label: 'В архив', shortcut: key('archive'), action: () => void store.archiveSubtree({ path: f.path, line: l.line }) }]),
    ...(l.narrow ? [{ label: 'Сузить до заголовка', shortcut: key('narrow'), action: l.narrow }] : []),
    { label: 'Добавить заметку…', shortcut: key('addNote'), action: l.note },
    'sep',
    { label: 'Копировать ссылку', shortcut: key('copyLink'), action: () => store.copyHeadingLink(f.path, l.line) },
    { label: 'Открыть в мини-окне', shortcut: key('miniOpen'), action: () => store.openInMini(false) },
  ];
  for (const g of headingActionsByPlugin(f.name, l.line)) {
    items.push('sep', { head: plugins.name(g.plugin) });
    for (const a of g.actions) items.push({ label: a.label, icon: PLUG, action: () => a.run(f.name, l.line) });
  }
  items.push('sep', { label: 'Удалить заголовок', danger: true, action: l.remove });
  return items;
}
