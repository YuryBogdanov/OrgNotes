<script lang="ts">
  import { plugins } from './api/host.svelte';

  // A plugin's section of the navigator (ТЗ 26 §5.2): an element it draws in.
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

<div class="pnav" bind:this={el} role="region" aria-label={id}></div>

<style>
  .pnav { flex: 1; min-height: 0; overflow: auto; }
</style>
