<script lang="ts">
  import { store } from './store.svelte';
  import Navigator from './Navigator.svelte';
  import AgendaList from './AgendaList.svelte';
  import InboxPanel from './InboxPanel.svelte';
  import SearchPanel from './SearchPanel.svelte';
  import type { NavMode } from './store.svelte';

  // The left panel: a bar of modes (as in Xcode) over the navigator of that mode. The mode belongs to the window:
  // it changes only by the bar or «Вид» (⌃⌘1…⌃⌘3), never by itself when another tab or pane becomes active.
  type Mode = { id: string; label: string; icon: string; on?: NavMode; key?: string };
  const MODES: Mode[] = [
    { id: 'files', label: 'Файлы', icon: 'M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4M7 10h6M7 13h4', on: 'files', key: '⌃⌘1' },
    { id: 'inbox', label: 'Inbox', icon: 'M3 11l2-7h10l2 7v5H3zM3 11h4l1 2h4l1-2h4', on: 'inbox', key: '⌃⌘2' },
    { id: 'tasks', label: 'Задачи', icon: 'M3.5 5.5l1.5 1.5 3-3M3.5 12.5l1.5 1.5 3-3M11 5.5h6M11 12.5h6' },
    { id: 'agendas', label: 'Агенда', icon: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3', on: 'agendas', key: '⌃⌘3' },
    { id: 'tags', label: 'Теги', icon: 'M3 3h6.5l7.5 7.5-6 6L3.5 9.5zM6.8 6.8h.01' },
    { id: 'search', label: 'Поиск по заметкам', icon: 'M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM13.5 13.5L17 17', on: 'search', key: '⌃⌘6' },
  ];
  // the number of unsorted Inbox tasks on its button (0: none; more than 99: «99+»)
  const count = $derived(store.inboxCfg.counter ? store.inboxList.length : 0);
</script>

<div class="panel">
  <div class="modes" role="tablist" aria-label="Режимы навигатора">
    {#each MODES as m (m.id)}
      <button role="tab" aria-label={m.label} title={m.on ? `${m.label} (${m.key})` : `${m.label} — пока нет`} disabled={!m.on}
        aria-selected={store.navMode === m.on} class:on={store.navMode === m.on} onclick={() => m.on && store.setNavMode(m.on)}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={m.icon} /></svg>
        {#if m.id === 'inbox' && count}<span class="badge" aria-label="Задач в Inbox: {count}">{count > 99 ? '99+' : count}</span>{/if}
      </button>
    {/each}
  </div>
  <div class="body">
    {#if store.navMode === 'agendas'}<AgendaList />{:else if store.navMode === 'inbox'}<InboxPanel />{:else if store.navMode === 'search'}<SearchPanel />{:else}<Navigator />{/if}
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
