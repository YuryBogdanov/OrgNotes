// «Новый интерфейс (бета)» (ТЗ 42 §1): which shell the main window draws — the old one (by default) or `src/next/`.
// Kept on this Mac, as the appearance; switching reloads the window (the tabs, the carets and the layout come back
// as after a restart). The mini window and the quick entry follow it (ТЗ 52): they reload when it changes.

const KEY = 'ui:next';

export function nextOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
/** Turn it on or off and reload the window. */
export function setNext(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    return;
  }
  location.reload();
}
/** The main window: not the mini window, not the quick entry (main.ts gives them their own shell, ТЗ 52). */
export const isMainWindow = () => location.hash !== '#capture' && location.hash !== '#mini';
