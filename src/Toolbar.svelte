<script lang="ts">
  import { store } from './store.svelte';
  import { plugins } from './api/host.svelte';
  import { viewOf } from './views';
  import { secondKind } from './layout';
  import { displayPath } from './names';
  import JumpBar from './JumpBar.svelte';

  // The window's toolbar (tech sprint 4.2, from App.svelte): the traffic lights' room (our own lights in full screen),
  // the navigator and «Назад», the path of the active tab in the middle, «Открыть в панели», the settings and the
  // inspector. It is the window's title bar too.
  const crumbs = $derived(store.file ? displayPath(store.file.name) : []);
  const pressed = $derived(secondKind(store.layout));

  // The toolbar doubles as the window's title bar.
  async function drag(e: MouseEvent) {
    if (e.button !== 0 || !('__TAURI_INTERNALS__' in window)) return;
    if ((e.target as HTMLElement).closest('button, input, select, [role=tab]')) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    if (e.detail === 2) getCurrentWindow().toggleMaximize();
    else getCurrentWindow().startDragging();
  }
</script>

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

<style>
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
  .last { color: var(--fg); }
  .sep { color: var(--fg3); }
  .right { justify-self: end; display: flex; align-items: center; gap: 12px; }
  /* "Открыть в панели": three icon buttons in a grey capsule, the pressed one on a light plate */
  .seg3 { display: flex; padding: 2px; background: var(--field); border-radius: 8px; gap: 2px; }
  .seg3 button { width: 30px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); padding: 0; display: flex; align-items: center; justify-content: center; }
  .seg3 button.on { background: var(--segon); color: var(--acc); box-shadow: var(--shadow); }
  .seg3 button:disabled { opacity: 0.4; }
  .seg3 button:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
</style>
