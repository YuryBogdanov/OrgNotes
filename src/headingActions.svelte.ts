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
/** The same, by plugin (the key is `<plugin>.<n>`): the new interface's menu shows each plugin's section (ТЗ 44 §3.1). */
export function headingActionsByPlugin(path: string, line: number): { plugin: string; actions: HeadingAction[] }[] {
  const out = new Map<string, HeadingAction[]>();
  for (const [key, a] of headingActions) {
    if (!a.when(path, line)) continue;
    const plugin = key.slice(0, key.lastIndexOf('.'));
    out.set(plugin, [...(out.get(plugin) ?? []), a]);
  }
  return [...out].map(([plugin, actions]) => ({ plugin, actions }));
}
