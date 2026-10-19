<script lang="ts" generics="T">
  import Menu from './Menu.svelte';
  import { setLayer } from '../../settingsNav.svelte';

  // A choice as a button of 28 pt with its value and «▾» that opens a menu of ТЗ 44, the chosen one checked.
  let { value, options, label, labelledby, id, disabled = false, width, onchange }: {
    value: T; options: { value: T; label: string; disabled?: boolean }[]; label?: string; labelledby?: string; id?: string; disabled?: boolean; width?: number;
    onchange: (v: T) => void;
  } = $props();
  let at = $state<{ x: number; y: number; w: number } | null>(null);
  const shown = $derived(options.find((o) => o.value === value)?.label ?? '—');
  const layer = `menu:${Math.random()}`;
  $effect(() => setLayer(layer, !!at));
  $effect(() => () => setLayer(layer, false));
  function openMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    at = { x: r.left, y: r.bottom + 4, w: Math.max(r.width, width ?? 160) };
  }
</script>

<button {id} class="mb" {disabled} aria-haspopup="menu" aria-expanded={!!at} aria-label={label ? `${label}: ${shown}` : undefined} aria-labelledby={labelledby} onclick={openMenu}>
  <span class="v">{shown}</span><span class="ch" aria-hidden="true">▾</span>
</button>
{#if at}
  <Menu x={at.x} y={at.y} width={at.w} label={label}
    items={options.map((o) => ({ label: o.label, checked: o.value === value, disabled: o.disabled, action: () => onchange(o.value) }))}
    onclose={() => (at = null)} />
{/if}

<style>
  .mb { flex: 0 0 auto; max-width: 280px; height: 28px; display: inline-flex; align-items: center; gap: 8px; padding: 0 10px 0 12px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); }
  .v { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ch { font-size: 10px; color: var(--ink3); }
  .mb:disabled { opacity: 0.45; }
  .mb:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
</style>
