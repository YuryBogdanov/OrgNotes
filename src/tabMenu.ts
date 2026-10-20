// The menu of a tab (tech sprint 4.2; out of PaneTabs.svelte for the new interface, ТЗ 42 §4.3): close, the others,
// to the neighbouring editor, «Показывать как ›» (the text and the plugins' views), the navigator, the path.

import type { MenuItem } from './menuItems';
import { store } from './store.svelte';
import { allFileViews, viewOf, type FileViewSpec } from './views';
import { fileTypeOf, fileTypes } from './fileTypes.svelte';
import { canPin, isFilePinned, isPinned, othersOf, targetOf, type Tab } from './layout';

export function tabMenuItems(pi: number, t: Tab): MenuItem[] {
  const pane = store.layout.panes[pi];
  const idx = () => pane.tabs.findIndex((x) => x.id === t.id);
  const to = targetOf(store.layout, pi);
  const items: MenuItem[] = [
    { label: 'Закрыть', shortcut: store.keyHint('closeTab'), action: () => store.closeTab(pi, idx()) },
    // ТЗ 58: the pinned tabs stay — said while there is one besides this tab
    { label: 'Закрыть остальные', hint: pane.tabs.some((x) => x.id !== t.id && isFilePinned(x)) ? 'кроме закреплённых' : undefined, shortcut: store.keyHint('closeOthers'), disabled: !othersOf(store.layout, pi, idx()).length, action: () => store.closeOthers(pi, idx()) },
    'sep',
    ...(store.nextUi && canPin(t) ? [isFilePinned(t)
      ? { label: 'Открепить вкладку', action: () => store.pinTab(pi, idx(), false) }
      : { label: 'Закрепить вкладку', action: () => store.pinTab(pi, idx(), true) }, 'sep' as const] : []),
    { label: 'Переместить в соседний редактор', shortcut: store.keyHint(to > pi ? 'moveRight' : 'moveLeft'), disabled: to < 0 || isPinned(t), action: () => store.moveTab(pi, idx()) },
    { label: 'Продублировать в соседнем редакторе', shortcut: store.keyHint(to > pi ? 'dupRight' : 'dupLeft'), disabled: to < 0 || t.kind === 'untitled' || !!viewOf(t.kind)?.single || isPinned(t), action: () => store.duplicateTab(pi, idx()) },
  ];
  if (t.kind === 'file') {
    const as = viewMenuItem(store.fileOf(t)?.name ?? t.path ?? '', t);
    items.push('sep');
    if (as) items.push(as, 'sep');
    items.push({ label: 'Показать в навигаторе', shortcut: store.keyHint('revealInNav'), action: () => store.revealInNavigator(t) });
    items.push({ label: 'Скопировать путь', shortcut: store.keyHint('copyPath'), action: () => store.copyPath(t) });
  }
  return items;
}

/** The views a file may be shown in besides its text: the plugins' (the board, a mindmap…), not a file type's own (a
 *  `.canvas` has its view as its only one). */
export const otherViews = (): FileViewSpec[] => allFileViews().filter((v) => !fileTypes().some((t) => t.view === v.id));

/** «Показывать как ›» (fix-49-2 §3) of an Org file — the same in the tab's menu and the navigator's: the text and the
 *  plugins' views, ✓ at the file's; a choice is the file's (every tab of it switches; one not open is shown so when
 *  opened). A tab of a view on one heading (`tab.scope`) switches alone. None for a plugin's file type. */
export function viewMenuItem(name: string, tab?: Tab): MenuItem | null {
  if (!name || fileTypeOf(name)) return null;
  const now = tab ? store.viewOf(tab) : store.viewOfFile(store.files.find((f) => f.name === name));
  const pick = (v: string) => (tab ? store.showAs(tab, v) : store.showFileAs(name, v));
  return {
    label: 'Показывать как', action: () => {},
    sub: [
      { label: 'Текст', checked: now === '', action: () => pick('') },
      ...otherViews().map((v): MenuItem => ({ label: v.title, checked: now === v.id, shortcut: v.key ? store.keyHint(v.key) || undefined : undefined, action: () => pick(v.id) })),
      'sep', { note: 'Виды добавляют плагины' },
    ],
  };
}
