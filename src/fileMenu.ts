// The menu of a row of the files' tree (ТЗ 02, 35, 39; out of Navigator.svelte for the new interface, ТЗ 42 §4.2):
// a folder — «Новый файл», the plugins' file types, «Новая папка»; a file — «Показывать как ›» (fix-49-2); a file or a
// folder — rename, move, Finder, the Trash; a heading — its link and the plugins' items. Both navigators draw these.

import { store } from './store.svelte';
import { fileTypes } from './fileTypes.svelte';
import { headingActionsFor } from './headingActions.svelte';
import { viewMenuItem } from './tabMenu';
import type { MenuItem } from './menuItems';

/** «Новый файл» / a plugin's type / «Новая папка» in `dir` ('' — the folder's root); `start` opens the name's row. */
export const createItems = (dir: string, start: (dir: string, kind: 'file' | 'folder', type?: string) => void): MenuItem[] => [
  { label: 'Новый файл', action: () => start(dir, 'file') },
  // the plugins' file types: «Новый холст» (ТЗ 39)
  ...fileTypes().map((t): MenuItem => ({ label: t.newLabel, action: () => start(dir, 'file', t.ext) })),
  { label: 'Новая папка', action: () => start(dir, 'folder') },
];

/** A file or a folder of the tree (`rel` in the notes folder). */
export function entryItems(rel: string, isDir: boolean, start: (dir: string, kind: 'file' | 'folder', type?: string) => void): MenuItem[] {
  const as = isDir ? null : viewMenuItem(rel);
  return [
    ...(isDir ? [...createItems(rel, start), 'sep' as const] : []),
    ...(as ? [as, 'sep' as const] : []),
    { label: 'Переименовать', action: () => (store.renaming = rel) },
    { label: 'Переместить…', action: () => (store.dialog = { type: 'move', rel, isDir }) },
    { label: 'Показать в Finder', action: () => store.revealEntry(rel) },
    'sep',
    { label: 'Переместить в Корзину…', danger: true, action: () => (store.dialog = { type: 'delete', rel, isDir }) },
  ];
}

/** A heading of a file (its index in `store.files`, its line). */
export function headingItems(file: number, line: number): MenuItem[] {
  const f = store.files[file];
  if (!f) return [];
  // the plugins' items on a heading (ТЗ 39: «Показать ветку как mindmap»)
  const more = headingActionsFor(f.name, line).map((a): MenuItem => ({ label: a.label, action: () => a.run(f.name, line) }));
  return [{ label: 'Копировать ссылку на заголовок', shortcut: store.keyHint('copyLink') || undefined, action: () => void store.copyHeadingLink(f.path, line) }, ...(more.length ? ['sep' as const, ...more] : [])];
}
