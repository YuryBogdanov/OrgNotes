<script lang="ts">
  import { plugins } from '../api/host.svelte';
  import { sourceLabel } from '../api/sources';
  import { iconOf } from '../api/manifest';
  import Toggle from './ui/Toggle.svelte';

  // The head of a plugin's own section (ТЗ 54 §2, ТЗ 37), over its groups: its icon in a square of 30 (14 % `plug`),
  // the name 13.5 semibold, the version and where it came from 12 `ink3`, «включён» on the right.
  let { id }: { id: string } = $props();
  const e = $derived(plugins.entry(id));
  const m = $derived(e?.manifest);
  const PLUG = 'M7 3v4M13 3v4M5 7h10v3a5 5 0 0 1-10 0zM10 15v2.5';
</script>

{#if e && m}
  <div class="ph" role="group" aria-label="Плагин «{m.name}»">
    <span class="ib"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={iconOf(m) ?? PLUG} /></svg></span>
    <div class="tx">
      <div class="nm">{m.name}</div>
      <div class="sub">{[m.version, e.builtin ? 'встроенный' : sourceLabel(e.source)].filter(Boolean).join(' · ')}</div>
    </div>
    <Toggle checked={e.enabled} label="Плагин {m.name} включён" disabled={!e.enabled && e.problems.length > 0} onchange={() => void plugins.setEnabled(id, !e.enabled)} />
  </div>
{/if}

<style>
  .ph { display: flex; align-items: center; gap: 12px; margin: 0 4px 18px; }
  .ib { flex: 0 0 30px; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--plug) 14%, transparent); color: var(--plug); }
  .tx { flex: 1; min-width: 0; }
  .nm { font-size: 13.5px; font-weight: 600; }
  .sub { font-size: 12px; color: var(--ink3); }
</style>
