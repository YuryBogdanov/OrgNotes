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
  import { focusedEditor } from '../editorKeys';
  import Sidebar from './Sidebar.svelte';
  import { TODAY_ID } from './sections';
  import { lsGet, lsSet } from '../storage';
  import SearchTab from './SearchTab.svelte';
  import { register as registerCommand, commandIds } from '../commands';
  import { SEARCH_ICON, SEARCH_TAB, openSearchTab, searchTabActive, searchTabLabel, searchTabSub } from './searchTabState.svelte';
  import Toolbar from './Toolbar.svelte';
  import Tabs from './Tabs.svelte';
  import EditorArea from './EditorArea.svelte';
  import { nextPrefs } from '../nextPrefs.svelte';
  import { Settings } from './bridges';
  import StartScreen from './StartScreen.svelte';
  import AgendaBuilderTab from './AgendaBuilder.svelte';
  import PluginEditor from './PluginEditor.svelte';
  import { AGENDA_EDIT } from '../store.svelte';
  import { registerView } from '../views';
  import { openView, setPinning } from '../layout';
  import { searchAll } from '../searchAll.svelte';
  import Capture from './Capture.svelte';
  import InboxPicker from './InboxPicker.svelte';
  import { lists } from '../taskLists.svelte';
  import NotePop from './NotePop.svelte';
  import TaskListHost from './TaskListHost.svelte';
  import PluginSheets from './PluginSheets.svelte';
  import EndDay from './EndDay.svelte';
  import CloseSheet from './CloseSheet.svelte';
  import DiskSheet from './DiskSheet.svelte';
  import Dialogs from './Dialogs.svelte';
  import SaveAsSheet from './SaveAsSheet.svelte';
  import { notePop } from '../noteReq.svelte';
  import { displayName as nameOf } from '../names';
  import Refile from './Refile.svelte';
  import Palette from './Palette.svelte';
  import type { MenuItem } from '../menuItems';
  import Compat from './Compat.svelte';
  import Menu from './ui/Menu.svelte';
  import { untrack } from 'svelte';
  import { actionOf, allViews } from '../views';
  import { today } from '../todayState.svelte';
  import { fileReview } from './fileReview.svelte';
  import { fileTypeOf } from '../fileTypes.svelte';

  // a review in the file (ТЗ 41 §1): the tab follows its cards
  fileReview.effects();
  // `ui.editor` gives the new editor here (ТЗ 49 §7)
  plugins.editorComponent = PluginEditor;
  // the results of the search in every file as a tab (ТЗ 53 §1): one per window, not kept after a restart
  registerView({
    kind: SEARCH_TAB, icon: SEARCH_ICON, component: SearchTab, transient: true, single: true, hasInspector: () => false,
    label: () => searchTabLabel(),
    crumbs: () => [searchTabLabel(), searchTabSub()].filter(Boolean),
  });
  // the palette's «Поиск: открыть результаты во вкладке» (the new interface's only)
  if (!commandIds().includes('searchTab'))
    registerCommand({ id: 'searchTab', title: 'Поиск: открыть результаты во вкладке', icon: 'search', group: 'general', keyId: '', synonyms: ['поиск', 'результаты', 'вкладка', 'найти'], when: () => !!store.dir || store.files.length > 0, run: () => void setTimeout(() => openSearchTab()) });
  // the agenda builder is a tab here (ТЗ 48 §5): «<Агенда> — правка», a dot while unsaved; it opens with the builder
  // and the builder goes with its tab
  registerView({
    kind: AGENDA_EDIT, icon: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3', component: AgendaBuilderTab, transient: true, single: true,
    label: () => `${store.builder?.draft.name.trim() || 'Новая агенда'} — правка`,
    crumbs: () => ['Агенды', `${store.builder?.draft.name.trim() || 'Новая агенда'} — правка`],
    dirty: () => store.builderDirty,
    onGone: () => void (store.builder && store.closeBuilder()),
  });
  $effect(() => {
    const n = store.builder?.n;
    untrack(() => {
      const has = store.layout.panes[0]?.tabs.findIndex((t) => t.kind === AGENDA_EDIT) ?? -1;
      if (n) {
        openView(store.layout, 0, AGENDA_EDIT, () => ({}));
        store.layout.active = 0;
      } else if (has >= 0) {
        const p = store.layout.panes[0];
        p.tabs.splice(has, 1);
        p.active = Math.max(0, Math.min(p.active, p.tabs.length - 1));
      }
    });
  });
  // The new shell (ТЗ 42): the store, the plugins, the window's keys and the menu, the old sheets through
  // `bridges.ts` (42.1); the sidebar with the files and the toolbar (42.3); the tabs (42.4); the editor (42.5).
  /** «Открыть» of «Добавлено в Inbox»: the Inbox's file, at its end (where the entry went). */
  const openInbox = () => {
    const f = store.inboxFile;
    const i = f ? store.files.indexOf(f) : -1;
    if (i >= 0) store.open(i, Math.max(0, f!.text.split('\n').length - 1));
  };
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
    // ⇧⌘H (ТЗ 50 §4): the panel «Сегодня»; pressed again while it is shown — the full one, its tab
    today: () => (store.showNav && store.navMode === TODAY_ID ? today.open() : store.setNavMode(TODAY_ID)),
    navFiles: () => store.setNavMode('files'),
    navAgendas: () => store.setNavMode('agendas'),
    navTags: () => store.setNavMode('tags'),
    navSearch: () => store.openSearch(),
    // ⇧⌘F (ТЗ 53 §1): the panel; pressed again while it is shown — the tab of the results
    findAll: () => (store.showNav && store.navMode === 'search' && !searchTabActive() ? openSearchTab() : store.openSearch(window.getSelection()?.toString() ?? '')),
    searchTab: () => openSearchTab(),
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
    save: () => (store.tab?.kind === AGENDA_EDIT ? void store.builderSave++ : store.saveActive()), // the builder's tab: «Сохранить агенду»
    copyPath: () => store.copyPath(store.tab),
    closeWindow: () => store.hideWindow(),
    splitRight: () => store.splitRight(),
    // ⌃⌘E on a file's view: back to its text in the mode it has (ТЗ 49 §2); on the text — the other mode
    rich: () => (store.tab?.kind === 'file' && store.viewOf(store.tab) && !fileTypeOf(store.tab.path) ? store.showAs(store.tab, '') : store.setRich(!store.rich)),
    // ⌥⌘0: the old inspector's keys show «Структура» here (§8)
    insp: () => nextPrefs.setStructure(!nextPrefs.structure),
    // ⌘F, ⌘G, ⇧⌘G, ⌘E, ⌥⌘F (§5.7)
    find: () => store.askFind('open'),
    findNext: () => store.askFind('next'),
    findPrev: () => store.askFind('prev'),
    useSelection: () => store.askFind('useSel'),
    replace: () => store.askFind('replace'),
    // the old shell's keys the window lacked (ТЗ 44.4): the quick entry, «Правка», files, history, the mini window
    capture: () => store.openCapture(),
    captureHere: () => store.openCapture(),
    pasteText: () => void focusedEditor()?.run('pasteText'),
    copyLink: () => {
      if (focusedEditor()?.run('copyLink')) return;
      if (store.curPath) void store.copyHeadingLink(store.curPath, store.cursor.line);
    },
    newFolder: () => store.canManageFiles && store.openPalette('newFolder'),
    paletteNewFile: () => store.openPalette('newFile'),
    paletteGoto: () => store.openPalette('goto'),
    openFolder: () => store.changeFolder(),
    revealInNav: () => store.revealInNavigator(store.tab),
    back: () => store.back(),
    miniOpen: () => store.openInMini(),
    miniShow: () => store.toggleMini(),
    endDay: () => today.openEndDay(),
  };
  // one pane in the new shell (§4.3): a second one of the old is folded in, and back with the old shell
  $effect(() => {
    if (store.loaded) untrack(() => store.foldPanesForNext());
  });
  // as in the old shell (ТЗ 44.4): the layout survives a restart; a file changed or vanished on disk under edits is
  // asked about when the window is in front, no sheet is up and its tab is shown; closing the last tab of a kind
  // tells its feature; the quick entry's panel knows the Inbox file's name from here
  $effect(() => {
    if (store.loaded) store.persistLayout();
  });
  $effect(() => {
    void [store.conflicts, store.orphans, store.sheetOpen, store.appActive, store.layout.active];
    for (const p of store.layout.panes) void p.tabs[p.active]?.path;
    untrack(() => store.pumpDisk());
  });
  $effect(() => {
    for (const v of allViews()) if (v.onGone && !store.layout.panes.some((p) => p.tabs.some((t) => t.kind === v.kind))) v.onGone();
  });
  $effect(() => {
    const f = store.inboxFile;
    try {
      if (f) localStorage.setItem('capture:file', nameOf(f.name) + '.org');
      else localStorage.removeItem('capture:file');
    } catch {
      /* no storage */
    }
  });
  // ⌃C ⌃Z's popover closed: the focus back where it came from
  function closeNote() {
    const back = notePop.req?.back;
    notePop.req = null;
    back?.();
  }
  // «Шрифт текста» (§10): Cormorant, the system's or IBM Plex Mono — the text of «Оформление»
  const textFont = $derived(nextPrefs.font === 'system' ? FONTS.ui : nextPrefs.font === 'mono' ? FONTS.mono : FONTS.text);
  // half the cap height of that font (ТЗ 44 §12): the capsules beside a heading centre on its capitals; measured, not
  // written down — Cormorant ≈ 0.63 em, SF Pro and IBM Plex Mono ≈ 0.70; again once the fonts are loaded
  let capc = $state(0.315);
  const measureCap = (font: string) => {
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return;
    c.font = `100px ${font}`;
    const h = c.measureText('H').actualBoundingBoxAscent;
    if (h > 30 && h < 95) capc = Math.round((h / 200) * 1000) / 1000;
  };
  $effect(() => {
    const f = textFont;
    measureCap(f);
    // `fonts.ready` may come before the text's font is even asked for: load that one, and again on any font loaded
    const again = () => measureCap(f);
    void document.fonts?.load(`100px ${f}`).then(again, () => {});
    document.fonts?.addEventListener('loadingdone', again);
    return () => document.fonts?.removeEventListener('loadingdone', again);
  });
  // no pinned tab in the new interface (ТЗ 50 §4): «Сегодня» is a tab as any — off before the layout is restored
  setPinning(false);
  searchAll.dense = true; // the search's results one line each, more of them open (ТЗ 50 §5)
  // the width of the sidebar's panel (ТЗ 50 §2: 260 by default, the rail aside), on this Mac
  const readWidth = () => {
    try {
      const n = Number(localStorage.getItem('next:paneWidth'));
      return n >= 200 && n <= 360 ? n : 260;
    } catch {
      return 236;
    }
  };
  let sideWidth = $state(readWidth());
  // the panel hidden or not (ТЗ 50 §3), on this Mac — the new interface's own (the old window keeps it per run)
  if (lsGet('next:showNav') === '0') store.showNav = false;
  $effect(() => lsSet('next:showNav', store.showNav ? '1' : '0'));
  function setWidth(w: number) {
    sideWidth = w;
    try {
      localStorage.setItem('next:paneWidth', String(w));
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
    // one ⌘Z (roadmap 0.1), as in the old window: in a text field it is the field's own; anywhere else it takes back
    // the last edit a feature made — «Сегодня», «Завершить день», a review card, the calendar, the goals
    const undo = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !e.metaKey || e.shiftKey || e.altKey || e.ctrlKey || e.code !== 'KeyZ') return;
      if ((e.target as Element | null)?.closest?.('.cm-editor, input, textarea, select, [contenteditable]') || store.sheetOpen) return;
      e.preventDefault();
      void store.undoLast();
    };
    window.addEventListener('keydown', undo);
    let menu: AppMenu | null = null;
    let gone = false;
    void installMenu(actions, (id) => toAccelerator(store.bindings.get(id)?.[0] ?? '')).then((m) => (gone ? m?.close() : (menu = m)));
    return () => {
      mq.removeEventListener('change', sys);
      gone = true;
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keydown', undo);
      menu?.close();
    };
  });
