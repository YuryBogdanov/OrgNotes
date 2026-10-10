<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from './store.svelte';
  import Navigator from './Navigator.svelte';
  import Editor from './Editor.svelte';
  import Inspector from './Inspector.svelte';
  import Agenda from './Agenda.svelte';
  import Splitter from './Splitter.svelte';
  import Dialogs from './Dialogs.svelte';
  import Settings from './Settings.svelte';

  // the Settings window is this same app loaded with #settings: it shows only the settings
  const isSettingsWindow = location.hash === '#settings';
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const file = $derived(store.file);
  const crumbs = $derived.by(() => {
    if (!file) return [] as string[];
    const out = [file.name.split('/').pop()!];
    const h = file.headings[store.selected];
    if (h) out.push(...h.path, h.title);
    return out;
  });
  const today = new Date().toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

  onMount(() => {
    store.load();
    store.listen();
    if (isSettingsWindow) return;
    const key = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === '0') { e.preventDefault(); e.altKey ? (store.showInspector = !store.showInspector) : (store.showNav = !store.showNav); }
      if (e.metaKey && e.key === '[') { e.preventDefault(); store.back(); }
      if (e.metaKey && e.key === 'n' && store.canManageFiles) {
        e.preventDefault();
        const dir = store.file && store.file.name.includes('/') ? store.file.name.slice(0, store.file.name.lastIndexOf('/')) : '';
        store.showNav = true;
        store.creating = { dir, kind: 'file' };
      }
      if (e.metaKey && e.key === ',') { e.preventDefault(); if (store.settingsOpen) store.settingsOpen = false; else store.openSettings(); }
      if (e.metaKey && e.key === 'o') { e.preventDefault(); store.chooseFolder(); }
      if (e.metaKey && e.key === '1') { e.preventDefault(); store.mode = 'notes'; }
      if (e.metaKey && e.key === '2') { e.preventDefault(); store.mode = 'agenda'; }
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
      <span class="pfirst">{store.mode === 'agenda' ? 'Агенда' : 'Заметки'}</span>
      {#if store.mode === 'notes'}
        {#each crumbs as c, i}
          <span class="sep">›</span><span class:last={i === crumbs.length - 1}>{c}</span>
        {/each}
      {/if}
      <span class="date">{today}</span>
    </div>
    <div class="right">
      <div class="seg" role="tablist" aria-label="Режим">
        <button role="tab" aria-selected={store.mode === 'notes'} class:on={store.mode === 'notes'} onclick={() => (store.mode = 'notes')}>Заметки</button>
        <button role="tab" aria-selected={store.mode === 'agenda'} class:on={store.mode === 'agenda'} onclick={() => (store.mode = 'agenda')}>Агенда</button>
        <button role="tab" aria-selected="false" disabled title="Пока не нарисован">Календарь</button>
      </div>
      <div class="search">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" /></svg>
        <span>Поиск</span>
      </div>
      <button class="ibtn" aria-label="Настройки (⌘,)" title="Настройки (⌘,)" onclick={() => store.openSettings()}>
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></svg>
      </button>
      <button class="ibtn" aria-label="Показать или скрыть инспектор" onclick={() => (store.showInspector = !store.showInspector)}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" /><path d="M12 3.5v13" /></svg>
      </button>
    </div>
  </div>

  <div class="body">
    {#if store.showNav}
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
      {:else if store.mode === 'agenda'}
        <Agenda />
      {:else if file}
        <div class="tabs"><div class="tab">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" /></svg>
          {file.name.split('/').pop()}
        </div></div>
        <div class="ed">
          <Editor text={file.text} fileKey={file.path} wf={file.wf} reveal={store.reveal}
            onchange={(t) => store.setText(t)} oncursor={(line, col) => { store.cursor = { line, col }; }} onfollow={(l) => store.follow(l)} />
        </div>
        <div class="status">
          <span>Стр. {store.cursor.line + 1}, кол. {store.cursor.col}</span><span>Org</span><span>UTF-8</span>
          <span class="grow">{store.notice || (store.saveState === 'saving' ? 'Сохранение…' : store.saveState === 'saved' ? 'Сохранено' : 'Только в памяти (браузер)')}</span>
          <span>{file.name}</span>
        </div>
      {/if}
    </main>

    {#if store.showInspector}
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
  .seg { display: flex; padding: 2px; background: var(--field); border-radius: 8px; gap: 2px; }
  .seg button { border: 0; height: 24px; padding: 0 14px; border-radius: 6px; background: transparent; color: var(--fg2); font-size: 12.5px; }
  .seg button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); font-weight: 500; }
  .seg button:disabled { opacity: 0.45; }
  .search { width: 160px; height: 28px; display: flex; align-items: center; gap: 7px; padding: 0 10px; background: var(--field); border-radius: 7px; color: var(--fg2); font-size: 12.5px; }

  .body { flex: 1; min-height: 0; display: flex; }
  .side { flex: 0 0 auto; min-width: 0; background: var(--side-bg); overflow: hidden; }
  .center { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; background: var(--bg); }
  .tabs { flex: 0 0 34px; display: flex; align-items: flex-end; padding: 0 8px; background: var(--side); border-bottom: 1px solid var(--line); }
  .tab {
    height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: var(--bg);
    border: 1px solid var(--line); border-bottom: 0; border-radius: 7px 7px 0 0; margin-bottom: -1px; font-size: 12.5px;
  }
  .ed { flex: 1; min-height: 0; }
  .status {
    flex: 0 0 24px; display: flex; align-items: center; gap: 16px; padding: 0 14px; background: var(--side);
    border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2);
  }
  .grow { margin-left: auto; }
  .welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px; text-align: center; }
  .welcome h1 { margin: 6px 0 0; font-size: 20px; font-weight: 700; }
  .welcome p { margin: 0; max-width: 420px; color: var(--fg2); line-height: 1.5; }
  .welcome code { font-family: var(--mono); font-size: 12px; background: var(--field); padding: 1px 5px; border-radius: 4px; }
  .wbtns { display: flex; gap: 10px; margin-top: 8px; }
  .wprimary, .wsecondary { height: 30px; padding: 0 16px; border: 0; border-radius: 6px; font-size: 13px; }
  .wprimary { background: var(--acc); color: var(--onacc); font-weight: 600; }
  .wsecondary { background: var(--field); }
</style>
