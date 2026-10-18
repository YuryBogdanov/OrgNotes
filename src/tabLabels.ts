// How a tab is named and marked (tech sprint 4.2, from Pane.svelte): its label, whether its kind is the core's, whether
// its file is gone from disk, whether it has unsaved text.

import { store } from './store.svelte';
import { plugins } from './api/host.svelte';
import { viewOf } from './views';
import { displayName } from './names';
import type { Tab } from './layout';

export const isCore = (k: string) => k === 'file' || k === 'agenda' || k === 'untitled';
/** A feature's tab: its view's name; a kind nobody registers (the feature is off): the name it had. */
export const tabLabel = (t: Tab) => (t.kind === 'agenda' ? 'Агенда' : t.kind === 'untitled' ? (t.title ?? 'Без названия') : t.kind === 'file' ? displayName(t.path ?? '') + (t.scope && t.view ? ` › ${t.scope.title}` : '') : (viewOf(t.kind)?.label(t) ?? t.label ?? plugins.pluginOfView(t.kind)?.manifest?.contributes.views.find((v) => v.id === t.kind)?.title ?? 'Функция выключена'));
// a puzzle piece: the tab of a feature that is off
export const OFF_ICON = 'M8 3h4v2.5a1.5 1.5 0 0 0 3 0V3h2v5h-2.5a1.5 1.5 0 0 0 0 3H17v6H3V11h2.5a1.5 1.5 0 0 0 0-3H3V3h5z';
// a file deleted on disk stays open: an italic name, and the tooltip says why
export const isGone = (t: Tab) => t.kind === 'file' && !!store.orphans[t.path ?? ''];
export const isDirty = (t: Tab) => {
  if (t.kind === 'untitled') return !!t.text?.trim(); // spaces and blank lines are not worth a dot
  const v = viewOf(t.kind);
  if (v?.dirty) return v.dirty(t);
  const f = store.fileOf(t);
  return !!f && f.text !== f.disk;
};
