<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from './store.svelte';
  import Navigator from './Navigator.svelte';
  import Inspector from './Inspector.svelte';
  import Pane from './Pane.svelte';
  import SaveAsSheet from './SaveAsSheet.svelte';
  import UnsavedDialog from './UnsavedDialog.svelte';
  import { installMenu, type AppMenu } from './menu';
  import { MIN_PANE, secondKind } from './layout';
  import { displayPath } from './names';
  import Splitter from './Splitter.svelte';
  import Dialogs from './Dialogs.svelte';
  import Settings from './Settings.svelte';

  // the Settings window is this same app loaded with #settings: it shows only the settings
  const isSettingsWindow = location.hash === '#settings';
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
    if (store.loaded && !isSettingsWindow) store.persistLayout();
  });

  // ---- menu bar and shortcuts -------------------------------------------------------------------------------
  let menu: AppMenu | null = null;
  const actions: Record<string, () => void> = {
    settings: () => store.openSettings(),
    newFile: () => {
      if (!store.canManageFiles) return;
      const dir = store.file && store.file.name.includes('/') ? store.file.name.slice(0, store.file.name.lastIndexOf('/')) : '';
      store.showNav = true;
      store.creating = { dir, kind: 'file' };
    },
    newTab: () => store.newUntitled(store.layout.active),
    closePane: () => store.closePane(store.layout.active),
    openFolder: () => store.chooseFolder(),
    closeTab: () => store.closeActiveTab(),
    closeOthers: () => {
      const p = store.layout.panes[store.layout.active];
      if (p) store.closeOthers(store.layout.active, p.active);
    },
    save: () => store.saveActive(),
    moveLeft: () => store.tabToSide(-1, false),
    moveRight: () => store.tabToSide(1, false),
    dupLeft: () => store.tabToSide(-1, true),
    dupRight: () => store.tabToSide(1, true),
    revealInNav: () => store.revealInNavigator(store.tab),
    copyPath: () => store.copyPath(store.tab),
    quit: () => store.quit(),
    splitRight: () => store.splitRight(),
    swap: () => store.swapPanes(),
    keepOne: () => store.keepOnePane(),
    paneLeft: () => store.focusPane(-1),
    paneRight: () => store.focusPane(1),
    notes: () => store.showNotesHere(),
    agenda: () => store.showAgendaHere(),
    back: () => store.back(),
    nav: () => (store.showNav = !store.showNav),
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
  });
  /** The same shortcuts when there is no native menu (plain browser, tests). */
  function shortcut(e: KeyboardEvent): string | null {
    if (!e.metaKey) return null;
    const k = e.key;
    if (e.ctrlKey && e.shiftKey && (k === 'ArrowRight' || k === 'ArrowLeft')) return 'swap';
    // tabs to the neighbour pane (⌃⌘ / ⌥⌃⌘ + arrow), focus between panes (⌥⌘ + arrow)
    if (e.ctrlKey && k === 'ArrowLeft') return e.altKey ? 'dupLeft' : 'moveLeft';
    if (e.ctrlKey && k === 'ArrowRight') return e.altKey ? 'dupRight' : 'moveRight';
    if (e.altKey && k === 'ArrowLeft') return 'paneLeft';
    if (e.altKey && k === 'ArrowRight') return 'paneRight';
    if (e.altKey && e.code === 'KeyW') return 'closeOthers';
    if (e.ctrlKey && e.code === 'KeyW') return 'closePane';
    if (e.altKey && e.code === 'KeyC') return 'copyPath';
    if (e.shiftKey && e.code === 'KeyJ') return 'revealInNav';
    if (e.code === 'Backslash' || k === '\\') return e.shiftKey ? 'keepOne' : e.altKey ? null : 'splitRight';
    if (e.ctrlKey || e.shiftKey) return null;
    if (k === '0') return e.altKey ? 'insp' : 'nav';
    if (e.altKey) return null;
    return ({ '[': 'back', n: 'newFile', ',': 'settings', o: 'openFolder', t: 'newTab', w: 'closeTab', s: 'save', q: 'quit', '1': 'notes', '2': 'agenda' } as Record<string, string>)[k] ?? null;
  }
  const today = new Date().toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

  onMount(() => {
    store.load();
    store.listen();
    if (isSettingsWindow) return;
    installMenu(actions).then((m) => (menu = m));
    // closing the window asks about unsaved tabs first, like quitting
    if ('__TAURI_INTERNALS__' in window && !(window as any).__ORG_SETTINGS_OVERLAY__) {
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) =>
          getCurrentWindow().onCloseRequested((e) => {
            if (!store.hasUnsaved()) return;
            e.preventDefault();
            store.quit();
          }),
        )
        .catch(() => {});
    }
    const key = (e: KeyboardEvent) => {
      if (menu) return; // the menu bar owns the shortcuts
      const id = shortcut(e);
      if (!id) return;
      if (id === 'settings' && store.settingsOpen) {
        e.preventDefault();
        store.settingsOpen = false;
        return;
      }
      e.preventDefault();
      actions[id]();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
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

{#if isSettingsWindow}
  {#if store.loaded}<Settings standalone />{/if}
{:else}
<div class="win">
  <Dialogs />
  {#if store.saveAsReq}<SaveAsSheet tab={store.saveAsReq.tab} />{/if}
  {#if store.unsavedReq}<UnsavedDialog tab={store.unsavedReq.tab} onanswer={(a) => store.unsavedReq?.resolve(a)} />{/if}
  {#if store.settingsOpen}<Settings />{/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="toolbar" data-tauri-drag-region onmousedown={drag}>
    <div class="lights-gap"></div>
    <button class="ibtn" aria-label="Показать или скрыть навигатор" onclick={() => (store.showNav = !store.showNav)}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" /><path d="M8 3.5v13" /></svg>
    </button>
    <button class="ibtn" aria-label="Назад (⌘[)" title="Назад (⌘[)" disabled={store.history.length === 0} onclick={() => store.back()}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l-6 6 6 6" /></svg>
    </button>
    <div class="path">
      {#if store.mode === 'agenda'}
        <span class="last">Агенда</span>
      {:else if store.tab?.kind === 'untitled'}
        <span class="last">{store.tab.title}</span><span class="sep">·</span><span>не сохранено</span>
      {:else if crumbs.length}
        {#each crumbs as c, i}
          {#if i}<span class="sep">›</span>{/if}<span class:last={i === crumbs.length - 1}>{c}</span>
        {/each}
      {:else}
        <span>Заметки</span>
      {/if}
      <span class="date">{today}</span>
    </div>
    <div class="right">
      <div class="seg3" role="group" aria-label="Открыть в панели">
        <button aria-label="Второй редактор" title="Второй редактор" aria-pressed={pressed === 'file'} class:on={pressed === 'file'} onclick={() => store.toggleSecond('file')}>
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" /><path d="M10 3.5v13" /></svg>
        </button>
        <button aria-label="Агенда" title="Агенда" aria-pressed={pressed === 'agenda'} class:on={pressed === 'agenda'} onclick={() => store.toggleSecond('agenda')}>
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5h9M8 10h9M8 14.5h9" /><circle cx="4" cy="5.5" r="1" /><circle cx="4" cy="10" r="1" /><circle cx="4" cy="14.5" r="1" /></svg>
        </button>
        <button aria-label="Календарь" title="Календарь (пока нет)" aria-pressed="false" disabled>
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="2.5" /><path d="M3 8h14M7 2.5v3M13 2.5v3" /><circle cx="10" cy="12.5" r="2" /></svg>
        </button>
      </div>
      <button class="ibtn" aria-label="Настройки (⌘,)" title="Настройки (⌘,)" onclick={() => store.openSettings()}>
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></svg>
      </button>
      <button class="ibtn" aria-label="Показать или скрыть инспектор" onclick={() => (store.showInspector = !store.showInspector)}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" /><path d="M12 3.5v13" /></svg>
      </button>
    </div>
  </div>

  <div class="body" bind:clientWidth={bodyW}>
    {#if fit.nav}
      <aside class="side" style="width:{store.navW}px"><Navigator /></aside>
      <Splitter onresize={(dx) => (store.navW = clamp(store.navW + dx, 180, 480))} />
    {/if}

    <main class="center">
      {#if store.needFolder}
        <div class="welcome">
          <svg width="44" height="44" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.2" stroke-linejoin="round"><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" /></svg>
          <h1>Выберите папку с заметками</h1>
          <p>Приложение читает и пишет обычные <code>.org</code>-файлы. Подпапки тоже учитываются, правки из Emacs подхватываются сразу.</p>
          <div class="wbtns">
            <button class="wprimary" onclick={() => store.chooseFolder()}>Выбрать папку…</button>
            {#if store.hasSample}<button class="wsecondary" onclick={() => store.useSample()}>Открыть примеры</button>{/if}
          </div>
        </div>
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
      <Splitter onresize={(dx) => (store.inspW = clamp(store.inspW - dx, 220, 440))} />
      <aside class="side" style="width:{store.inspW}px"><Inspector /></aside>
    {/if}
  </div>
</div>
{/if}

<style>
  .win { height: 100%; display: flex; flex-direction: column; }
  .toolbar {
    flex: 0 0 52px; display: flex; align-items: center; gap: 12px; padding: 0 14px;
    background: var(--bar-bg); border-bottom: 1px solid var(--line);
  }
  .lights-gap { flex: 0 0 68px; }
  :global(html:not(.tauri)) .lights-gap { flex-basis: 4px; }
  .ibtn { width: 30px; height: 28px; border: 0; background: transparent; color: var(--fg2); border-radius: 6px; padding: 0; display: flex; align-items: center; justify-content: center; }
  .ibtn:hover:not(:disabled) { background: var(--field); }
  .ibtn:disabled { opacity: 0.35; }
  .path {
    flex: 1 1 360px; max-width: 640px; min-width: 200px; height: 28px; display: flex; align-items: center; gap: 8px;
    padding: 0 12px; background: var(--field); border-radius: 7px; color: var(--fg2); font-size: 12.5px; white-space: nowrap; overflow: hidden;
  }
  .pfirst, .last { color: var(--fg); }
  .sep { color: var(--fg3); }
  .date { margin-left: auto; color: var(--fg3); padding-left: 12px; }
  .right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  /* "Открыть в панели": three icon buttons in a grey capsule, the pressed one on a light plate */
  .seg3 { display: flex; padding: 2px; background: var(--field); border-radius: 8px; gap: 2px; }
  .seg3 button { width: 30px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); padding: 0; display: flex; align-items: center; justify-content: center; }
  .seg3 button.on { background: var(--segon); color: var(--acc); box-shadow: var(--shadow); }
  .seg3 button:disabled { opacity: 0.4; }
  .seg3 button:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }

  .body { flex: 1; min-height: 0; display: flex; }
  .side { flex: 0 0 auto; min-width: 0; background: var(--side-bg); overflow: hidden; }
  .center { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; background: var(--bg); }
  .panes { flex: 1; min-height: 0; display: flex; }
  .pwrap { min-width: 0; display: flex; }
  .divider { flex: 0 0 1px; background: var(--line); position: relative; z-index: 5; }
  .divider::after { content: ''; position: absolute; inset: 0 -4px; cursor: col-resize; }
  .welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px; text-align: center; }
  .welcome h1 { margin: 6px 0 0; font-size: 20px; font-weight: 700; }
  .welcome p { margin: 0; max-width: 420px; color: var(--fg2); line-height: 1.5; }
  .welcome code { font-family: var(--mono); font-size: 12px; background: var(--field); padding: 1px 5px; border-radius: 4px; }
  .wbtns { display: flex; gap: 10px; margin-top: 8px; }
  .wprimary, .wsecondary { height: 30px; padding: 0 16px; border: 0; border-radius: 6px; font-size: 13px; }
  .wprimary { background: var(--acc); color: var(--onacc); font-weight: 600; }
  .wsecondary { background: var(--field); }
</style>
