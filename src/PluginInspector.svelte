<script lang="ts">
  import { plugins } from './api/host.svelte';
  import { store } from './store.svelte';

  // A plugin's view's inspector (ТЗ 29 §1): an element the plugin draws in with `ViewSpec.inspector`, for the active
  // tab; drawn again when another tab of the kind becomes active or the tab is given a new state from outside.
  const tab = $derived(store.tab);
  const v = $derived(tab ? plugins.views.get(tab.kind) : undefined);
  const n = $derived(tab ? (plugins.redraw.get(tab.id) ?? 0) : 0);
  let el = $state<HTMLElement>();

  $effect(() => {
    void n;
    const node = el;
    const entry = v;
    const t = tab;
    if (!node || !entry?.spec.inspector || !t || plugins.failed.has(entry.plugin)) return;
    const handle = { id: t.id, setState: (s: unknown) => void (t.data = JSON.parse(JSON.stringify(s ?? null))) };
    const dispose = plugins.guard(entry.plugin, () => entry.spec.inspector!(node, t.data, handle), undefined);
    return () => {
      plugins.guard(entry.plugin, () => dispose?.(), undefined);
      node.replaceChildren();
    };
  });
</script>

<div class="pinsp" bind:this={el}></div>

<style>
  .pinsp { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
</style>
