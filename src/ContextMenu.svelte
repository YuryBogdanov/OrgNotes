<script module lang="ts">
  export type MenuItem =
    | {
        label: string; action: () => void; danger?: boolean; disabled?: boolean; shortcut?: string;
        // the tab list of a pane: a check at the active one, the tab's icon, a dot at an unsaved one
        checked?: boolean; icon?: string; dot?: boolean; italic?: boolean; // icon: 'file' | 'agenda' | 'untitled', or an SVG path (a feature's tab)
        sub?: MenuItem[]; // a submenu, opened by hovering or a click («Показать как ›»)
      }
    | { note: string } // a grey line, not a command («Виды добавляют плагины»)
    | 'sep';
</script>

<script lang="ts">
  import Self from './ContextMenu.svelte';

  let { x, y, items, onclose, nested = false }: { x: number; y: number; items: MenuItem[]; onclose: () => void; nested?: boolean } = $props();
  // the submenu open: its item's index and where it goes
  let sub = $state<{ i: number; x: number; y: number } | null>(null);
  function openSub(e: Event, i: number) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    sub = { i, x: r.right + 2, y: r.top - 5 };
  }

  // keep the menu inside the window
  let el: HTMLDivElement | undefined = $state();
  const pos = $derived.by(() => {
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? items.length * 26;
    return { left: Math.max(4, Math.min(x, window.innerWidth - w - 4)), top: Math.max(4, Math.min(y, window.innerHeight - h - 4)) };
  });

  const checks = $derived(items.some((it) => it !== 'sep' && !('note' in it) && it.checked !== undefined));

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={(e) => !nested && key(e)} onblur={() => !nested && onclose()} />
{#if !nested}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onmousedown={onclose} oncontextmenu={(e) => { e.preventDefault(); onclose(); }}></div>
{/if}
<div class="menu" role="menu" bind:this={el} style="left:{pos.left}px;top:{pos.top}px">
  {#each items as it, i}
    {#if it === 'sep'}
      <div class="sep"></div>
    {:else if 'note' in it}
      <div class="note">{it.note}</div>
    {:else}
      <button role="menuitem" class:danger={it.danger} class:open={sub?.i === i} disabled={it.disabled} aria-keyshortcuts={it.shortcut} aria-haspopup={it.sub ? 'menu' : undefined} aria-expanded={it.sub ? sub?.i === i : undefined}
        onmouseenter={(e) => (it.sub ? openSub(e, i) : (sub = null))}
        onclick={(e) => { if (it.sub) return openSub(e, i); onclose(); it.action(); }}>
        {#if checks}
          <span class="chk" aria-hidden="true">{#if it.checked}<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5l2.6 2.6L10 3.5" /></svg>{/if}</span>
        {/if}
        {#if it.icon}
          <svg class="ic" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray={it.icon === 'untitled' ? '2.2 2' : undefined} aria-hidden="true">
            {#if it.icon === 'agenda'}<rect x="3" y="4" width="14" height="13" rx="2.5" /><path d="M3 8h14M7 2.5v3M13 2.5v3" />{:else if it.icon === 'file' || it.icon === 'untitled'}<path d="M5 2.5h6l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM11 2.5v4h4" />{:else}<path d={it.icon} />{/if}
          </svg>
        {/if}
        <span class="lb" class:it={it.italic}>{it.label}</span>
        {#if it.dot}<span class="dot" aria-label="не сохранено"></span>{/if}
        {#if it.shortcut}<span class="kb">{it.shortcut}</span>{/if}
        {#if it.sub}<span class="kb more" aria-hidden="true">›</span>{/if}
      </button>
    {/if}
  {/each}
</div>
{#if sub}
  {@const host = items[sub.i]}
  {#if host !== 'sep' && !('note' in host) && host.sub}<Self x={sub.x} y={sub.y} items={host.sub} {onclose} nested />{/if}
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 90; }
  .menu {
    position: fixed; z-index: 91; min-width: 200px; padding: 5px; border-radius: 9px;
    background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(20px);
    border: 1px solid var(--line); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  }
  .menu button { display: flex; align-items: baseline; gap: 8px; width: 100%; text-align: left; border: 0; background: transparent; padding: 4px 10px; border-radius: 5px; font-size: 13px; }
  .menu button:hover:not(:disabled) { background: var(--acc); color: var(--onacc); }
  .menu button:disabled { opacity: 0.4; }
  .menu button.danger { color: var(--todo); }
  .menu button.danger:hover:not(:disabled) { background: var(--todo); color: var(--onacc); }
  .menu { max-width: min(420px, calc(100vw - 8px)); }
  .lb { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lb.it { font-style: italic; }
  .chk { flex: 0 0 12px; align-self: center; display: flex; align-items: center; }
  .ic { flex: 0 0 auto; align-self: center; color: var(--fg2); }
  .menu button:hover:not(:disabled) .ic { color: inherit; }
  .dot { flex: 0 0 6px; align-self: center; width: 6px; height: 6px; border-radius: 3px; background: currentColor; opacity: 0.6; }
  .kb { margin-left: auto; padding-left: 16px; color: var(--fg2); }
  .menu button:hover:not(:disabled) .kb { color: inherit; }
  .sep { height: 1px; background: var(--line); margin: 5px 6px; }
  .note { padding: 4px 10px 3px; font-size: 11px; line-height: 1.4; color: var(--fg3); }
  .menu button.open { background: var(--acc); color: var(--onacc); }
  .more { padding-left: 12px; }
</style>
