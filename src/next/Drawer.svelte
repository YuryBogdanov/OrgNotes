<script lang="ts">
  import { plugins } from '../api/host.svelte';
  import { lsGet, lsSet } from '../storage';
  import Compat from './Compat.svelte';

  // The panel under the tabs (ТЗ 55 §1–2, `ui.drawer`): a plugin's (the terminal's), across the tabs' width, the
  // editor above it shrinks. Each is drawn once, when first shown, and kept hidden afterwards (its processes and
  // terminals live on); 330 by default, its top edge dragged from 160 to 70 % of the area, kept on this Mac.
  let { area }: { area: HTMLElement | undefined } = $props();
  let height = $state(Number(lsGet('next:drawerH')) || 330);
  const drawn = $state<Record<string, true>>({});
  $effect(() => {
    const k = plugins.drawerShown;
    if (k) drawn[k] = true;
  });
  const clamp = (h: number) => Math.round(Math.max(160, Math.min((area?.clientHeight ?? 800) * 0.7, h)));
  function drag(e: PointerEvent) {
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = height;
    const move = (ev: PointerEvent) => (height = clamp(h0 + y0 - ev.clientY));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      lsSet('next:drawerH', String(height));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  /** The plugin draws its panel; what it gives back is called when the panel goes. */
  const draw = (k: string) => (el: HTMLElement) => {
    const d = plugins.drawers.get(k);
    if (!d) return;
    const done = plugins.guard(d.plugin, () => d.render(el), undefined);
    return () => {
      plugins.guard(d.plugin, () => done?.(), undefined);
      el.replaceChildren();
    };
  };
  const open = $derived(!!plugins.drawerShown && plugins.drawers.has(plugins.drawerShown));
</script>

<!-- always there: hidden, it has no height (its panels drawn so far live on inside) -->
<div class="drawer" class:open style:height={open ? `${clamp(height)}px` : '0px'} role="region" aria-label={open ? plugins.drawers.get(plugins.drawerShown!)?.title : undefined} aria-hidden={!open} inert={!open}>
  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="edge" title="Потяните, чтобы изменить высоту" onpointerdown={drag}></div>
  {/if}
  {#each Object.keys(drawn) as k (k)}
    {#if plugins.drawers.has(k)}
      <div class="pane" class:on={plugins.drawerShown === k} data-drawer={k}><Compat><div class="body" {@attach draw(k)}></div></Compat></div>
    {/if}
  {/each}
</div>

<style>
  /* the editor above shrinks; it comes in 180 ms, as the column on the right (ТЗ 46) */
  .drawer { position: relative; flex: 0 0 auto; overflow: hidden; background: var(--bg); transition: height 180ms cubic-bezier(0.33, 1, 0.68, 1); }
  .drawer.open { border-top: 1px solid var(--rule); }
  @media (prefers-reduced-motion: reduce) { .drawer { transition: none; } }
  .edge { position: absolute; left: 0; right: 0; top: 0; height: 5px; cursor: ns-resize; z-index: 2; }
  .pane { position: absolute; inset: 0; display: none; }
  .pane.on { display: flex; flex-direction: column; }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
</style>
