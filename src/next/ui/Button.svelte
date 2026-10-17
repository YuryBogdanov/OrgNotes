<script lang="ts">
  import type { Snippet } from 'svelte';

  // A button of the new interface (ТЗ 44 §1): 30 pt, 7 pt corners; the main one on `lamp` with `onlamp`, the others on
  // `chip2`; `danger` — the text in `todo`; its key inside, 11 pt at 60%. `small`: a card's (§7), 24 pt.
  let { kind = 'plain', small = false, key, disabled = false, type = 'button', title, label, autofocus = false, onclick, children }: {
    kind?: 'main' | 'plain' | 'danger'; small?: boolean; key?: string; disabled?: boolean; type?: 'button' | 'submit';
    title?: string; label?: string; autofocus?: boolean; onclick?: (e: MouseEvent) => void; children: Snippet;
  } = $props();
  const focus = (el: HTMLButtonElement) => {
    if (autofocus) queueMicrotask(() => el.focus());
  };
</script>

<button {type} class="b {kind}" class:small {disabled} {title} aria-label={label} aria-keyshortcuts={key} {onclick} use:focus>
  {@render children()}{#if key}<span class="k">{key}</span>{/if}
</button>

<style>
  .b { flex: 0 0 auto; height: 30px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 14px; border: 0; border-radius: 7px; font: 500 13px var(--ui); white-space: nowrap; }
  .b.small { height: 24px; gap: 6px; padding: 0 10px; border-radius: 6px; font-size: 11.5px; }
  .main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .plain { background: var(--chip2); color: var(--ink); }
  .danger { background: var(--chip2); color: var(--todo); font-weight: 600; }
  .b:hover:not(:disabled) { filter: brightness(0.97); }
  .b:disabled { opacity: 0.45; }
  .b:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
  .k { font: 11px var(--mono); opacity: 0.6; }
  .small .k { font-size: 10.5px; }
</style>
