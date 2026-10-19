// The sections of the settings sheet and the moves between them (ТЗ 22, ТЗ 37), for both shells' sheets: which there
// are and in what order, which are made, their icons, ⌘[ ⌘] and ↑↓ in the column. A section's layers (a colour
// picker, a dialog) say so here, so that ⎋ closes them before the sheet.

import { store, type SettingsSection } from './store.svelte';
import { allSettings, settingsOf } from './views';

/** The core's sections with their places; the features' come from the registry (views.ts). */
const CORE: [SettingsSection, number][] = [['Основные', 0], ['Оформление', 10], ['Статусы', 20], ['Теги', 30], ['Агенды', 40], ['Inbox', 60], ['Файлы', 70], ['Клавиши', 80]];
export const PLUGINS = 'Плагины';

export const SECTION_ICON: Record<SettingsSection, string> = {
  Основные: 'M10 7.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2',
  Оформление: 'M10 3a7 7 0 1 0 0 14c1 0 1.5-.6 1.5-1.3 0-1.1-1-1.4-1-2.4 0-.8.7-1.3 1.5-1.3H14a3 3 0 0 0 3-3C17 5.6 13.9 3 10 3zM6.5 9.5h.01M8.5 6.5h.01M12 6.5h.01',
  Статусы: 'M3 10h14M12.5 6l4 4-4 4',
  Теги: 'M3 3h6.5l7.5 7.5-6 6L3.5 9.5zM6.8 6.8h.01',
  Агенды: 'M7.5 5h9M7.5 10h9M7.5 15h9M3.5 5h.01M3.5 10h.01M3.5 15h.01',
  Inbox: 'M3 11l2-7h10l2 7v5H3zM3 11h4l1 2h4l1-2h4',
  Файлы: 'M3 6a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z',
  Клавиши: 'M2.5 6h15v9h-15zM5 9h.01M8 9h.01M11 9h.01M14 9h.01M6 12h8',
};
export const iconOf = (id: SettingsSection) => SECTION_ICON[id] ?? settingsOf(id)?.icon ?? '';

/** The core's and the features' sections by their places; then «Плагины» (if the host is there); then the plugins'
 *  own sections by name. */
export function settingsSections() {
  const own = [...CORE, ...allSettings().filter((x) => !x.plugin && x.id !== PLUGINS).map((x): [SettingsSection, number] => [x.id, x.order])]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id);
  const ofPlugins = allSettings()
    .filter((x) => x.plugin)
    .map((x) => x.id)
    .sort((a, b) => a.localeCompare(b, 'ru'));
  const plugins = settingsOf(PLUGINS) ? [PLUGINS] : [];
  const ready: SettingsSection[] = ['Основные', 'Оформление', 'Статусы', 'Теги', 'Агенды', 'Inbox', 'Клавиши', ...allSettings().map((x) => x.id)];
  return { own, plugins, ofPlugins, all: [...own, ...plugins, ...ofPlugins], ready };
}
/** The section shown: the chosen one if it is made, else «Основные». */
export const currentSection = () => (settingsSections().ready.includes(store.settingsSection) ? store.settingsSection : 'Основные');

/** The section before / after that is made, in `order` (the column's order of the shell). */
export function stepSection(order: SettingsSection[], d: -1 | 1, focus = false) {
  const ready = settingsSections().ready;
  const list = order.filter((x) => ready.includes(x));
  const i = list.indexOf(currentSection());
  const next = list[(i + d + list.length) % list.length];
  store.showSection(next);
  if (focus) queueMicrotask(() => document.querySelector<HTMLElement>(`[data-section="${next}"]`)?.focus());
}

/** Layers of a section that ⎋ closes first (a section's popover or dialog over the sheet): their names. */
export const settingsLayers = $state<{ open: Set<string> }>({ open: new Set() });
export function setLayer(name: string, on: boolean) {
  if (settingsLayers.open.has(name) === on) return;
  const s = new Set(settingsLayers.open);
  if (on) s.add(name);
  else s.delete(name);
  settingsLayers.open = s;
}
export const layerOpen = () => settingsLayers.open.size > 0;
