// The window's title bar in the new interface: the toolbar, the room of the lights and the tabs' empty place drag the
// window, a double click does what macOS's setting says (`AppleActionOnDoubleClick`: zoom, minimise or nothing). WKWebView knows no `-webkit-app-region` (Electron's), so the press itself asks Tauri, as the old
// toolbar does (Toolbar.svelte); the buttons and fields in the bar keep their clicks.

const OWN = 'button, input, select, textarea, a, [role=button], [role=tab], [contenteditable="true"]';

/** An action: `use:windowDrag` on an element of the window's top. */
export function windowDrag(node: HTMLElement) {
  const down = async (e: MouseEvent) => {
    if (e.button !== 0 || !('__TAURI_INTERNALS__' in window)) return;
    if ((e.target as HTMLElement).closest(OWN)) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const w = getCurrentWindow();
    if (e.detail !== 2) return void w.startDragging();
    const { invoke } = await import('../tauri');
    const act = await invoke<string>('double_click_action').catch(() => 'Maximize');
    if (/minimi[sz]e/i.test(act)) void w.minimize();
    else if (!/none/i.test(act)) void w.toggleMaximize();
  };
  node.addEventListener('mousedown', down);
  return { destroy: () => node.removeEventListener('mousedown', down) };
}
