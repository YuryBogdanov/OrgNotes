// The editor's part of the keyboard: each editor registers the commands it can run (by the ids of keys.ts), so the
// window's key handler runs them in the editor that has the focus. CodeMirror's own keymap keeps only what is not
// configurable (undo, the text keys of macOS).

export interface EditorKeys {
  run(id: string, line?: number): boolean; // false: not here (not on a heading, no link…), the key goes on; `line` (0-based): a heading the palette chose
  onHeading(): boolean; // the caret is on a heading line, nothing selected
}
const registry = new WeakMap<Element, EditorKeys>();

export function registerEditor(dom: Element, keys: EditorKeys) {
  registry.set(dom, keys);
  return () => registry.delete(dom);
}
/** The editor with the focus, if any. */
export function focusedEditor(): EditorKeys | null {
  const el = document.activeElement?.closest('.cm-editor');
  return el ? (registry.get(el) ?? null) : null;
}