</script>

<div class="next" data-ui="next" data-font={nextPrefs.font} style="{tokenVars(store.appearance)};--ui:{FONTS.ui};--text:{textFont};--title:{FONTS.title};--mono:{FONTS.mono};--col:{nextPrefs.col};--capc:{capc}">
  <!-- the first start has the window to itself (ТЗ 48 §6): no sidebar, no tabs under it -->
  <div class="win" style:display={store.start ? "none" : undefined} inert={store.settingsOpen || !!plugins.form || !!plugins.trustReq || !!plugins.sheetReq}>
  <!-- the rail always; ⌘0 hides and shows its panel (ТЗ 50 §3) -->
  <Sidebar open={store.showNav} width={sideWidth} onwidth={setWidth} onmenu={(at, items) => (menu = { ...at, items })} />
  <div class="main">
  <Toolbar onnew={newFile} />
  <Tabs onmenu={(at, items) => (menu = { ...at, items })} />
  <EditorArea />
  </div>
  </div>
  <!-- the sheets of the files (ТЗ 44 §4) -->
  <Dialogs />
  {#if store.saveAsReq}{#key store.saveAsReq}<SaveAsSheet tab={store.saveAsReq.tab} />{/key}{/if}
  {#if store.unsavedReq}<CloseSheet items={store.unsavedReq.items} onanswer={(a) => store.unsavedReq?.resolve(a)} />{/if}
  {#if store.diskReq}{#key store.diskReq}<DiskSheet kind={store.diskReq.kind} path={store.diskReq.path} onanswer={(a) => store.diskReq?.resolve(a)} />{/key}{/if}
  {#if store.errorReq}<CloseSheet error={store.errorReq} onanswer={() => store.errorReq?.resolve()} />{/if}
  <!-- «Завершить день» (ТЗ 45 §2.5) -->
  {#if today.ending}<EndDay />{/if}
  <!-- the plugins' forms, sheets, menus, «Включить плагин?», the choice of a place (ТЗ 44 §4) -->
  <PluginSheets />
  <!-- the palette and its «Перенести» (ТЗ 44 §2) -->
  {#if store.palette}{#key store.palette.n}<Palette />{/key}{/if}
  {#if store.refile}{#key store.refile.n}<Refile />{/key}{/if}
  <!-- the window's menus (a tab's, the files' tree): the new menu (ТЗ 44 §3.4) -->
  {#if menu}<Menu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
  <!-- the quick entry ⇧⌘I and the Inbox's file in the new look (ТЗ 48 §3, §4); «Добавлено в Inbox» — the window's toast -->
  {#if store.capture}
    {#key store.capture.n}
      <Capture file={store.inboxFile ? nameOf(store.inboxFile.name) : null} onsubmit={(t, d) => store.addToInbox(t, d)}
        onpick={() => { store.capture = null; store.pickInbox = Date.now(); }}
        onclose={(added) => { store.capture = null; if (added && store.inboxCfg.confirm) lists.tell({ lead: 'Добавлено в Inbox', action: { label: 'Открыть', run: () => openInbox() } }); }} />
    {/key}
  {/if}
  {#if store.pickInbox}{#key store.pickInbox}<InboxPicker onclose={() => (store.pickInbox = 0)} />{/key}{/if}
  <!-- the first start, the folder (ТЗ 48 §6) -->
  {#if store.start}<StartScreen />{/if}
  <!-- the bridged sheets and menus in the compatibility layer (ТЗ 43 §5) -->
  <Compat>
    <!-- a note, the task lists' menu and tags (the new look, ТЗ 48) -->
    {#if notePop.req}{#key notePop.req.n}<NotePop req={notePop.req} onclose={closeNote} />{/key}{/if}
    <TaskListHost />
  </Compat>
  {#if store.toast}<div class="toast" role="status">{store.toast.text}{#each store.toast.actions ?? [] as a (a.label)}<button onclick={() => { store.toast = null; a.run(); }}>{a.label}</button>{/each}</div>{/if}
  <Compat>
    <!-- the agenda builder: a sheet over the window, which takes no input under it -->
    {#if store.settingsOpen && store.loaded}<Settings />{/if}
  </Compat>
</div>

<style>
  .next { position: fixed; inset: 0; display: flex; background: var(--bg); color: var(--ink); font: 13px/1.45 var(--ui); }
  .win { flex: 1; min-width: 0; display: flex; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 8px 14px; border-radius: 8px; background: var(--card); border: 1px solid var(--rule); box-shadow: var(--popshadow); }
  .toast button { border: 0; background: none; color: var(--lampink); font-weight: 600; }
</style>
