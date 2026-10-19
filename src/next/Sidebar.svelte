<script lang="ts">
  import { store } from '../store.svelte';
  import type { MenuItem } from '../menuItems';
  import { allNavs, navOf } from '../views';
  import { today, TODAY } from '../todayState.svelte';
  import { sectionsOf, shownSection, TODAY_ID, type Section } from './sections';
  import { plugins } from '../api/host.svelte';
  import FilesPanel from './FilesPanel.svelte';
  import PluginPanel from './PluginPanel.svelte';
  import Compat from './Compat.svelte';
  import AgendaPanel from './AgendaPanel.svelte';
  import TagsPanel from './TagsPanel.svelte';
  import SearchPanel from './SearchPanel.svelte';
  import TodayPanel from './TodayPanel.svelte';
  import { panelDate } from '../today';
  import { windowDrag } from './windowDrag';

  // The sidebar of the new interface (ТЗ 50 §1–2): the rail of the sections at the window's left edge, 52 pt — the
  // core's, a line, the plugins' (the last ones in «⋯» when they do not fit), the gear at the bottom; buttons of 34 pt
  // with their badges. By it the panel of the section picked, the whole height: its head (the name, the key), the
  // panel scrolling on its own, the line of the folder. The panel 260 pt, from 200 to 360 by dragging its edge (kept on
  // this Mac). Over the toolbar's line the rail and the panel are one surface under the window's lights.
  // «Сегодня» is a section with its panel (ТЗ 50 §4); its full version is the tab «Сегодня».
  // The panel hidden (ТЗ 50 §3: `open` — `prefs.showNav`, ⌘0, the toolbar's button, a click on the section picked):
  // the rail stays, nothing lit in it; its top is the toolbar's (`bg` and its line) with the window's lights; the
  // width goes in 180 ms, as the column at the right.
  let { open = true, width, onwidth, onmenu }: { open?: boolean; width: number; onwidth: (w: number) => void; onmenu: (at: { x: number; y: number }, items: MenuItem[]) => void } = $props();

  const groups = $derived(sectionsOf(allNavs(), store.files.length));
  const shown = $derived(shownSection(store.navMode, groups));
  const feature = $derived(navOf(shown.id));
  const todayOn = $derived(store.tab?.kind === TODAY);

  // a plugin's panel failing turns the plugin off (as in the old navigator) and takes its section away; till another
  // section is picked, the panel's place says so (§3)
  let lastPlugin = $state<{ plugin: string; label: string } | null>(null);
  let broken = $state<{ plugin: string; label: string; msg: string } | null>(null);
  // before the panel draws: a panel failing at once turns its plugin off within the same update
  $effect.pre(() => {
    const p = plugins.navs.get(shown.id)?.plugin;
    if (p) lastPlugin = { plugin: p, label: shown.label };
  });
  $effect(() => {
    const l = lastPlugin;
    const msg = l && plugins.failed.get(l.plugin);
    if (l && msg) {
      broken = { ...l, msg };
      lastPlugin = null;
    }
  });

  function pick(s: Section) {
    // the section picked, its panel shown: hidden; any other — shown with it (setNavMode shows it)
    if (open && s.id === shown.id) return void (store.showNav = false);
    broken = null;
    if (s.id === 'search') return store.openSearch();
    store.setNavMode(s.id);
  }
  const hint = (s: Section) => (s.key ? store.keyHint(s.key) : '');
  const count = (s: Section) => s.badge?.() ?? 0;
  const badge = (n: number) => (n > 99 ? '99+' : String(n));
  const isOn = (s: Section) => open && s.id === shown.id;

  // ---- what fits in the rail: a button 34 + 4 apart; the line 1 + 8 + 8 and its gap; «⋯» takes a place when some do not fit
  const STEP = 38;
  // the list's room without «⋯», from the rail's own height (which «⋯» does not change): the lights 52 + 2, the gaps,
  // the gear 34, 12 under it
  let railH = $state(0);
  const fit = $derived.by(() => {
    const ps = groups.plugins;
    const listH = railH - 108;
    if (!ps.length || !railH) return ps.length;
    const core = groups.core.length * STEP;
    if (core + 21 + ps.length * STEP - 4 <= listH) return ps.length;
    return Math.max(0, Math.floor((listH - core - 21 - STEP) / STEP));
  });
  const inRail = $derived(groups.plugins.slice(0, fit));
  const more = $derived(groups.plugins.slice(fit));
  const moreOn = $derived(open && more.some((s) => s.id === shown.id));
  function moreMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onmenu(
      { x: r.right + 6, y: r.top },
      more.map((s): MenuItem => ({ label: s.label, icon: s.icon, checked: s.id === shown.id, shortcut: count(s) ? badge(count(s)) : undefined, action: () => pick(s) })),
    );
  }

  // the folder's line: ~ for the home folder
  const folderShown = $derived((store.dir ?? '').replace(/^\/Users\/[^/]+/, '~'));
  const folderOk = $derived(!!store.dir && !store.folderGone);

  // ---- the panel's edge: 200–360 pt
  let dragging = $state(false);
  function drag(e: PointerEvent) {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    dragging = true; // no easing while the edge follows the pointer
    const move = (m: PointerEvent) => onwidth(Math.max(200, Math.min(360, Math.round(w0 + m.clientX - x0))));
    const up = () => {
      dragging = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
</script>

{#snippet button(s: Section)}
  {@const n = count(s)}
  {@const on = isOn(s)}
  <button class="ri" class:on aria-current={on ? 'true' : undefined} title={hint(s) ? `${s.label} (${hint(s)})` : s.label} onclick={() => pick(s)}>
    <svg width="16" height="16" viewBox="0 0 {s.vb} {s.vb}" fill="none" stroke="currentColor" stroke-width={s.vb === 20 ? 1.5 : 1.4} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={s.icon} /></svg>
    <span class="sr">{s.label}</span>
    {#if n}<span class="bd" class:alert={s.alert?.()} aria-label="{s.label}: {n}{s.alert?.() ? ', пора посмотреть' : ''}">{badge(n)}</span>{/if}
  </button>
{/snippet}

<aside class="side" class:closed={!open} class:dragging style:width="{open ? 52 + width + 1 : 53}px" aria-label="Боковая панель">
  <div class="rail" bind:clientHeight={railH}>
    <div class="lights" aria-hidden="true" use:windowDrag></div>
    <div class="list">
      <nav class="secs" aria-label="Разделы">
        {#each groups.core as s (s.id)}{@render button(s)}{/each}
      </nav>
      {#if groups.plugins.length}
        <div class="sep" aria-hidden="true"></div>
        <nav class="secs" aria-label="Разделы плагинов">
          {#each inRail as s (s.id)}{@render button(s)}{/each}
        </nav>
      {/if}
    </div>
    {#if more.length}
      <button class="ri more" class:on={moreOn} aria-haspopup="menu" aria-label="Ещё разделы: {more.length}" title="Ещё разделы" onclick={moreMenu}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12.5" cy="8" r="1.3" /></svg>
      </button>
    {/if}
    <button class="ri gear" aria-label="Настройки" title="Настройки ({store.keyHint('settings')})" onclick={() => store.openSettings()}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
    </button>
  </div>
  <div class="pane" style:width="{width}px" inert={!open}>
    <div class="lights" aria-hidden="true" use:windowDrag></div>
    <div class="grp head">
      <span class="pt">{broken?.label ?? shown.label}</span>
      {#if !broken && hint(shown)}<kbd>{hint(shown)}</kbd>{/if}
      {#if !broken && shown.id === TODAY_ID}<span class="sub">{panelDate(today.day)}</span>{/if}
    </div>
    <div class="panel" role="region" aria-label="Панель: {broken?.label ?? shown.label}">
      {#if broken}
        <div class="broken" role="alert">
          <b>Раздел плагина не загрузился</b>
          <span>Плагин выключен: {broken.msg}</span>
          <button onclick={() => store.openSettings('Плагины')}>Подробнее</button>
        </div>
      {:else if shown.id === TODAY_ID}<TodayPanel full={todayOn} />
      {:else if shown.id === 'files'}<FilesPanel {onmenu} />
      {:else if shown.id === 'agendas'}<AgendaPanel />
      {:else if shown.id === 'tags'}<TagsPanel />
      {:else if shown.id === 'search'}<SearchPanel />
      {:else if plugins.navs.has(shown.id)}{#key shown.id}<PluginPanel id={shown.id} />{/key}
      {:else if feature}{#key feature.id}<Compat><feature.component id={feature.id} /></Compat>{/key}{/if}
    </div>
    <div class="folder">
      <span class="dot" class:off={!folderOk} title={folderOk ? 'Папка доступна' : 'Папка недоступна'}></span>
      <span class="path" title={store.dir ?? ''}>{folderShown || 'Папка не выбрана'}</span>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="edge" onpointerdown={drag}></div>
  </div>
</aside>

<style>
  .side { position: relative; flex: 0 0 auto; box-sizing: border-box; display: flex; overflow: hidden; background: var(--side); transition: width 180ms ease; }
  .side.dragging { transition: none; }
  @media (prefers-reduced-motion: reduce) { .side, .side .pane { transition: none !important; } }
  /* its line at the right: the whole height; the panel hidden — under the toolbar, which goes over the rail */
  .side::after { content: ''; position: absolute; right: 0; top: 0; bottom: 0; width: 1px; background: var(--rule); transition: top 0s 0s; }
  .side.closed::after { top: 52px; }
  .side.closed .rail > .lights { background: var(--bg); box-shadow: inset 0 -1px var(--rule); }
  /* and the 1 pt of its line over the toolbar's line: the toolbar's too, no seam under the lights */
  .side.closed::before { content: ''; position: absolute; right: 0; top: 0; width: 1px; height: 52px; background: var(--bg); box-shadow: inset 0 -1px var(--rule); }
  /* the window's lights are drawn by macOS over the top 52 pt; it drags the window */
  .lights { flex: 0 0 52px; align-self: stretch; -webkit-app-region: drag; }
  .rail { flex: 0 0 52px; display: flex; flex-direction: column; align-items: center; gap: 4px; padding-bottom: 12px; box-sizing: border-box; }
  .rail > .lights { margin-bottom: 2px; } /* the first button at 58 pt */
  /* the whole rail's width, not clipped: the badges stand out of their buttons (what does not fit is in «⋯») */
  .list { flex: 1; min-height: 0; align-self: stretch; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .secs { display: flex; flex-direction: column; gap: 4px; }
  .sep { flex: 0 0 1px; width: 24px; margin: 8px 0; background: var(--rule); }
  .ri { position: relative; flex: 0 0 34px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--ink2); }
  .ri:hover:not(.on) { background: var(--chip); }
  /* the one picked (the mockup): `lampsoft`, its icon `lampink`, the `lamp` line inside along its left edge */
  .ri.on { background: var(--lampsoft); color: var(--lampink); box-shadow: inset 2px 0 0 var(--lamp); }
  .ri.gear { color: var(--ink3); }
  .ri:focus-visible { outline: 2px solid var(--lamp); outline-offset: -2px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .bd { position: absolute; top: 1px; right: 1px; min-width: 15px; height: 15px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 0 3px; border-radius: 8px; background: var(--chip2); color: var(--ink2); font: 700 9.5px var(--ui); font-variant-numeric: tabular-nums; }
  /* an alarm (ТЗ 43 §1) */
  .bd.alert { background: var(--todo); color: #fff; }
  /* the panel: by the rail, its line from the toolbar's line to 12 pt over the bottom */
  .pane { position: relative; flex: 0 0 auto; min-width: 0; display: flex; flex-direction: column; box-sizing: border-box; padding: 0 10px; }
  .pane::before { content: ''; position: absolute; left: 0; top: 52px; bottom: 12px; width: 1px; background: var(--rule); }
  .grp.head { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 8px; padding: 10px 6px; }
  .sub { flex: 1 0 100%; margin-top: 2px; font-size: 11.5px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pt { min-width: 0; font-size: 13.5px; font-weight: 700; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  kbd { margin-left: auto; font: 11px var(--mono); color: var(--ink3); white-space: nowrap; }
  .broken { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 8px 10px; font-size: 12px; color: var(--ink2); overflow-wrap: anywhere; }
  .broken b { color: var(--todo); font-weight: 600; }
  .broken button { margin-top: 4px; height: 26px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); }
  .panel { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .folder { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 12px 10px; border-top: 1px solid var(--rule); color: var(--ink3); font-size: 11.5px; }
  .dot { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; background: var(--done); }
  .dot.off { background: var(--todo); }
  .path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* hidden once it has gone in (the tree and the rest out of reach and out of sight) */
  .side.closed .pane { visibility: hidden; transition: visibility 0s 180ms; }
  .edge { position: absolute; top: 0; right: -3px; bottom: 0; width: 6px; cursor: col-resize; }
</style>
