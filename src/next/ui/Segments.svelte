<script lang="ts" generics="T">
  // Segments of the new interface (ТЗ 44): a few short options in a row on `chip`, the chosen one on `segon`.
  let { value, options, label, labelledby, disabled = false, onchange }: {
    value: T; options: { value: T; label: string; disabled?: boolean }[]; label?: string; labelledby?: string; disabled?: boolean; onchange: (v: T) => void;
  } = $props();
</script>

<span class="seg" role="radiogroup" aria-label={label} aria-labelledby={labelledby}>
  {#each options as o, i (i)}
    <button role="radio" aria-checked={value === o.value} class:on={value === o.value} disabled={disabled || o.disabled} onclick={() => onchange(o.value)}>{o.label}</button>
  {/each}
</span>

<style>
  .seg { flex: 0 0 auto; display: inline-flex; gap: 2px; padding: 2px; border-radius: 7px; background: var(--chip); }
  .seg button { height: 24px; padding: 0 11px; border: 0; border-radius: 5px; background: transparent; color: var(--ink2); font: 12.5px var(--ui); white-space: nowrap; }
  .seg button.on { background: var(--segon); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); }
  .seg button:disabled { opacity: 0.45; }
  .seg button:focus-visible { outline: 2px solid var(--lampline); outline-offset: 1px; }
</style>
