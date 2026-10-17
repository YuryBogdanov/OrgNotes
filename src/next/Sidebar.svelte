<script lang="ts">
  import { store } from '../store.svelte';
  import type { FileMenu } from '../fileMenu';
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

  // The sidebar of the new interface (ТЗ 43 §1): the window's lights; the core's sections and the plugins' («Плагины»),
  // 28 pt rows with an icon, a name and a number; a line; the panel of the section picked, under the head of its
  // group, scrolling on its own; the line of the folder with its gear. 236 pt, from 200 to 360 by dragging its edge
  // (kept on this Mac). «Сегодня» is a screen: it opens its tab and keeps the panel.
  let { width, onwidth, onmenu }: { width: number; onwidth: (w: number) => void; onmenu: (at: { x: number; y: number }, items: FileMenu) => void } = $props();

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
    broken = null;
    if (s.id === TODAY_ID) return today.open();
    if (s.id === 'search') return store.openSearch();
    store.setNavMode(s.id);
  }
  const hint = (s: Section) => (s.key ? store.keyHint(s.key) : '');
  const count = (s: Section) => s.badge?.() ?? 0;
  const shownCount = (n: number) => (n > 999 ? '999+' : String(n));

  // the folder's line: ~ for the home folder
  const folderShown = $derived((store.dir ?? '').replace(/^\/Users\/[^/]+/, '~'));
  const folderOk = $derived(!!store.dir && !store.folderGone);

  // ---- the edge: 200–360 pt
  function drag(e: PointerEvent) {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const move = (m: PointerEvent) => onwidth(Math.max(200, Math.min(360, Math.round(w0 + m.clientX - x0))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
</script>

{#snippet row(s: Section)}
  {@const n = count(s)}
  {@const on = s.id === TODAY_ID ? todayOn : s.id === shown.id}
  <button class="si" class:on aria-current={on ? 'true' : undefined} title={hint(s) ? `${s.label} (${hint(s)})` : s.label} onclick={() => pick(s)}>
    <svg width="16" height="16" viewBox="0 0 {s.vb} {s.vb}" fill="none" stroke="currentColor" stroke-width={s.vb === 20 ? 1.5 : 1.4} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={s.icon} /></svg>
    <span class="sn">{s.label}</span>
    {#if n}<span class="c" aria-label="{s.label}: {n}">{shownCount(n)}</span>{/if}
  </button>
{/snippet}

<aside class="side" style:width="{width}px" aria-label="Боковая панель">
  <div class="lights" aria-hidden="true"></div>
  <nav class="secs" aria-label="Разделы">
    {#each groups.core as s (s.id)}{@render row(s)}{/each}
  </nav>
  {#if groups.plugins.length}
    <div class="grp">Плагины</div>
    <nav class="secs" aria-label="Разделы плагинов">
      {#each groups.plugins as s (s.id)}{@render row(s)}{/each}
    </nav>
  {/if}
  <div class="rule"></div>
  <div class="grp head"><span>{broken?.label ?? shown.label}</span>{#if !broken && count(shown)}<span class="n">{shownCount(count(shown))}</span>{/if}</div>
  <div class="panel" role="region" aria-label="Панель: {broken?.label ?? shown.label}">
    {#if broken}
      <div class="broken" role="alert">
        <b>Раздел плагина не загрузился</b>
        <span>Плагин выключен: {broken.msg}</span>
        <button onclick={() => store.openSettings('Плагины')}>Подробнее</button>
      </div>
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
    <button class="gear" aria-label="Настройки" title="Настройки" onclick={() => store.openSettings()}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
    </button>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="edge" onpointerdown={drag}></div>
</aside>

<style>
  .side { position: relative; flex: 0 0 auto; display: flex; flex-direction: column; box-sizing: border-box; padding: 0 10px; background: var(--side); border-right: 1px solid var(--rule); }
  /* the window's lights are drawn by macOS over this strip; it drags the window */
  .lights { flex: 0 0 52px; -webkit-app-region: drag; }
  .secs { flex: 0 0 auto; display: flex; flex-direction: column; gap: 1px; }
  .si { height: 28px; display: flex; align-items: center; gap: 9px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink2); font: 13px var(--ui); text-align: left; white-space: nowrap; }
  .si:hover:not(.on) { background: var(--chip); }
  .si.on { background: var(--lampsoft); color: var(--ink); }
  .si svg { flex: 0 0 16px; }
  .sn { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .c { margin-left: auto; font-size: 11.5px; color: var(--ink3); font-variant-numeric: tabular-nums; }
  .si.on .c { color: var(--lampink); }
  .si:focus-visible, .gear:focus-visible { outline: 2px solid var(--lamp); outline-offset: -2px; }
  .grp { flex: 0 0 auto; display: flex; align-items: center; padding: 14px 10px 6px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  .grp.head { padding-top: 12px; }
  .grp .n { margin-left: auto; font-weight: 400; }
  .rule { flex: 0 0 1px; margin: 12px 4px 0; background: var(--rule); }
  .broken { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 8px 10px; font-size: 12px; color: var(--ink2); overflow-wrap: anywhere; }
  .broken b { color: var(--todo); font-weight: 600; }
  .broken button { margin-top: 4px; height: 26px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); }
  .panel { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .folder { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 12px 10px; border-top: 1px solid var(--rule); color: var(--ink3); font-size: 11.5px; }
  .dot { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; background: var(--done); }
  .dot.off { background: var(--todo); }
  .path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gear { margin-left: auto; display: flex; padding: 2px; border: 0; border-radius: 5px; background: transparent; color: var(--ink3); }
  .gear:hover { color: var(--ink); background: var(--chip); }
  .edge { position: absolute; top: 0; right: -3px; bottom: 0; width: 6px; cursor: col-resize; }
</style>
