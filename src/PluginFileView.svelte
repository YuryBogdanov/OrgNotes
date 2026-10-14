<script lang="ts">
  import { untrack } from 'svelte';
  import { plugins } from './api/host.svelte';
  import { store } from './store.svelte';
  import type { Tab } from './layout';

  // A file shown as a plugin's view («Доска», ТЗ 33): an element the plugin draws the file in; drawn again for another
  // file. «Текст» brings the editor back.
  let { id, path, tab }: { id: string; path: string; tab: Tab; pane: number } = $props();
  let el = $state<HTMLElement>();
  const v = $derived(plugins.fileViews.get(id));
  const off = $derived(v ? plugins.failed.get(v.plugin) : undefined);
  const tabId = $derived(tab.id);

  $effect(() => {
    const node = el;
    const entry = v;
    const p = path;
    void tabId; // the tab, not its object: the layout may give the same tab anew
    if (!node || !entry || off) return;
    // «Текст»: a tab on one heading (ТЗ 39) becomes the file's text at that heading
    const ctl = {
      showText: () => {
        const t = untrack(() => tab);
        if (t.scope) {
          t.reveal = { line: t.scope.line, n: Date.now(), focus: true };
          t.scope = undefined;
        }
        store.showAs(t, '');
      },
      // the branch's heading moved or was renamed: the tab's name and «Текст» follow it
      setHeading: (h: { line: number; title: string }) => {
        const t = untrack(() => tab);
        if (t.scope && h) t.scope = { line: Number(h.line), title: String(h.title) };
      },
    };
    const scope = untrack(() => tab.scope);
    const file = { path: p, ...(scope ? { heading: { path: p, line: scope.line, title: scope.title } } : {}) };
    // what the plugin reads while drawing is its own: not a reason to draw it again
    const dispose = untrack(() => plugins.guard(entry.plugin, () => entry.spec.render(node, file, ctl), undefined));
    return () => {
      plugins.guard(entry.plugin, () => dispose?.(), undefined);
      node.replaceChildren();
    };
  });
</script>

{#if !v}
  <div class="off" role="status"><span>{store.loaded ? 'Загрузка плагина…' : ''}</span></div>
{:else}
  <div class="pfview" bind:this={el} data-file-view={id}></div>
{/if}

<style>
  .pfview { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .off { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--fg2); font-size: 13px; }
</style>
