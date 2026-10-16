<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../store.svelte';
  import { plugins } from '../api/host.svelte';
  import { pluginUpdates } from '../pluginUpdates.svelte';
  import { keyHandler } from '../keyDispatch';
  import { installMenu, type AppMenu } from '../menu';
  import { toAccelerator } from '../keys';
  import { applyAppearance } from '../appearance';
  import { tokenVars, FONTS } from './tokens';
  import './fonts';
  import { parentOf } from '../navTree';
  import Sidebar from './Sidebar.svelte';
  import Toolbar from './Toolbar.svelte';
  import Tabs from './Tabs.svelte';
  import { tabLabel } from '../tabLabels';
  import { CloseSheet, ContextMenu, Dialogs, DiskSheet, Palette, PluginSheets, Settings, type MenuItem } from './bridges';
  import { untrack } from 'svelte';

  // The new shell (ТЗ 42): the store, the plugins, the window's keys and the menu, the old sheets through
  // `bridges.ts` (42.1); the sidebar with the files and the toolbar (42.3); the tabs (42.4). The editor: 42.5.
  const newFile = () => {
    if (!store.canManageFiles) return;
    store.showNav = true;
    store.creating = { dir: store.file ? parentOf(store.file.name) : '', kind: 'file' };
  };
  const actions: Record<string, () => void> = {
    settings: () => store.openSettings(),
    quit: () => store.quit(),
    palette: () => store.togglePalette(),
    nav: () => (store.showNav = !store.showNav),
    newFile,
    // the tabs (ТЗ 42 §4.3): as in the old shell; one pane — the second's commands say «Скоро»
    newTab: () => store.newUntitled(0),
    closeTab: () => store.closeActiveTab(),
    closeOthers: () => {
      const p = store.layout.panes[0];
      if (p) void store.closeOthers(0, p.active);
    },
    save: () => store.saveActive(),
    copyPath: () => store.copyPath(store.tab),
    closeWindow: () => store.hideWindow(),
    splitRight: () => store.splitRight(),
    rich: () => store.setRich(!store.rich),
  };
  // one pane in the new shell (§4.3): a second one of the old is folded in, and back with the old shell
  $effect(() => {
    if (store.loaded) untrack(() => store.foldPanesForNext());
  });
  // «Искать везде ⌘K» (§4.1): the palette, in the new shell only
  const cmdK = (e: KeyboardEvent) => {
    if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.code === 'KeyK' && !store.sheetOpen) {
      e.preventDefault();
      store.togglePalette();
    }
  };
  // the sidebar's width (§4.2), on this Mac
  const readWidth = () => {
    try {
      const n = Number(localStorage.getItem('next:sideWidth'));
      return n >= 200 && n <= 360 ? n : 236;
    } catch {
      return 236;
    }
  };
  let sideWidth = $state(readWidth());
  function setWidth(w: number) {
    sideWidth = w;
    try {
      localStorage.setItem('next:sideWidth', String(w));
    } catch {
      /* no storage */
    }
  }
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const runWindow = (id: string) => {
    const run = actions[id];
    if (!run || (store.sheetOpen && id !== 'palette' && id !== 'settings' && id !== 'quit')) return false;
    run();
    return true;
  };
  // the appearance and the editor theme (by default «Синька» here, §3.2), macOS's dark followed
  $effect(() => applyAppearance(store.appearanceChoice, store.appearance, store.theme));
  onMount(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const sys = () => (store.systemDark = mq.matches);
    mq.addEventListener('change', sys);
    void store.loadThemes();
    store.load();
    store.listen();
    void plugins.start().then(() => pluginUpdates.check());
    const key = keyHandler(runWindow);
    window.addEventListener('keydown', key, true);
    window.addEventListener('keydown', cmdK, true);
    let menu: AppMenu | null = null;
    let gone = false;
    void installMenu(actions, (id) => toAccelerator(store.bindings.get(id)?.[0] ?? '')).then((m) => (gone ? m?.close() : (menu = m)));
    return () => {
      mq.removeEventListener('change', sys);
      gone = true;
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keydown', cmdK, true);
      menu?.close();
    };
  });
  const tabs = $derived(store.layout.panes.reduce((n, p) => n + p.tabs.length, 0));
  const word = (n: number, [one, few, many]: [string, string, string]) =>
    `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
</script>

<div class="next" data-ui="next" style="{tokenVars(store.appearance)};--ui:{FONTS.ui};--text:{FONTS.text};--title:{FONTS.title};--mono:{FONTS.mono}">
  <div class="win" inert={store.settingsOpen || !!plugins.form || !!plugins.trustReq || !!plugins.sheetReq}>
  {#if store.showNav}<Sidebar width={sideWidth} onwidth={setWidth} onmenu={(at, items) => (menu = { ...at, items })} />{/if}
  <div class="main">
  <Toolbar onnew={newFile} />
  <Tabs onmenu={(at, items) => (menu = { ...at, items })} />
  <main class="frame">
    <div class="card">
      <h1 class="title">Новый интерфейс</h1>
      <p>{store.tab ? `Вкладка «${tabLabel(store.tab)}» — редактор появится в следующей части.` : 'Вкладок нет. Откройте файл в сайдбаре.'}</p>
      <p class="meta">{store.loaded ? `${word(store.files.length, ['файл', 'файла', 'файлов'])} · ${word(tabs, ['вкладка открыта', 'вкладки открыты', 'вкладок открыто'])}` : 'Читаем папку…'}</p>
      <div class="acts">
        <button onclick={() => store.togglePalette()}>Палитра команд</button>
        <button class="pri" onclick={() => void store.setInterface(false)}>Вернуть старый интерфейс</button>
      </div>
    </div>
  </main>
  </div>
  </div>
  <Dialogs />
  {#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
  {#if store.palette}{#key store.palette.n}<Palette />{/key}{/if}
  {#if store.unsavedReq}<CloseSheet items={store.unsavedReq.items} onanswer={(a) => store.unsavedReq?.resolve(a)} />{/if}
  {#if store.diskReq}{#key store.diskReq}<DiskSheet kind={store.diskReq.kind} path={store.diskReq.path} onanswer={(a) => store.diskReq?.resolve(a)} />{/key}{/if}
  {#if store.toast}<div class="toast" role="status">{store.toast.text}{#each store.toast.actions ?? [] as a (a.label)}<button onclick={() => { store.toast = null; a.run(); }}>{a.label}</button>{/each}</div>{/if}
  {#if store.settingsOpen && store.loaded}<Settings />{/if}
  <PluginSheets />
</div>

<style>
  .next { position: fixed; inset: 0; display: flex; background: var(--bg); color: var(--ink); font: 13px/1.45 var(--ui); }
  /* the editor's ground: a grid of 24 pt (§5.1) */
  .win { flex: 1; min-width: 0; display: flex; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .frame { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 16px;
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 24px 24px; background-position: -1px -1px; }
  .card { -webkit-app-region: no-drag; max-width: 460px; display: flex; flex-direction: column; gap: 10px; padding: 26px 30px; border: 1px solid var(--rule); border-radius: 12px; background: var(--card); box-shadow: var(--popshadow); }
  .title { margin: 0; font: 400 28px/1.15 var(--title); }
  p { margin: 0; font: 500 19px/1.55 var(--text); color: var(--ink2); }
  .meta { font: 11px var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink3); }
  .acts { display: flex; gap: 8px; margin-top: 8px; }
  .acts button { height: 32px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 13px var(--ui); }
  .acts .pri { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 8px 14px; border-radius: 8px; background: var(--card); border: 1px solid var(--rule); box-shadow: var(--popshadow); }
  .toast button { border: 0; background: none; color: var(--lampink); font-weight: 600; }
</style>
