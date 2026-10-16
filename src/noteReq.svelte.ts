// «Добавить заметку…» (ТЗ 40 §3, ⌃C ⌃Z as in Emacs): one popover for the editor, the palette and the plugins
// («Статус…» of «Долгие дела» calls it as the core's command `heading.note`).

export interface NoteReq {
  /** The file's name in the folder (as the editors and the plugins' refs know it). */
  path: string;
  line: number;
  x: number;
  y: number;
  /** Where the focus goes back to on closing (the editor it came from). */
  back?: () => void;
  n: number;
}

export const notePop = $state<{ req: NoteReq | null }>({ req: null });

let n = 0;
/** Open it for the heading at this line; at `at` (under a line), else at the top of the window. */
export function openNote(path: string, line: number, at?: { x: number; y: number }, back?: () => void) {
  const x = at ? Math.round(at.x) : Math.round(innerWidth / 2 - 180);
  const y = at ? Math.round(at.y) : 96;
  notePop.req = { path, line, x, y, back, n: ++n };
}
