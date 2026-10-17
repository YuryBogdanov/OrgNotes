<script lang="ts">
  import { plugins } from '../api/host.svelte';
  import Compat from './Compat.svelte';

  // A plugin's section in the new sidebar (ТЗ 43 §3): the element it draws in (`navSection.render`), in the
  // compatibility layer — the plugin draws in the new colours with nothing changed in it; its width is the sidebar's
  // less the fields, it learns it as before (by the element's size). It failing: as in the old navigator, the plugin
  // is turned off (`plugins.guard`); the sidebar says so in the panel's place.
  let { id }: { id: string } = $props();
  let el = $state<HTMLElement>();
  const nav = $derived(plugins.navs.get(id));

  $effect(() => {
    const node = el;
    const entry = nav;
    if (!node || !entry) return;
    const dispose = plugins.guard(entry.plugin, () => entry.render(node, undefined, { id, setState: () => {} }), undefined);
    return () => {
      plugins.guard(entry.plugin, () => dispose?.(), undefined);
      node.replaceChildren();
    };
  });
</script>

<Compat><div class="pnav" bind:this={el} role="region" aria-label={id}></div></Compat>

<style>
  .pnav { flex: 1; min-height: 0; overflow: auto; }
</style>
