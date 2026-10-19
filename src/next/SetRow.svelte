<script lang="ts">
  import type { Snippet } from 'svelte';

  // A row of a settings' group (ТЗ 54 §2): from 46 pt, 8/16 inside, a `rule` between rows; the name 13.5 pt and its
  // hint 12 pt `ink3` on the left, the control on the right — or, `wide`, under them across the row. `changed`: a dot
  // 6 pt `lamp` before the name (the value is not the default). `id`: the name's, for the control's label.
  let { label, hint, id, changed = false, wide = false, disabled = false, dataId, onclick, children, sub }: {
    label: string; hint?: string; id?: string; changed?: boolean; wide?: boolean; disabled?: boolean; dataId?: string; onclick?: () => void; children?: Snippet; sub?: Snippet;
  } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="row" class:wide class:off={disabled} class:link={!!onclick} data-id={dataId} {onclick}>
  <div class="tx">
    <div class="nm" {id}>{#if changed}<i class="dot" title="Изменено" aria-label="изменено"></i>{/if}{label}</div>
    {#if hint}<div class="hint">{hint}</div>{/if}
    {#if sub}{@render sub()}{/if}
  </div>
  {#if children}<div class="ctl">{@render children()}</div>{/if}
</div>

<style>
  .row { display: flex; align-items: center; gap: 16px; min-height: 46px; box-sizing: border-box; padding: 8px 16px; }
  .row + :global(.row) { border-top: 1px solid var(--rule); }
  .row.wide { flex-direction: column; align-items: stretch; gap: 8px; padding-block: 10px 12px; }
  .row.off { opacity: 0.5; }
  .row.link { cursor: default; }
  .row.link:hover { background: var(--chip); }
  .tx { flex: 1; min-width: 0; }
  .nm { position: relative; font-size: 13.5px; color: var(--ink); }
  .dot { position: absolute; left: -11px; top: 7px; width: 6px; height: 6px; border-radius: 3px; background: var(--lamp); }
  .hint { margin-top: 2px; font-size: 12px; color: var(--ink3); }
  .ctl { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; min-width: 0; }
  .wide .ctl { flex: 1 1 auto; display: flex; flex-direction: column; align-items: stretch; }
</style>
