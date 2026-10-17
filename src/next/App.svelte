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
  import EditorArea from './EditorArea.svelte';
  import { nextPrefs } from '../nextPrefs.svelte';
  import { CloseSheet, ContextMenu, Dialogs, DiskSheet, Palette, PluginSheets, Refile, Settings, type MenuItem } from './bridges';
  import Compat from './Compat.svelte';
  import { untrack } from 'svelte';
  import { actionOf } from '../views';
  import { today } from '../todayState.svelte';

  // The new shell (ТЗ 42): the store, the plugins, the window's keys and the menu, the old sheets through
  // `bridges.ts` (42.1); the sidebar with the files and the toolbar (42.3); the tabs (42.4); the editor (42.5).
  const newFile = () => {
    if (!store.canManageFiles) return;
    store.showNav = true;
    store.creating = { dir: store.file ? parentOf(store.file.name) : '', kind: 'file' };
  };
  const actions: Record<string, () => void> = {
    settings: () => store.openSettings(),
    quit: () => store.quit(),
    palette: () => store.togglePalette(),
    searchAll: () => store.togglePalette(), // «Искать везде» ⌘K (§4.1)
    nav: () => (store.showNav = !store.showNav),
    // the sidebar's sections (ТЗ 43 §1, §6): the old navigator's keys; the plugins' come as their actions (actionOf)
    today: () => today.open(),
    navFiles: () => store.setNavMode('files'),
    navAgendas: () => store.setNavMode('agendas'),
    navTags: () => store.setNavMode('tags'),
    navSearch: () => store.openSearch(),
    findAll: () => store.openSearch(window.getSelection()?.toString() ?? ''),
    searchNext: () => store.searchStep(1),
    searchPrev: () => store.searchStep(-1),
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
    // ⌥⌘0: the old inspector's keys show «Структура» here (§8)
    insp: () => nextPrefs.setStructure(!nextPrefs.structure),
    // ⌘F, ⌘G, ⇧⌘G, ⌘E, ⌥⌘F (§5.7)
    find: () => store.askFind('open'),
    findNext: () => store.askFind('next'),
    findPrev: () => store.askFind('prev'),
    useSelection: () => store.askFind('useSel'),
    replace: () => store.askFind('replace'),
  };
  // one pane in the new shell (§4.3): a second one of the old is folded in, and back with the old shell
  $effect(() => {
    if (store.loaded) untrack(() => store.foldPanesForNext());
  });
  // «Шрифт текста» (§10): Cormorant, the system's or IBM Plex Mono — the text of «Оформление»
  const textFont = $derived(nextPrefs.font === 'system' ? FONTS.ui : nextPrefs.font === 'mono' ? FONTS.mono : FONTS.text);
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
    const run = actions[id] ?? actionOf(id); // a plugin's command, a section's key (roadmap 1.1)
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
    let menu: AppMenu | null = null;
    let gone = false;
    void installMenu(actions, (id) => toAccelerator(store.bindings.get(id)?.[0] ?? '')).then((m) => (gone ? m?.close() : (menu = m)));
    return () => {
      mq.removeEventListener('change', sys);
      gone = true;
      window.removeEventListener('keydown', key, true);
      menu?.close();
    };
  });
</script>

<div class="next" data-ui="next" data-font={nextPrefs.font} style="{tokenVars(store.appearance)};--ui:{FONTS.ui};--text:{textFont};--title:{FONTS.title};--mono:{FONTS.mono};--col:{nextPrefs.col}">
  <div class="win" inert={store.settingsOpen || !!plugins.form || !!plugins.trustReq || !!plugins.sheetReq}>
  {#if store.showNav}<Sidebar width={sideWidth} onwidth={setWidth} onmenu={(at, items) => (menu = { ...at, items })} />{/if}
  <div class="main">
  <Toolbar onnew={newFile} />
  <Tabs onmenu={(at, items) => (menu = { ...at, items })} />
  <EditorArea />
  </div>
  </div>
  <!-- the bridged sheets and menus in the compatibility layer (ТЗ 43 §5) -->
  <Compat>
    <Dialogs />
    {#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
    {#if store.refile}{#key store.refile.n}<Refile />{/key}{/if}
    {#if store.palette}{#key store.palette.n}<Palette />{/key}{/if}
    {#if store.unsavedReq}<CloseSheet items={store.unsavedReq.items} onanswer={(a) => store.unsavedReq?.resolve(a)} />{/if}
    {#if store.diskReq}{#key store.diskReq}<DiskSheet kind={store.diskReq.kind} path={store.diskReq.path} onanswer={(a) => store.diskReq?.resolve(a)} />{/key}{/if}
  </Compat>
  {#if store.toast}<div class="toast" role="status">{store.toast.text}{#each store.toast.actions ?? [] as a (a.label)}<button onclick={() => { store.toast = null; a.run(); }}>{a.label}</button>{/each}</div>{/if}
  <Compat>
    {#if store.settingsOpen && store.loaded}<Settings />{/if}
    <PluginSheets />
  </Compat>
</div>

<style>
  .next { position: fixed; inset: 0; display: flex; background: var(--bg); color: var(--ink); font: 13px/1.45 var(--ui); }
  .win { flex: 1; min-width: 0; display: flex; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 8px 14px; border-radius: 8px; background: var(--card); border: 1px solid var(--rule); box-shadow: var(--popshadow); }
  .toast button { border: 0; background: none; color: var(--lampink); font-weight: 600; }
</style>
