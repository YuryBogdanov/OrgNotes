<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { portal } from './portal';

  // A dialog over the window (tech sprint 1.2): moved to <body> (a sheet's transform would hold it), the dim behind
  // it, ⎋ and a click on the dim close it, the focus inside — on the element with `autofocus`, else the last button —
  // and kept inside by ⇥.
  let { label, role = 'alertdialog', width = 420, onclose, children }: { label: string; role?: 'alertdialog' | 'dialog'; width?: number; onclose: () => void; children: Snippet } = $props();
  let box: HTMLDivElement | undefined = $state();
  const before = document.activeElement as HTMLElement | null;
  const focusable = () => [...(box?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])];
  onMount(() => {
    const first = box?.querySelector<HTMLElement>('[autofocus]') ?? focusable().filter((x) => x.tagName === 'BUTTON').pop() ?? box;
    first?.focus();
    return () => before?.isConnected && before.focus({ preventScroll: true });
  });
  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    } else if (e.key === 'Tab') {
      const f = focusable();
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && i === f.length - 1) (e.preventDefault(), f[0].focus());
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="m-scrim" use:portal onmousedown={onclose}>
  <div class="m-dlg" bind:this={box} {role} aria-modal="true" aria-label={label} tabindex="-1" style:width="{width}px" onmousedown={(e) => e.stopPropagation()} onkeydown={keys}>
    {@render children()}
  </div>
</div>

<style>
  .m-scrim { position: fixed; inset: 0; z-index: 110; background: var(--dlg-scrim); display: flex; align-items: flex-start; justify-content: center; padding-top: 14vh; color: var(--fg); font: 13px var(--ui); }
  .m-dlg { max-width: calc(100% - 32px); padding: 18px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: var(--dlg-shadow); outline: none; }
  .m-dlg :global(h2) { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  .m-dlg :global(p) { margin: 0 0 14px; color: var(--fg2); line-height: 1.45; }
  .m-dlg :global(.btns) { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .m-dlg :global(.btns button) { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--field); color: var(--fg); }
  .m-dlg :global(.btns button.primary) { background: var(--acc); color: var(--onacc); font-weight: 600; }
  .m-dlg :global(.btns button.danger) { background: var(--danger); color: var(--on-danger); font-weight: 600; }
</style>
