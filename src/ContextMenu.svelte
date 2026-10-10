<script module lang="ts">
  export type MenuItem = { label: string; action: () => void; danger?: boolean; disabled?: boolean; shortcut?: string } | 'sep';
</script>

<script lang="ts">
  let { x, y, items, onclose }: { x: number; y: number; items: MenuItem[]; onclose: () => void } = $props();

  // keep the menu inside the window
  let el: HTMLDivElement | undefined = $state();
  const pos = $derived.by(() => {
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? items.length * 26;
    return { left: Math.max(4, Math.min(x, window.innerWidth - w - 4)), top: Math.max(4, Math.min(y, window.innerHeight - h - 4)) };
  });

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={key} onblur={onclose} />
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onmousedown={onclose} oncontextmenu={(e) => { e.preventDefault(); onclose(); }}></div>
<div class="menu" role="menu" bind:this={el} style="left:{pos.left}px;top:{pos.top}px">
  {#each items as it}
    {#if it === 'sep'}
      <div class="sep"></div>
    {:else}
      <button role="menuitem" class:danger={it.danger} disabled={it.disabled} aria-keyshortcuts={it.shortcut} onclick={() => { onclose(); it.action(); }}>
        <span>{it.label}</span>{#if it.shortcut}<span class="kb">{it.shortcut}</span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 90; }
  .menu {
    position: fixed; z-index: 91; min-width: 200px; padding: 5px; border-radius: 9px;
    background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(20px);
    border: 1px solid var(--line); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  }
  .menu button { display: flex; justify-content: space-between; gap: 24px; width: 100%; text-align: left; border: 0; background: transparent; padding: 4px 10px; border-radius: 5px; font-size: 13px; }
  .menu button:hover:not(:disabled) { background: var(--acc); color: var(--onacc); }
  .menu button:disabled { opacity: 0.4; }
  .menu button.danger { color: var(--todo); }
  .menu button.danger:hover:not(:disabled) { background: var(--todo); color: var(--onacc); }
  .kb { color: var(--fg2); }
  .menu button:hover:not(:disabled) .kb { color: inherit; }
  .sep { height: 1px; background: var(--line); margin: 5px 6px; }
</style>
