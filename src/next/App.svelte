<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../store.svelte';
  import { plugins } from '../api/host.svelte';
  import { pluginUpdates } from '../pluginUpdates.svelte';
  import { keyHandler } from '../keyDispatch';
  import { installMenu, type AppMenu } from '../menu';
  import { toAccelerator } from '../keys';
  import { CloseSheet, DiskSheet, Palette, PluginSheets, Settings } from './bridges';

  // The new shell (ТЗ 42), part 42.1: the frame — the store, the plugins, the window's keys and the menu, the old
  // sheets through `bridges.ts`. The toolbar, the sidebar, the tabs and the editor come in 42.3–42.5.
  const actions: Record<string, () => void> = {
    settings: () => store.openSettings(),
    quit: () => store.quit(),
    palette: () => store.togglePalette(),
  };
  const runWindow = (id: string) => {
    const run = actions[id];
    if (!run || (store.sheetOpen && id !== 'palette' && id !== 'settings' && id !== 'quit')) return false;
    run();
    return true;
  };
  onMount(() => {
    store.load();
    store.listen();
    void plugins.start().then(() => pluginUpdates.check());
    const key = keyHandler(runWindow);
    window.addEventListener('keydown', key, true);
    let menu: AppMenu | null = null;
    let gone = false;
    void installMenu(actions, (id) => toAccelerator(store.bindings.get(id)?.[0] ?? '')).then((m) => (gone ? m?.close() : (menu = m)));
    return () => {
      gone = true;
      window.removeEventListener('keydown', key, true);
      menu?.close();
    };
  });
  const tabs = $derived(store.layout.panes.reduce((n, p) => n + p.tabs.length, 0));
  const word = (n: number, [one, few, many]: [string, string, string]) =>
    `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
</script>

<div class="next" data-ui="next">
  <main class="frame" inert={store.settingsOpen || !!plugins.form || !!plugins.trustReq || !!plugins.sheetReq}>
    <div class="card">
      <h1>Новый интерфейс</h1>
      <p>Каркас готов: файлы, вкладки, плагины и настройки работают, окно и редактор собираются по частям.</p>
      <p class="meta">{store.loaded ? `${word(store.files.length, ['файл', 'файла', 'файлов'])} · ${word(tabs, ['вкладка открыта', 'вкладки открыты', 'вкладок открыто'])}` : 'Читаем папку…'}</p>
      <div class="acts">
        <button onclick={() => store.togglePalette()}>Палитра команд</button>
        <button class="pri" onclick={() => void store.setInterface(false)}>Вернуть старый интерфейс</button>
      </div>
    </div>
  </main>
  {#if store.palette}{#key store.palette.n}<Palette />{/key}{/if}
  {#if store.unsavedReq}<CloseSheet items={store.unsavedReq.items} onanswer={(a) => store.unsavedReq?.resolve(a)} />{/if}
  {#if store.diskReq}{#key store.diskReq}<DiskSheet kind={store.diskReq.kind} path={store.diskReq.path} onanswer={(a) => store.diskReq?.resolve(a)} />{/key}{/if}
  {#if store.toast}<div class="toast" role="status">{store.toast.text}{#each store.toast.actions ?? [] as a (a.label)}<button onclick={() => { store.toast = null; a.run(); }}>{a.label}</button>{/each}</div>{/if}
</div>
{#if store.settingsOpen && store.loaded}<Settings />{/if}
<PluginSheets />

<style>
  .next { position: fixed; inset: 0; display: flex; background: var(--bg); color: var(--fg); font: 13px -apple-system, system-ui, sans-serif; }
  .frame { flex: 1; display: flex; align-items: center; justify-content: center; padding: 52px 16px 16px; -webkit-app-region: drag; }
  .card { -webkit-app-region: no-drag; max-width: 440px; display: flex; flex-direction: column; gap: 10px; padding: 24px 28px; border: 1px solid var(--line); border-radius: 12px; background: var(--side); }
  h1 { margin: 0; font-size: 20px; }
  p { margin: 0; line-height: 1.5; color: var(--fg2); }
  .meta { font-size: 12px; color: var(--fg3); }
  .acts { display: flex; gap: 8px; margin-top: 6px; }
  .acts button { height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
  .acts .pri { border-color: var(--acc); background: var(--acc); color: var(--onacc); }
  .toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 8px 14px; border-radius: 8px; background: var(--pop); border: 1px solid var(--line); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); }
  .toast button { border: 0; background: none; color: var(--acc); font-weight: 600; }
</style>
