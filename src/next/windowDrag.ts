// The window's title bar in the new interface: the toolbar and the room of the lights drag the window, a double
// click zooms it. WKWebView knows no `-webkit-app-region` (Electron's), so the press itself asks Tauri, as the old
// toolbar does (Toolbar.svelte); the buttons and fields in the bar keep their clicks.

const OWN = 'button, input, select, textarea, a, [role=button], [role=tab], [contenteditable="true"]';

/** An action: `use:windowDrag` on an element of the window's top. */
export function windowDrag(node: HTMLElement) {
  const down = async (e: MouseEvent) => {
    if (e.button !== 0 || !('__TAURI_INTERNALS__' in window)) return;
    if ((e.target as HTMLElement).closest(OWN)) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    if (e.detail === 2) void getCurrentWindow().toggleMaximize();
    else void getCurrentWindow().startDragging();
  };
  node.addEventListener('mousedown', down);
  return { destroy: () => node.removeEventListener('mousedown', down) };
}
