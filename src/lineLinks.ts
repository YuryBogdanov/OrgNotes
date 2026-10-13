// Links at the end of a line of the editor a plugin adds (ТЗ 33): «Открыть доску ⌥⌘B» right of «#+BOARD: …». The
// editor asks each for every line it draws; a click runs it with the file and the line. Nothing of the file changes.

export interface LineLink {
  /** The link's text for the line (its text and number), or null — none here. */
  label(text: string, line: number): string | null;
  run(path: string, line: number): void;
}
const links = new Map<string, LineLink>();
const listeners = new Set<() => void>();
export function setLineLink(owner: string, l: LineLink | null) {
  if (l) links.set(owner, l);
  else links.delete(owner);
  listeners.forEach((f) => f());
}
export const lineLinks = () => [...links.values()];
/** The editors draw again when the links change. */
export function onLineLinks(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
