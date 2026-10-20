// A window's title bar: the press drags the window (the new interface's toolbar, the room of the lights and the tabs'
// empty place; the mini window's header), a double click does what macOS's setting says (`AppleActionOnDoubleClick`:
// zoom, minimise or nothing). WKWebView knows no `-webkit-app-region` (Electron's), and Tauri's `data-tauri-drag-region`
// takes only a press on the very element (not on its text) and zooms any window on a double click: the press itself
// asks Tauri, as the old toolbar does (Toolbar.svelte); the buttons and fields in the bar keep their clicks.

const OWN = 'button, input, select, textarea, a, [role=button], [role=tab], [contenteditable="true"]';

/** An action: `use:windowDrag` on an element of the window's top; `{ zoom: false }` — a double click does nothing (the
 *  mini window: a panel, never zoomed). */
export function windowDrag(node: HTMLElement, o: { zoom?: boolean } = {}) {
  const down = async (e: MouseEvent) => {
    if (e.button !== 0 || !('__TAURI_INTERNALS__' in window)) return;
    if ((e.target as HTMLElement).closest(OWN)) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const w = getCurrentWindow();
    if (e.detail !== 2) return void w.startDragging();
    if (o.zoom === false) return;
    const { invoke } = await import('./tauri');
    const act = await invoke<string>('double_click_action').catch(() => 'Maximize');
    if (/minimi[sz]e/i.test(act)) void w.minimize();
    else if (!/none/i.test(act)) void w.toggleMaximize();
  };
  node.addEventListener('mousedown', down);
  return { destroy: () => node.removeEventListener('mousedown', down) };
}
