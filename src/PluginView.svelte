<script lang="ts">
  import { untrack } from 'svelte';
  import { plugins } from './api/host.svelte';
  import { store } from './store.svelte';
  import type { Tab } from './layout';

  // A plugin's tab (ТЗ 26 §5.2): an element the plugin draws in with its `render`; drawn again only when the tab is
  // given a new state from outside (`ui.open`), not when the plugin sets its own.
  let { tab }: { tab: Tab; pane: number } = $props();
  let el = $state<HTMLElement>();
  const v = $derived(plugins.views.get(tab.kind));
  const pid = $derived(v?.plugin ?? '');
  const off = $derived(pid ? plugins.failed.get(pid) : undefined);
  const n = $derived(plugins.redraw.get(tab.id) ?? 0);

  $effect(() => {
    void n;
    const node = el;
    const entry = v;
    if (!node || !entry || off) return;
    const t = tab;
    const handle = { id: t.id, setState: (s: unknown) => void (t.data = JSON.parse(JSON.stringify(s ?? null))) };
    const data = untrack(() => t.data); // its own `setState` does not draw it again
    const dispose = plugins.guard(entry.plugin, () => entry.spec.render(node, data, handle), undefined);
    return () => {
      plugins.guard(entry.plugin, () => dispose?.(), undefined);
      node.replaceChildren();
    };
  });
</script>

{#if off}
  <div class="off" role="status"><b>Плагин «{plugins.name(pid)}» выключен</b><span>{off}</span><span>Вкладка вернётся после перезапуска.</span></div>
{:else if !v}
  <div class="off" role="status"><span>{store.loaded ? 'Загрузка плагина…' : ''}</span></div>
{:else}
  <div class="pview" bind:this={el}></div>
{/if}

<style>
  .pview { flex: 1; min-height: 0; overflow: auto; }
  .off { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--fg2); font-size: 13px; }
  .off b { color: var(--fg); }
</style>
