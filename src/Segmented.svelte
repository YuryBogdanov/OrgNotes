<script lang="ts" generics="T">
  // A segmented control (tech sprint 1.2): a radiogroup of buttons, the chosen one raised; ← → choose the next one.
  // Sizes as the places need them: small (a panel's corner), medium (settings, lists), large (a sheet).
  interface Option {
    value: T;
    label: string;
    disabled?: boolean;
  }
  let { options, value, onchange, label, labelledby, size = 'medium', fill = false, push = false, disabled = false }: {
    options: Option[];
    value: T;
    onchange: (v: T) => void;
    label?: string;
    labelledby?: string;
    size?: 'small' | 'medium' | 'large';
    /** The buttons share the width. */
    fill?: boolean;
    /** Pushed to the end of a row (margin-left: auto). */
    push?: boolean;
    disabled?: boolean;
  } = $props();
  function keys(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const open = options.filter((o) => !o.disabled);
    const i = open.findIndex((o) => o.value === value);
    const next = open[(i + (e.key === 'ArrowRight' ? 1 : -1) + open.length) % open.length];
    if (!next || next.value === value) return;
    e.preventDefault();
    onchange(next.value);
    queueMicrotask(() => ((e.currentTarget as HTMLElement | null)?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
  }
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="seg {size}" class:fill class:push role="radiogroup" aria-label={label} aria-labelledby={labelledby} onkeydown={keys}>
  {#each options as o (o.value)}
    <button role="radio" aria-checked={o.value === value} class:on={o.value === value} disabled={disabled || o.disabled} tabindex={o.value === value ? 0 : -1} onclick={() => o.value !== value && onchange(o.value)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg { display: flex; padding: 2px; gap: 2px; background: var(--field); border-radius: 7px; }
  .seg button { height: 22px; padding: 0 10px; white-space: nowrap; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 12px; }
  .seg button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); font-weight: 600; }
  .seg.small { padding: 1px; gap: 1px; border-radius: 6px; }
  .seg.small button { height: 20px; padding: 0 8px; font-size: 11.5px; }
  .seg.large { border-radius: 8px; }
  .seg.large button { height: 24px; padding: 0 12px; border-radius: 6px; font-size: 12.5px; }
  .fill button { flex: 1; }
  .push { margin-left: auto; }
</style>
