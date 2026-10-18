// the features' shortcuts first: the keys saved for them are read when the store starts
import './features/keys';
import './api/declare'; // the plugins' commands too (roadmap 1.1)
import './app.css';
import { mount, unmount } from 'svelte';
import App from './App.svelte';
import { applyStored } from './appearance';
import { isMainWindow, nextOn } from './uiFlag';
import { store } from './store.svelte';

if ('__TAURI_INTERNALS__' in window) document.documentElement.classList.add('tauri');

applyStored(); // the appearance and the editor theme before the first paint

const target = document.getElementById('app')!;

/** The new shell (ТЗ 42) when it is on; it failing to start, the old one and a word why. The flag stays on: the
 *  next start tries again. */
async function start() {
  if (isMainWindow() && nextOn()) {
    let app: ReturnType<typeof mount> | null = null;
    try {
      const { default: Next } = await import('./next/App.svelte');
      app = mount(Next, { target });
      return;
    } catch (e) {
      console.error('the new interface did not start', e);
      if (app) void unmount(app);
      target.replaceChildren();
    }
    mount(App, { target });
    store.note('Новый интерфейс не запустился — вернули старый. Подробности в журнале', undefined, 8000);
    return;
  }
  // the mini window and the quick entry (ТЗ 52 §1): the same flag
  if (!isMainWindow() && nextOn()) {
    try {
      const { default: Side } = await import('./next/SideWindow.svelte');
      mount(Side, { target });
      return;
    } catch (e) {
      console.error('the new interface did not start', e);
      target.replaceChildren();
    }
  }
  mount(App, { target });
}
// the interface switched in the main window (its flag in the shared storage): these windows reload too (ТЗ 52 §1)
if (!isMainWindow()) window.addEventListener('storage', (e) => void (e.key === 'ui:next' && location.reload()));
void start();
