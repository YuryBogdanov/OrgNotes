<script lang="ts">
  import type { Snippet } from 'svelte';

  // A sheet of the new interface (ТЗ 44 §1, §4): it comes out from under the toolbar (52 pt) in 180 ms, 440 pt wide
  // (a form 460, the disk's 520), its lower corners 14 pt, the window under it dimmed by `dim`. A title in SF Pro 15
  // semibold (no Yeseva One in sheets); the body; the buttons at the foot. ⎋ — `oncancel`.
  let { title, label, width = 440, top = 52, eyebrow, oncancel, children, foot }: {
    title?: string; label?: string; width?: number; top?: number; eyebrow?: Snippet; oncancel: () => void; children: Snippet; foot?: Snippet;
  } = $props();
  let el: HTMLDivElement | undefined = $state();
  $effect(() => {
    queueMicrotask(() => {
      if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>('[autofocus], input, button.main') ?? el).focus();
    });
  });
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      oncancel();
    }
  }
</script>

<div class="dim" aria-hidden="true"></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label={label ?? title} tabindex="-1" bind:this={el} onkeydown={key} style="width:{width}px;top:{top}px">
  {#if eyebrow}<div class="eyebrow">{@render eyebrow()}</div>{/if}
  {#if title}<h2>{title}</h2>{/if}
  <div class="body">{@render children()}</div>
  {#if foot}<div class="foot">{@render foot()}</div>{/if}
</div>

<style>
  .dim { position: fixed; inset: 0; z-index: 80; background: var(--dim); }
  .sheet {
    position: fixed; left: 50%; z-index: 81; max-width: calc(100vw - 32px); max-height: calc(100vh - 80px); box-sizing: border-box;
    display: flex; flex-direction: column; gap: 10px; padding: 20px 22px 18px; overflow: auto;
    transform: translateX(-50%); border: 1px solid var(--rule); border-top: 0; border-radius: 0 0 14px 14px;
    background: var(--card); box-shadow: var(--popshadow); color: var(--ink); font: 13px/1.45 var(--ui); outline: none;
    animation: sheet-in 180ms ease-out;
  }
  @keyframes sheet-in { from { transform: translate(-50%, -16px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }
  .eyebrow { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--plug); }
  h2 { margin: 0; font: 600 15px/1.3 var(--ui); }
  .body { display: flex; flex-direction: column; gap: 10px; color: var(--ink2); }
  .foot { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
</style>
