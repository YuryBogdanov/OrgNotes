// What the app's lists give when dragged (ТЗ 39 §8, API 1.10): a heading (relative path, line, title, its :ID: if it
// has one) or a file, under one type a plugin's view reads with `droppedOf` of @panopticon/api. Text goes along, so a
// drop into a text field gets the title or the path.

import { DRAG_TYPE, type Dropped } from './api/index';
import { store } from './store.svelte';

export function setDragged(dt: DataTransfer | null, d: Dropped) {
  if (!dt) return;
  dt.setData(DRAG_TYPE, JSON.stringify(d));
  if (!dt.getData('text/plain')) dt.setData('text/plain', d.kind === 'file' ? d.path : d.ref.title);
}
/** A heading of a file (its absolute path or its name in the folder) as dragged data. */
export function draggedHeading(path: string, line: number): Dropped | null {
  const f = store.files.find((x) => x.path === path || x.name === path);
  const h = f?.headings.find((x) => x.line === line);
  return f && h ? { kind: 'heading', ref: { path: f.name, line: h.line, title: h.title }, ...(h.id ? { id: h.id } : {}) } : null;
}
