<script lang="ts">
  import './features'; // the built-in features register their tabs, sections and keys (roadmap 0.3)
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
  import JumpBar from './JumpBar.svelte';
  import { installMenu, type AppMenu } from './menu';
  import { MIN_PANE, secondKind } from './layout';
  import { displayPath } from './names';
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
  import { actionOf, allNavs, allViews, viewOf } from './views';
  import { plugins } from './api/host.svelte';
  import PluginSheets from './PluginSheets.svelte';

  // the quick entry from another program: a panel of its own with only the entry (the main window does the writing)
  const isCaptureWindow = location.hash === '#capture';
  const isMiniWindow = location.hash === '#mini'; // the mini window over other programs (ТЗ 31)
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const file = $derived(store.file);
  // toolbar path: the folders and the file of the active tab (the heading crumbs live in the pane)
  const crumbs = $derived(file ? displayPath(file.name) : []);
  const pressed = $derived(secondKind(store.layout));

  // ---- room for two panes: hide the inspector first, then the navigator, then merge the panes ----------
  let bodyW = $state(0);
  const room = (nav: boolean, insp: boolean) => bodyW - (nav ? store.navW + 1 : 0) - (insp ? store.inspW + 1 : 0);
  const fit = $derived.by(() => {
    let nav = store.showNav;
    let insp = store.showInspector;
    const two = store.layout.panes.length > 1;
    if (!bodyW || !two) return { nav, insp, merge: false };
    const need = 2 * MIN_PANE + 1;
    if (insp && room(nav, insp) < need) insp = false;
    if (nav && room(nav, insp) < need) nav = false;
    return { nav, insp, merge: room(nav, insp) < need };
  });
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
      const min = Math.min(0.45, MIN_PANE / r.width);
      store.layout.ratio = Math.max(min, Math.min(1 - min, (m.clientX - r.left) / r.width));
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
  let menu = $state<AppMenu | null>(null);
  const actions: Record<string, () => void> = {
    settings: () => store.openSettings(),
    newFolder: () => store.canManageFiles && store.openPalette('newFolder'),
    outline: () => store.showOutline(),
    captureHere: () => store.openCapture(),
    navCollapse: () => store.navTree('collapse'),
    navExpand: () => store.navTree('expand'),
    newFile: () => {
      if (!store.canManageFiles) return;
      const dir = store.file && store.file.name.includes('/') ? store.file.name.slice(0, store.file.name.lastIndexOf('/')) : '';
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
    navFiles: () => store.setNavMode('files'),
    navAgendas: () => store.setNavMode('agendas'),
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
    void plugins.start(); // the plugins' code (roadmap 1.1), once the window is up
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

  // The toolbar doubles as the window's title bar.
  async function drag(e: MouseEvent) {
    if (e.button !== 0 || !('__TAURI_INTERNALS__' in window)) return;
    if ((e.target as HTMLElement).closest('button, input, select, [role=tab]')) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    if (e.detail === 2) getCurrentWindow().toggleMaximize();
    else getCurrentWindow().startDragging();
  }
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
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
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
  {#if store.toast}
    <div class="toast" class:acts={!!store.toast.actions} role="status">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 10a6.5 6.5 0 1 1-2-4.7M16.5 3.5V6.5h-3" /></svg>
      <span>{store.toast.text}</span>
      {#each store.toast.actions ?? [] as a}<button class="tbtn" onclick={() => { store.toast = null; a.run(); }}>{a.label}</button>{/each}
    </div>
  {/if}
  {#if store.errorReq}<CloseSheet error={store.errorReq} onanswer={() => store.errorReq?.resolve()} />{/if}
  <!-- a start screen comes instead of the window (no toolbar, no navigator) -->
  {#if !store.start}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="toolbar" data-tauri-drag-region onmousedown={drag}>
    <div class="left">
    <!-- room for the traffic lights; in full screen only while they are shown (with the menu bar) -->
    <div class="lights-gap" class:gone={!store.titlebar.lights}>
      {#if store.titlebar.fullscreen && store.titlebar.lights}
        <!-- in full screen macOS's own buttons are hidden (Rust): these stand in, as in full screen — no minimise -->
        <div class="lights" role="group" aria-label="Кнопки окна">
          <button class="light close" aria-label="Закрыть окно" onclick={() => store.closeFromFullscreen()}>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.8 3.8l4.4 4.4M8.2 3.8l-4.4 4.4" /></svg>
          </button>
          <button class="light mini" aria-label="Свернуть окно" disabled></button>
          <button class="light zoom" aria-label="Выйти из полноэкранного режима" onclick={() => store.leaveFullscreen()}>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path class="fill" d="M3.3 6.3v2.4h2.4zM8.7 5.7V3.3H6.3z" /></svg>
          </button>
        </div>
      {/if}
    </div>
    <button class="ibtn" aria-label="Показать или скрыть навигатор" onclick={() => (store.showNav = !store.showNav)}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" /><path d="M8 3.5v13" /></svg>
    </button>
    <button class="ibtn" aria-label={store.titled('Назад', 'back')} title={store.titled('Назад', 'back')} disabled={store.history.length === 0} onclick={() => store.back()}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l-6 6 6 6" /></svg>
    </button>
    </div>
    <div class="path">
      {#if store.mode === 'agenda'}
        {#if store.agenda}<span>Агенда</span><span class="sep">›</span><span class="last">{store.agenda.name}</span>{:else}<span class="last">Агенда</span>{/if}
      {:else if viewOf(store.tab?.kind)?.crumbs}
        {@const cs = viewOf(store.tab?.kind)!.crumbs!(store.tab!)}
        {#each cs as c, i (i)}{#if i}<span class="sep">›</span>{/if}<span class:last={i === cs.length - 1}>{c}</span>{/each}
      {:else if store.tab?.kind === 'untitled'}
        <span class="last">{store.tab.title}</span><span class="sep">·</span><span>не сохранено</span>
      {:else if crumbs.length}
        <JumpBar />
      {:else}
        <span>Заметки</span>
      {/if}
    </div>
    <div class="right">
      <div class="seg3" role="group" aria-label="Открыть в панели">
        <button aria-label="Второй редактор" title="Второй редактор" aria-pressed={pressed === 'file'} class:on={pressed === 'file'} disabled={!store.tab && store.layout.panes.length < 2} onclick={() => store.toggleSecond('file')}>
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" /><path d="M10 3.5v13" /></svg>
        </button>
        <button aria-label="Агенда" title="Агенда" aria-pressed={pressed === 'agenda'} class:on={pressed === 'agenda'} onclick={() => store.toggleSecond('agenda')}>
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5h9M8 10h9M8 14.5h9" /><circle cx="4" cy="5.5" r="1" /><circle cx="4" cy="10" r="1" /><circle cx="4" cy="14.5" r="1" /></svg>
        </button>
        {#each plugins.toolbarViews as v (v.id)}
          <button aria-label={v.title} title={v.title} aria-pressed={pressed === v.id} class:on={pressed === v.id} onclick={() => plugins.toggleSecond(v.id)}>
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={v.icon} /></svg>
          </button>
        {/each}
      </div>
      <button class="ibtn" aria-label={store.titled('Настройки', 'settings')} title={store.titled('Настройки', 'settings')} onclick={() => store.openSettings()}>
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></svg>
      </button>
      <button class="ibtn" aria-label="Показать или скрыть инспектор" onclick={() => (store.showInspector = !store.showInspector)}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" /><path d="M12 3.5v13" /></svg>
      </button>
    </div>
  </div>

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
              <!-- svelte-ignore a11y_no_static_element_interactions -->
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
{#if store.builder}{#key store.builder.n}<AgendaBuilder />{/key}{/if}
{#if store.settingsOpen && store.loaded}<Settings />{/if}
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
  .lights { display: flex; gap: 8px; margin-left: 4px; }
  .light { width: 12px; height: 12px; padding: 0; border: 0; border-radius: 6px; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.18); }
  .light svg { width: 8px; height: 8px; opacity: 0; stroke: rgba(0, 0, 0, 0.55); stroke-width: 1.3; stroke-linecap: round; fill: none; }
  .light svg .fill { fill: rgba(0, 0, 0, 0.55); stroke: none; }
  .lights:hover .light svg { opacity: 1; }
  .light.close { background: #ff5f57; }
  .light.zoom { background: #28c840; }
  .light.mini { background: color-mix(in srgb, var(--fg) 22%, transparent); box-shadow: none; }
  .light:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .toolbar { transition: none; } }
  /* as in the design: three columns, the path pill in the middle of the window, as wide as its content */
  .toolbar {
    flex: 0 0 calc(52px + var(--menu, 0px)); display: grid; grid-template-columns: 1fr minmax(0, auto) 1fr; grid-template-rows: 100%; align-items: center; gap: 12px;
    padding: var(--menu, 0px) 14px 0; box-sizing: border-box; transition: flex-basis 0.2s ease, padding 0.2s ease;
    background: var(--bar-bg); border-bottom: 1px solid var(--line);
  }
  .lights-gap { flex: 0 0 68px; transition: flex-basis 0.2s ease, margin 0.2s ease; }
  .lights-gap.gone { flex-basis: 0; margin-right: -12px; } /* and the gap after it */
  @media (prefers-reduced-motion: reduce) { .lights-gap { transition: none; } }
  :global(html:not(.tauri)) .lights-gap { flex-basis: 4px; }
  .ibtn { width: 30px; height: 28px; border: 0; background: transparent; color: var(--fg2); border-radius: 6px; padding: 0; display: flex; align-items: center; justify-content: center; }
  .ibtn:hover:not(:disabled) { background: var(--field); }
  .ibtn:disabled { opacity: 0.35; }
  .left { justify-self: start; display: flex; align-items: center; gap: 12px; min-width: 0; }
  .path {
    justify-self: center; max-width: 100%; min-width: 0; height: 28px; display: flex; align-items: center; gap: 2px;
    padding: 0 6px; background: var(--field); border-radius: 7px; color: var(--fg2); font-size: 12.5px; white-space: nowrap;
    overflow: visible; /* the path bar's menus hang below it */
  }
  .path > span { padding: 0 4px; } /* plain text in the pill (agenda, a new note) lines up with the segments */
  .pfirst, .last { color: var(--fg); }
  .sep { color: var(--fg3); }
  .right { justify-self: end; display: flex; align-items: center; gap: 12px; }
  /* "Открыть в панели": three icon buttons in a grey capsule, the pressed one on a light plate */
  .seg3 { display: flex; padding: 2px; background: var(--field); border-radius: 8px; gap: 2px; }
  .seg3 button { width: 30px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); padding: 0; display: flex; align-items: center; justify-content: center; }
  .seg3 button.on { background: var(--segon); color: var(--acc); box-shadow: var(--shadow); }
  .seg3 button:disabled { opacity: 0.4; }
  .seg3 button:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }

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
