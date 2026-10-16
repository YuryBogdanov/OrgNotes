<script lang="ts">
  import { parentOf } from './navTree';
  import './features'; // the built-in features register their tabs, sections and keys (roadmap 0.3)
  import './linkPicker'; // «Ссылка на» for the editors (ТЗ 35)
  import { onMount, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { store } from './store.svelte';
  import Inspector from './Inspector.svelte';
  import Pane from './Pane.svelte';
  import SaveAsSheet from './SaveAsSheet.svelte';
  import CloseSheet from './CloseSheet.svelte';
  import Palette from './Palette.svelte';
  import DiskSheet from './DiskSheet.svelte';
  import StartScreen from './StartScreen.svelte';
  import EmptyFolder from './EmptyFolder.svelte';
  import Toolbar from './Toolbar.svelte';
  import { installMenu, type AppMenu } from './menu';
  import { dividerRatio, fitPanels } from './layout';
  import Splitter from './Splitter.svelte';
  import Dialogs from './Dialogs.svelte';
  import Settings from './Settings.svelte';
  import AgendaBuilder from './AgendaBuilder.svelte';
  import NavPanel from './NavPanel.svelte';
  import Capture from './Capture.svelte';
  import Picker from './Picker.svelte';
  import Refile from './Refile.svelte';
  import CaptureWindow from './CaptureWindow.svelte';
  import MiniWindow from './MiniWindow.svelte';
  import { displayName as nameOf } from './names';
  import { toAccelerator } from './keys';
  import { applyAppearance, readChoice, readThemeNames } from './appearance';

  // the appearance and the editor theme (ТЗ 25): applied on every change; «Системное» follows macOS, and another
  // window of the app (the quick entry) takes a change made in this one
  $effect(() => applyAppearance(store.appearanceChoice, store.appearance, store.theme));
  onMount(() => {
    void store.loadThemes(); // own themes: a chosen one shows once they are read
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const sys = () => (store.systemDark = mq.matches);
    mq.addEventListener('change', sys);
    const other = (e: StorageEvent) => {
      if (e.key === 'appearance') store.appearanceChoice = readChoice();
      else if (e.key?.startsWith('theme:')) {
        store.themeNames = readThemeNames();
        void store.loadThemes(); // a theme made in the other window
      }
    };
    window.addEventListener('storage', other);
    return () => {
      mq.removeEventListener('change', sys);
      window.removeEventListener('storage', other);
    };
  });
  import { keyHandler, menuMayRun } from './keyDispatch';
  import { focusedEditor } from './editorKeys';
  import { actionOf, allNavs, allViews } from './views';
  import { today } from './todayState.svelte';
  import EndDay from './EndDay.svelte';
  import { plugins } from './api/host.svelte';
  import { pluginUpdates } from './pluginUpdates.svelte';
  import PluginSheets from './PluginSheets.svelte';
  import TaskListHost from './TaskListHost.svelte';
  import NotePop from './NotePop.svelte';
  import { notePop } from './noteReq.svelte';

  // the quick entry from another program: a panel of its own with only the entry (the main window does the writing)
  const isCaptureWindow = location.hash === '#capture';
  const isMiniWindow = location.hash === '#mini'; // the mini window over other programs (ТЗ 31)
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  // ---- room for two panes: hide the inspector first, then the navigator, then merge the panes ----------
  let bodyW = $state(0);
  const fit = $derived(fitPanels(bodyW, { navW: store.navW, inspW: store.inspW, nav: store.showNav, insp: store.showInspector, two: store.layout.panes.length > 1 }));
  $effect(() => {
    if (fit.merge) store.mergePanes();
  });

  // ---- the navigator and the inspector come and go as in Xcode: the editor widens, the panel slides out to its side
  // (its content keeps its width, the edge by the editor goes first)
  const slide = (node: HTMLElement) => {
    const w = node.offsetWidth;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return { duration: still ? 0 : 220, easing: cubicOut, css: (t: number) => `width:${t * w}px` };
  };

  // ---- the divider between the panes ---------------------------------------------------------------------
  let panesEl: HTMLDivElement | undefined = $state();
  function dragDivider(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      if (!panesEl) return;
      const r = panesEl.getBoundingClientRect();
      store.layout.ratio = dividerRatio(m.clientX, r.left, r.width);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  // ---- the layout survives a restart ----------------------------------------------------------------------
  $effect(() => {
    if (store.loaded) store.persistLayout();
  });
  // a file changed or vanished on disk under edits: ask when the window is in front, no sheet is up and its tab
  // is shown — one question at a time
  $effect(() => {
    void [store.conflicts, store.orphans, store.sheetOpen, store.appActive, store.layout.active];
    for (const p of store.layout.panes) void p.tabs[p.active]?.path;
    untrack(() => store.pumpDisk());
  });

  // ---- menu bar and shortcuts -------------------------------------------------------------------------------
  function closeNote() {
    const back = notePop.req?.back;
    notePop.req = null;
    back?.();
  }
  let menu = $state<AppMenu | null>(null);
  const actions: Record<string, () => void> = {
    settings: () => store.openSettings(),
    // «Правка» (ТЗ 35): in the editor with the focus; «Копировать ссылку» also at the caret of the file shown
    pasteText: () => void focusedEditor()?.run('pasteText'),
    copyLink: () => {
      if (focusedEditor()?.run('copyLink')) return;
      if (store.curPath) void store.copyHeadingLink(store.curPath, store.cursor.line);
    },
    newFolder: () => store.canManageFiles && store.openPalette('newFolder'),
    outline: () => store.showOutline(),
    captureHere: () => store.openCapture(),
    navCollapse: () => store.navTree('collapse'),
    navExpand: () => store.navTree('expand'),
    newFile: () => {
      if (!store.canManageFiles) return;
      const dir = store.file ? parentOf(store.file.name) : '';
      store.showNav = true;
      store.creating = { dir, kind: 'file' };
    },
    newTab: () => store.newUntitled(store.layout.active),
    palette: () => store.togglePalette(),
    jumpBar: () => store.jumpReq++,
    structure: () => store.toggleStructure(),
    paletteNewFile: () => store.openPalette('newFile'),
    paletteGoto: () => store.openPalette('goto'),
    closePane: () => store.closePane(store.layout.active),
    openFolder: () => store.changeFolder(),
    closeTab: () => store.closeActiveTab(),
    closeOthers: () => {
      const p = store.layout.panes[store.layout.active];
      if (p) store.closeOthers(store.layout.active, p.active);
    },
    save: () => (store.builder ? store.builderSave++ : store.saveActive()),
    moveLeft: () => store.tabToSide(-1, false),
    moveRight: () => store.tabToSide(1, false),
    dupLeft: () => store.tabToSide(-1, true),
    dupRight: () => store.tabToSide(1, true),
    revealInNav: () => store.revealInNavigator(store.tab),
    copyPath: () => store.copyPath(store.tab),
    quit: () => store.quit(),
    closeWindow: () => store.hideWindow(), // as on macOS: the app stays in the Dock, nothing is lost
    splitRight: () => store.splitRight(),
    swap: () => store.swapPanes(),
    keepOne: () => store.keepOnePane(),
    paneLeft: () => store.focusPane(-1),
    paneRight: () => store.focusPane(1),
    notes: () => store.showNotesHere(),
    agenda: () => store.showAgendaHere(),
    back: () => store.back(),
    nav: () => (store.showNav = !store.showNav),
    miniOpen: () => store.openInMini(),
    miniShow: () => store.toggleMini(),
    today: () => today.open(),
    endDay: () => today.openEndDay(),
    navFiles: () => store.setNavMode('files'),
    navAgendas: () => store.setNavMode('agendas'),
    navTags: () => store.setNavMode('tags'),
    capture: () => store.openCapture(),
    rich: () => store.setRich(!store.rich),
    find: () => store.askFind('open'),
    findAll: () => store.openSearch(window.getSelection()?.toString() ?? ''),
    findNext: () => store.askFind('next'),
    findPrev: () => store.askFind('prev'),
    useSelection: () => store.askFind('useSel'),
    searchNext: () => store.searchStep(1),
    searchPrev: () => store.searchStep(-1),
    navSearch: () => store.openSearch(),
    insp: () => (store.showInspector = !store.showInspector),
  };
  $effect(() => {
    const two = store.layout.panes.length > 1;
    if (!menu) return;
    menu.setEnabled('splitRight', !two);
    for (const id of ['swap', 'keepOne', 'closePane', 'paneLeft', 'paneRight']) menu.setEnabled(id, two);
    const pi = store.layout.active;
    const t = store.tab;
    menu.setEnabled('moveRight', two && pi === 0);
    menu.setEnabled('moveLeft', two && pi === 1);
    menu.setEnabled('dupRight', two && pi === 0 && t?.kind !== 'untitled');
    menu.setEnabled('dupLeft', two && pi === 1 && t?.kind !== 'untitled');
    menu.setEnabled('revealInNav', t?.kind === 'file');
    menu.setEnabled('copyPath', t?.kind === 'file');
    menu.setChecked('rich', store.rich);
  });
  // closing the last tab of a kind tells its feature (a review ends: everything is on disk already)
  $effect(() => {
    for (const v of allViews()) if (v.onGone && !store.layout.panes.some((p) => p.tabs.some((t) => t.kind === v.kind))) v.onGone();
  });

  // the panel of the quick entry knows the Inbox file's name from here
  $effect(() => {
    const f = store.inboxFile;
    if (isCaptureWindow || isMiniWindow) return;
    try {
      if (f) localStorage.setItem('capture:file', nameOf(f.name) + '.org');
      else localStorage.removeItem('capture:file');
    } catch {
      /* no storage */
    }
  });

  // while a sheet is up, commands do nothing; ⇧⌘P closes the palette, ⌘, the settings, and ⌘S in the agenda
  // builder saves the agenda
  const allowed = (id: string) =>
    !store.sheetOpen || (id === 'palette' && store.palette) || (id === 'settings' && store.settingsOpen) ||
    (id === 'save' && store.builder && !store.unsavedReq && !store.saveAsReq && !store.errorReq && !store.diskReq);
  /** A command of the window run by its key; false if it may not run now (the key then goes on). */
  // the features' sections of the navigator: their shortcuts show them (⌃⌘2 Inbox, ⌃⌘4 Цели, ⌃⌘5 Календарь)
  for (const n of allNavs())
    if (n.key)
      actions[n.key] = () => {
        store.showNav = true;
        store.setNavMode(n.id);
      };
  const runWindow = (id: string) => {
    const run = actions[id] ?? actionOf(id); // a plugin's command (roadmap 1.1)
    if (!run || !allowed(id)) return false;
    run();
    return true;
  };
  // the menu bar with the shortcuts as set now, built again when one changes
  const menuActions = Object.fromEntries(
    Object.keys(actions).map((id) => [id, () => {
      if (menuMayRun(toAccelerator(store.keyHint(id)) ? store.keyHint(id) : undefined) && allowed(id)) actions[id]();
    }]),
  );
  $effect(() => {
    if (isCaptureWindow || isMiniWindow) return;
    const b = store.bindings;
    let stale = false;
    void installMenu(menuActions, (id) => toAccelerator(b.get(id)?.[0] ?? '')).then((m) => {
      if (stale) return m?.close();
      menu?.close();
      menu = m;
    });
    return () => {
      stale = true;
    };
  });

  onMount(() => {
    if (isCaptureWindow || isMiniWindow) return; // a thin panel: no files, no menu
    store.load();
    store.listen();
    void plugins.start().then(() => pluginUpdates.check()); // the plugins' code (roadmap 1.1), once the window is up; their updates once a day (ТЗ 37)
    // closing the window only hides it (Rust side): the text stays in memory, so nothing to ask; quitting asks
    const key = keyHandler(runWindow);
    window.addEventListener('keydown', key, true);
    // one ⌘Z (roadmap 0.1): in a text field it is the field's own; anywhere else it takes back the last edit a
    // feature made — in the Inbox list, on a review card, in the calendar, in goals
    const undo = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !e.metaKey || e.shiftKey || e.altKey || e.ctrlKey || e.code !== 'KeyZ') return;
      if ((e.target as Element | null)?.closest?.('.cm-editor, input, textarea, select, [contenteditable]') || store.sheetOpen) return;
      e.preventDefault();
      void store.undoLast();
    };
    window.addEventListener('keydown', undo);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keydown', undo);
    };
  });

