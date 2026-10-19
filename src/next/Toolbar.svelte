<script lang="ts">
  import { store } from '../store.svelte';
  import { viewOf } from '../views';
  import { tabLabel } from '../tabLabels';
  import { TODAY } from '../todayState.svelte';
  import { fmtLong } from '../org';
  import { displayName } from '../names';
  import { windowDrag } from './windowDrag';

  // The toolbar of the new interface (ТЗ 42 §4.1), 52 pt: the sidebar's button (⌘0), the file's name and its path in
  // the notes folder, «Искать везде» (the palette, ⌘K) and «+» — a new note (⌘N). It drags the window (windowDrag).
  let { onnew }: { onnew: () => void } = $props();
  const folder = $derived((store.dir ?? '').replace(/^\/Users\/[^/]+/, '~'));
  // a screen's tab (ТЗ 43 §4): the screen's name, under it its crumbs — «Сегодня» the day, the agenda its name, a
  // plugin's view its `title(state)`; a file's tab: the file's name and its path
  const screen = $derived.by(() => {
    const t = store.tab;
    if (!t || t.kind === 'file' || t.kind === 'untitled') return null;
    if (t.kind === TODAY) return { name: 'Сегодня', sub: fmtLong(new Date()) };
    if (t.kind === 'agenda') return { name: 'Агенда', sub: store.agenda?.name ?? '' };
    const cs = viewOf(t.kind)?.crumbs?.(t) ?? [];
    const label = tabLabel(t);
    const name = cs[0] ?? label;
    return { name, sub: cs.slice(1).join(' › ') || (label !== name ? label : '') };
  });
  // a file: its name without `.org` (ТЗ 44 §11), under it its path
  const name = $derived(screen?.name ?? (store.file ? displayName(store.file.name) : 'Panopticon'));
  const path = $derived(screen ? screen.sub : store.file ? `${folder}/${store.file.name}` : folder);
  const key = (id: string) => store.keyHint(id);
</script>

<header class="bar" class:lights={!store.showNav && store.titlebar.lights} use:windowDrag>
  <button class="ib" aria-label="Боковая панель" title="Боковая панель ({key('nav')})" aria-pressed={store.showNav} onclick={() => (store.showNav = !store.showNav)}>
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2" /><path d="M6 2.5v11" /></svg>
  </button>
  <div class="title">
    <span class="name">{name}</span>
    {#if path}<span class="path" title={path}>{path}</span>{/if}
  </div>
  <span class="gap"></span>
  <button class="search" onclick={() => store.togglePalette()}>
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></svg>
    <span>Искать везде</span>{#if key('searchAll')}<span class="k">{key('searchAll')}</span>{/if}
  </button>
  <button class="ib" aria-label="Новая заметка" title="Новая заметка ({key('newFile')})" onclick={onnew}>
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
  </button>
</header>

<style>
  .bar { flex: 0 0 52px; display: flex; align-items: center; gap: 12px; padding: 0 16px 0 20px; border-bottom: 1px solid var(--rule); -webkit-app-region: drag; }
  /* the sidebar's panel hidden (ТЗ 50 §3): the toolbar over the rail too, the window's lights on it — its content
     right of them (84 pt from the window's edge, the rail's 52 aside) */
  .bar.lights { padding-left: 32px; }
  .bar button { -webkit-app-region: no-drag; }
  .ib { width: 30px; height: 28px; display: flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ink2); }
  .ib:hover { background: var(--chip); color: var(--ink); }
  .title { min-width: 0; display: flex; flex-direction: column; }
  .name { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .path { font-size: 11px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gap { flex: 1; }
  .search { width: 220px; height: 28px; box-sizing: border-box; display: flex; align-items: center; gap: 7px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--chip); color: var(--ink3); font: 13px var(--ui); text-align: left; }
  .search:hover { background: var(--chip2); }
  .k { margin-left: auto; font-size: 11px; }
  button:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
</style>
