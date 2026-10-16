// The menu of a tab (tech sprint 4.2; out of PaneTabs.svelte for the new interface, ТЗ 42 §4.3): close, the others,
// to the neighbouring editor, «Показать как ›» (the text and the plugins' views), the navigator, the path.

import type { MenuItem } from './ContextMenu.svelte';
import { store } from './store.svelte';
import { allFileViews, viewOf } from './views';
import { fileTypeOf } from './fileTypes.svelte';
import { isPinned, targetOf, type Tab } from './layout';

export function tabMenuItems(pi: number, t: Tab): MenuItem[] {
  const pane = store.layout.panes[pi];
  const idx = () => pane.tabs.findIndex((x) => x.id === t.id);
  const to = targetOf(store.layout, pi);
  const items: MenuItem[] = [
    { label: 'Закрыть', shortcut: store.keyHint('closeTab'), action: () => store.closeTab(pi, idx()) },
    { label: 'Закрыть остальные', shortcut: store.keyHint('closeOthers'), disabled: pane.tabs.length < 2, action: () => store.closeOthers(pi, idx()) },
    'sep',
    { label: 'Переместить в соседний редактор', shortcut: store.keyHint(to > pi ? 'moveRight' : 'moveLeft'), disabled: to < 0 || isPinned(t), action: () => store.moveTab(pi, idx()) },
    { label: 'Продублировать в соседнем редакторе', shortcut: store.keyHint(to > pi ? 'dupRight' : 'dupLeft'), disabled: to < 0 || t.kind === 'untitled' || !!viewOf(t.kind)?.single || isPinned(t), action: () => store.duplicateTab(pi, idx()) },
  ];
  if (t.kind === 'file') {
    // «Показать как ›»: the text and the views of the plugins (ТЗ 33); a plugin's file type has its one view
    const now = store.viewOf(t);
    items.push('sep');
    if (!fileTypeOf(t.path)) items.push({
      label: 'Показать как', action: () => {},
      sub: [
        { label: 'Текст', checked: now === '', action: () => store.showAs(t, '') },
        ...allFileViews().map((v) => ({ label: v.title, checked: now === v.id, shortcut: v.key ? store.keyHint(v.key) : undefined, action: () => store.showAs(t, v.id) })),
        'sep', { note: 'Виды добавляют плагины' },
      ],
    });
    items.push('sep');
    items.push({ label: 'Показать в навигаторе', shortcut: store.keyHint('revealInNav'), action: () => store.revealInNavigator(t) });
    items.push({ label: 'Скопировать путь', shortcut: store.keyHint('copyPath'), action: () => store.copyPath(t) });
  }
  return items;
}
