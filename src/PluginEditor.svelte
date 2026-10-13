<script lang="ts">
  import NarrowEditor from './NarrowEditor.svelte';
  import { store } from './store.svelte';
  import { newTab } from './layout';
  import { headingAt } from './org';

  // A heading with its subtree in an editor a plugin puts in its element (`ui.editor`, ТЗ 33: the card of the board
  // opened at the side). Narrowed as the review's card; edits go to the file at once. It follows the heading: found by
  // its title near its line, by its line while edited here.
  let { path, line, title, onref }: { path: string; line: number; title: string; onref?: (r: { path: string; line: number; title: string }) => void } = $props();
  const file = $derived(store.files.find((f) => f.name === path));
  // svelte-ignore state_referenced_locally
  let at = $state({ line, title });
  const h = $derived.by(() => {
    const hs = file?.headings ?? [];
    return hs.find((x) => x.line === at.line && x.title === at.title) ?? hs.filter((x) => x.title === at.title).sort((a, b) => Math.abs(a.line - at.line) - Math.abs(b.line - at.line))[0];
  });
  // svelte-ignore state_referenced_locally
  const tab = newTab('file', file?.path ?? path, line); // where its caret is kept
  $effect(() => {
    if (h) onref?.({ path, line: h.line, title: h.title });
  });
  function moved(l: number, _last: number, typed: boolean) {
    // typed here: the root is where the editor shows it (its title may be changing); else found by its title again
    if (!typed || !file) return;
    const i = headingAt(file.headings, l);
    if (i >= 0) at = { line: file.headings[i].line, title: file.headings[i].title };
  }
</script>

{#if file && h}
  <NarrowEditor {file} line={h.line} end={h.end} {tab} fileKey={'peek|' + path + '|' + line} gutter={false} onnarrow={moved} />
{:else}
  <div class="gone" role="status">Заголовок не найден</div>
{/if}

<style>
  .gone { padding: 16px; color: var(--fg2); font-size: 13px; }
</style>