</script>

{#if isCaptureWindow}
  <CaptureWindow />
{:else if isMiniWindow}
  <MiniWindow />
{:else}
<!-- the agenda builder is a sheet over the whole window: the window stays visible under it but takes no input -->
<!-- full screen with the menu bar shown: the toolbar grows by it (its buttons stay just below it), the traffic lights
     come into the toolbar -->
<div class="win" inert={!!store.builder || store.settingsOpen || !!plugins.form || !!plugins.trustReq || !!plugins.sheetReq} style:--menu="{store.titlebar.fullscreen && store.titlebar.lights ? store.titlebar.menu : 0}px">
  <Dialogs />
  <!-- keyed: "Сохранить всё" opens one sheet after another, each with its own note's name -->
  {#if store.saveAsReq}{#key store.saveAsReq}<SaveAsSheet tab={store.saveAsReq.tab} />{/key}{/if}
  {#if store.unsavedReq}<CloseSheet items={store.unsavedReq.items} onanswer={(a) => store.unsavedReq?.resolve(a)} />{/if}
  {#if store.start}<StartScreen />{/if}
  {#if store.palette}{#key store.palette.n}<Palette />{/key}{/if}
  {#if store.diskReq}{#key store.diskReq}<DiskSheet kind={store.diskReq.kind} path={store.diskReq.path} onanswer={(a) => store.diskReq?.resolve(a)} />{/key}{/if}
  {#if store.capture}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="capscrim" onmousedown={(e) => { if (e.target === e.currentTarget) store.capture = null; }}>
      {#key store.capture.n}
        <Capture file={store.inboxFile ? nameOf(store.inboxFile.name) + '.org' : null}
          onsubmit={(t, d) => store.addToInbox(t, d)}
          onpick={() => { store.capture = null; store.pickInbox = Date.now(); }}
          onclose={(added) => { store.capture = null; if (added && store.inboxCfg.confirm) store.note('Добавлено в Inbox', undefined, 1600); }} />
      {/key}
    </div>
  {/if}
  {#if store.pickInbox}{#key store.pickInbox}<Picker onclose={() => (store.pickInbox = 0)} />{/key}{/if}
  {#if store.refile}{#key store.refile.n}<Refile />{/key}{/if}
  {#if notePop.req}{#key notePop.req.n}<NotePop req={notePop.req} onclose={closeNote} />{/key}{/if}
  <TaskListHost />
  {#if store.errorReq}<CloseSheet error={store.errorReq} onanswer={() => store.errorReq?.resolve()} />{/if}
  <!-- a start screen comes instead of the window (no toolbar, no navigator) -->
  {#if !store.start}
  <Toolbar />

  <div class="body" bind:clientWidth={bodyW}>
    {#if fit.nav}
      <div class="slot nav-slot" transition:slide>
        <aside class="side" style="width:{store.navW}px"><NavPanel /></aside>
        <Splitter onresize={(dx) => (store.navW = clamp(store.navW + dx, 180, 480))} />
      </div>
    {/if}

    <main class="center">
      {#if store.loaded && !store.files.length && !store.folderGone && !store.layout.panes.some((p) => p.tabs.length)}
        <EmptyFolder />
      {:else}
        <div class="panes" bind:this={panesEl}>
          {#each store.layout.panes as p, i (p.id)}
            {#if i === 1}
              <div class="divider" role="separator" aria-orientation="vertical" aria-label="Граница панелей"
                onpointerdown={dragDivider} ondblclick={() => (store.layout.ratio = 0.5)}></div>
            {/if}
            <div class="pwrap" style="flex:{store.layout.panes.length > 1 ? (i === 0 ? store.layout.ratio : 1 - store.layout.ratio) : 1} 1 0">
              <Pane pi={i} />
            </div>
          {/each}
        </div>
      {/if}
    </main>

    {#if fit.insp}
      <div class="slot insp-slot" transition:slide>
        <Splitter onresize={(dx) => (store.inspW = clamp(store.inspW - dx, 220, 440))} />
        <aside class="side" style="width:{store.inspW}px"><Inspector /></aside>
      </div>
    {/if}
  </div>
  {/if}
</div>
<!-- the toast stays live while a sheet makes the window inert («Вернуть» of a plugin removed in the settings) -->
{#if store.toast}
  <div class="toast" class:acts={!!store.toast.actions} role="status">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={store.toast.icon ?? 'M16.5 10a6.5 6.5 0 1 1-2-4.7M16.5 3.5V6.5h-3'} /></svg>
    <span>{store.toast.text}</span>
    {#each store.toast.actions ?? [] as a}<button class="tbtn" onclick={() => { store.toast = null; a.run(); }}>{a.label}</button>{/each}
  </div>
{/if}
{#if store.builder}{#key store.builder.n}<AgendaBuilder />{/key}{/if}
{#if store.settingsOpen && store.loaded}<Settings />{/if}
{#if today.ending}<EndDay />{/if}

<!-- the sheets a plugin asks for: over the window and the settings (the trust sheet comes from «Плагины») -->
<PluginSheets />
{/if}

<style>
  /* «обновлён с диска»: does not take the focus or block typing, goes after 4 s */
  .toast { position: fixed; left: 50%; bottom: 44px; transform: translateX(-50%); z-index: 80; display: flex; align-items: center; gap: 10px; max-width: calc(100% - 32px); padding: 9px 14px; background: var(--bar); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22); font-size: 12.5px; color: var(--fg); pointer-events: none; }
  .toast.acts { pointer-events: auto; }
  .tbtn { flex: 0 0 auto; height: 22px; padding: 0 10px; border: 0; border-radius: 5px; background: var(--field); color: var(--acc); font-size: 12px; font-weight: 600; }
  .capscrim { position: fixed; inset: 0; z-index: 96; background: rgba(0, 0, 0, 0.28); display: flex; align-items: flex-start; justify-content: center; padding-top: 110px; }
  .toast span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .win { height: 100%; display: flex; flex-direction: column; }
  .body { flex: 1; min-height: 0; display: flex; }
  .side { flex: 0 0 auto; min-width: 0; background: var(--side-bg); overflow: hidden; }
  /* the panel and its splitter; while it comes or goes only its width changes: the navigator's content is held by its
     right edge (it slides left), the inspector's by its left one (it slides right) */
  .slot { flex: 0 0 auto; min-height: 0; display: flex; overflow: hidden; }
  .nav-slot { justify-content: flex-end; }
  .insp-slot { justify-content: flex-start; }
  .center { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; background: var(--bg); }
  .panes { flex: 1; min-height: 0; display: flex; }
  .pwrap { min-width: 0; display: flex; }
  .divider { flex: 0 0 1px; background: var(--line); position: relative; z-index: 5; }
  .divider::after { content: ''; position: absolute; inset: 0 -4px; cursor: col-resize; }
</style>
