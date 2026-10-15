// The main window itself (tech sprint 2.4, from the store): the traffic lights drawn in our toolbar in full screen —
// green leaves full screen, red closes (hides) the window; ⌘⇧W hides it too, the app stays in the Dock.

export async function leaveFullscreen() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setFullscreen(false);
}
export async function closeFromFullscreen() {
  await leaveFullscreen();
  setTimeout(() => void hideWindow(), 800); // after the window is back from its space
}
export async function hideWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().hide();
}
