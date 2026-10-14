<script lang="ts">
  import { store } from './store.svelte';
  import Navigator from './Navigator.svelte';
  import AgendaList from './AgendaList.svelte';
  import SearchPanel from './SearchPanel.svelte';
  import TagsPanel from './TagsPanel.svelte';
  import { allNavs, navOf, type NavSpec } from './views';

  // The left panel: a bar of modes (as in Xcode) over the navigator of that mode. The mode belongs to the window:
  // it changes only by the bar or «Вид» (⌃⌘1…⌃⌘8), never by itself when another tab or pane becomes active. The
  // core's modes are here; the features' (Inbox, Цели, Календарь) come from the registry (views.ts), in order.
  type Mode = { id: string; label: string; icon: string; key?: string; order: number; off?: boolean; badge?: () => number };
  const CORE: Mode[] = [
    { id: 'files', label: 'Файлы', icon: 'M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4M7 10h6M7 13h4', key: 'navFiles', order: 0 },
    { id: 'agendas', label: 'Агенда', icon: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3', key: 'navAgendas', order: 30 },
    { id: 'tags', label: 'Теги', icon: 'M3 3h6.5l7.5 7.5-6 6L3.5 9.5zM6.8 6.8h.01', key: 'navTags', order: 60 },
    { id: 'search', label: 'Поиск по заметкам', icon: 'M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM13.5 13.5L17 17', key: 'navSearch', order: 70 },
  ];
  const modes = $derived([...CORE, ...allNavs().map((n: NavSpec): Mode => ({ ...n }))].sort((a, b) => a.order - b.order));
  const feature = $derived(navOf(store.navMode));
</script>

<div class="panel">
  <div class="modes" role="tablist" aria-label="Режимы навигатора">
    {#each modes as m (m.id)}
      {@const count = m.badge?.() ?? 0}
      <button role="tab" aria-label={m.label} title={m.off ? `${m.label} — пока нет` : store.titled(m.label, m.key ?? '')} disabled={m.off}
        aria-selected={store.navMode === m.id} class:on={store.navMode === m.id} onclick={() => !m.off && store.setNavMode(m.id)}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={m.icon} /></svg>
        {#if count}<span class="badge" aria-label="{m.label}: {count}">{count > 99 ? '99+' : count}</span>{/if}
      </button>
    {/each}
  </div>
  <div class="body">
    {#if store.navMode === 'agendas'}<AgendaList />{:else if store.navMode === 'tags'}<TagsPanel />{:else if store.navMode === 'search'}<SearchPanel />{:else if feature}<feature.component id={feature.id} />{:else}<Navigator />{/if}
  </div>
</div>

<style>
  .panel { height: 100%; display: flex; flex-direction: column; min-width: 0; }
  .modes { flex: 0 0 38px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; border-bottom: 1px solid var(--line); color: var(--fg2); }
  .badge { position: absolute; top: -2px; right: 0; min-width: 15px; height: 15px; box-sizing: border-box; padding: 0 4px; border-radius: 8px; background: var(--acc); color: var(--onacc); font-size: 9.5px; font-weight: 700; line-height: 15px; text-align: center; }
  .modes button { position: relative; width: 34px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: inherit; display: flex; align-items: center; justify-content: center; }
  .modes button.on { background: var(--sel); color: var(--acc); }
  .modes button:hover:not(:disabled):not(.on) { background: var(--field); }
  .modes button:disabled { opacity: 0.4; }
  .modes button:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
</style>
