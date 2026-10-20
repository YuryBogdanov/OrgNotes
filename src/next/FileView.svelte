<script lang="ts">
  import { untrack } from 'svelte';
  import { plugins } from '../api/host.svelte';
  import { store } from '../store.svelte';
  import { fileTypeOf } from '../fileTypes.svelte';
  import { tokenVars } from './tokens';
  import { compatVars } from './compat';
  import type { Tab } from '../layout';
  import Button from './ui/Button.svelte';

  // A file shown as a plugin's view in the new interface (ТЗ 49 §1; «Доска», «Mindmap», a `.canvas`): the element the
  // plugin draws in — the compatibility layer's variables on it and `data-ui="next"` (an old plugin draws in the new
  // colours), `bg` with the grid of 24 pt under it; drawn again for another file. The plugin still loading — after
  // 300 ms «Загрузка плагина…»; stopped by an error — the word and «Показать текст» (not for a file of its own type),
  // «Настройки плагинов». `showText()` and `setHeading()` as the old host's (PluginFileView).
  let { id, path, tab }: { id: string; path: string; tab: Tab; pane?: number } = $props();
  let el = $state<HTMLElement>();
  const v = $derived(plugins.fileViews.get(id));
  // whose view it is: the one drawing it, else the manifest that declares it (a failed plugin's is taken away)
  const owner = $derived(v?.plugin ?? plugins.entries.find((e) => e.manifest?.contributes.fileViews.some((f) => f.id === id))?.manifest?.id);
  const off = $derived(owner ? plugins.failed.get(owner) : undefined);
  const tabId = $derived(tab.id);
  // the props come as getters of the parent's file (a new object at each edit): a derived stops the redraw when the
  // value is the same, else the view would be drawn anew at every key typed in it (the board's card at the side)
  const thePath = $derived(path);
  const vars = $derived(`${tokenVars(store.theme.app)};${compatVars(store.theme.app)}`);
  const ownType = $derived(!!fileTypeOf(path));

  function showText() {
    const t = untrack(() => tab);
    if (t.scope) {
      t.reveal = { line: t.scope.line, n: Date.now(), focus: true };
      t.scope = undefined;
    }
    store.showAs(t, '');
  }
  $effect(() => {
    const node = el;
    const entry = v;
    const p = thePath;
    void tabId; // the tab, not its object: the layout may give the same tab anew
    if (!node || !entry || off) return;
    const ctl = {
      showText,
      // the branch's heading moved or was renamed: the tab's name and the text follow it
      setHeading: (h: { line: number; title: string }) => {
        const t = untrack(() => tab);
        if (t.scope && h) t.scope = { line: Number(h.line), title: String(h.title) };
      },
    };
    const scope = untrack(() => tab.scope);
    const file = { path: p, ...(scope ? { heading: { path: p, line: scope.line, title: scope.title } } : {}) };
    const dispose = untrack(() => plugins.guard(entry.plugin, () => entry.spec.render(node, file, ctl), undefined));
    return () => {
      plugins.guard(entry.plugin, () => dispose?.(), undefined);
      node.replaceChildren();
    };
  });
  // «Загрузка плагина…» only when it takes longer than 300 ms
  let slow = $state(false);
  $effect(() => {
    void v;
    slow = false;
    if (v) return;
    const t = setTimeout(() => (slow = true), 300);
    return () => clearTimeout(t);
  });
</script>

<div class="fview grid">
  {#if off}
    <div class="word" role="alert">
      <b>Плагин «{plugins.name(owner!)}» остановлен из-за ошибки</b>
      <div class="btns">
        {#if !ownType}<Button onclick={showText}>Показать текст</Button>{/if}
        <Button onclick={() => store.openSettings('Плагины')}>Настройки плагинов</Button>
      </div>
    </div>
  {:else if !v}
    <div class="word" role="status">{#if slow}<span>Загрузка плагина…</span>{/if}</div>
  {:else}
    <div class="host" data-ui="next" data-file-view={id} style={vars} bind:this={el}></div>
  {/if}
</div>

<style>
  .fview { flex: 1; min-height: 0; display: flex; flex-direction: column; background-color: var(--bg); }
  .grid {
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
    background-size: 24px 24px; background-position: -1px -1px;
  }
  .host { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--ink); font-family: var(--ui); }
  .word { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--ink3); font-size: 13px; }
  .word b { font-size: 14px; font-weight: 500; color: var(--ink); }
  .btns { display: flex; gap: 8px; }
</style>
