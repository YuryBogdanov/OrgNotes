// What the plugins add to the menu of a heading (ТЗ 39: «Показать ветку как mindmap»): in the editor's menu on a
// heading's line and in the navigator's menu of a heading. The host registers them; the menus read them.

import { SvelteMap } from 'svelte/reactivity';

export interface HeadingAction {
  label: string;
  /** `path` — the file in the notes folder; `line` — the heading's (0-based). */
  when(path: string, line: number): boolean;
  run(path: string, line: number): void;
}
export const headingActions = new SvelteMap<string, HeadingAction>();
export const headingActionsFor = (path: string, line: number) => [...headingActions.values()].filter((a) => a.when(path, line));
