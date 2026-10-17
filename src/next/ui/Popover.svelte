<script lang="ts">
  import type { Snippet } from 'svelte';

  // A popover of the new interface (ТЗ 44 §1): on `card`, a 1 pt `rule`, the shadow, 10 pt corners, 5 pt inside; at a
  // point of the window, kept inside it. It comes in 120 ms (fading in, 4 pt down) unless «Уменьшить движение». A
  // click outside or ⎋ closes it (`onclose`); `nested`: a submenu — the outer one has the scrim and the keys.
  let { x, y, width = 200, nested = false, role = 'dialog', label, onclose, onkeydown, el = $bindable(), children }: {
    x: number; y: number; width?: number; nested?: boolean; role?: string; label?: string;
    onclose: () => void; onkeydown?: (e: KeyboardEvent) => void; el?: HTMLDivElement; children: Snippet;
  } = $props();

  let w = $state(0);
  let h = $state(0);
  const pos = $derived({ left: Math.max(4, Math.min(x, window.innerWidth - (w || width) - 4)), top: Math.max(4, Math.min(y, window.innerHeight - h - 4)) });
</script>

<svelte:window onblur={() => !nested && onclose()} />
{#if !nested}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" onmousedown={onclose} oncontextmenu={(e) => { e.preventDefault(); onclose(); }}></div>
{/if}
<div class="pop" {role} aria-label={label} tabindex="-1" bind:this={el} bind:offsetWidth={w} bind:offsetHeight={h} {onkeydown}
  style="left:{pos.left}px;top:{pos.top}px;min-width:{width}px">
  {@render children()}
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 90; }
  .pop {
    position: fixed; z-index: 91; max-width: min(440px, calc(100vw - 8px)); box-sizing: border-box; padding: 5px;
    border: 1px solid var(--rule); border-radius: 10px; background: var(--card); box-shadow: var(--popshadow);
    color: var(--ink); font: 13px var(--ui); outline: none; animation: pop-in 120ms ease-out;
  }
  @keyframes pop-in { from { opacity: 0; transform: translateY(-4px); } }
  @media (prefers-reduced-motion: reduce) { .pop { animation: none; } }
</style>
