// A heading's status or priority written at its line, as the commands do, the caret not moved (the menus of a drawn
// capsule and «Сменить статус ›», ТЗ 44 §3.2).

import { store } from './store.svelte';
import { setKeyword, setPriority } from './org';

/** Write a heading's status (null: none) at a line of a file. */
export const setStatusAt = (path: string, line: number, name: string | null) => store.patchAt(path, line, (t, h, wf) => setKeyword(t, h, name, wf));
export const setPriorityAt = (path: string, line: number, p: string | null) => store.patchAt(path, line, (t, h) => setPriority(t, h, p));
