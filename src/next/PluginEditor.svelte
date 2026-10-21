<script lang="ts">
  import { RICH_ENABLED } from '../nextFlags';
  import { store } from '../store.svelte';
  import { headingAt } from '../org';
  import Editor from './Editor.svelte';

  // `ui.editor` in the new interface (ТЗ 49 §7): a heading with its subtree in the new editor, narrowed — «Оформление»
  // (Cormorant, the chips of SCHEDULED / DEADLINE and the properties, the boxes), the file's own font; the edits go to
  // the file at once. It follows the heading as the old one (PluginEditor): by its title near its line, by its line
  // while edited here. The API is the same (`focus`, `dispose`, `onRef`).
  // `source` (API 1.18): «Исходник» — the file as it is, IBM Plex Mono, with its line numbers (the board's card)
  // `end` (API 1.19, `caret: 'end'`): the focus taken, the caret at the end of the subtree, once
  let { path, line, title, source = false, end = false, onref }: { path: string; line: number; title: string; source?: boolean; end?: boolean; onref?: (r: { path: string; line: number; title: string }) => void } = $props();
  const file = $derived(store.files.find((f) => f.name === path));
  // svelte-ignore state_referenced_locally
  let at = $state({ line, title });
  const h = $derived.by(() => {
    const hs = file?.headings ?? [];
    return hs.find((x) => x.line === at.line && x.title === at.title) ?? hs.filter((x) => x.title === at.title).sort((a, b) => Math.abs(a.line - at.line) - Math.abs(b.line - at.line))[0];
  });
  $effect(() => {
    if (h) onref?.({ path, line: h.line, title: h.title });
  });
  // svelte-ignore state_referenced_locally
  const toEnd = end;
  // asked once, when the heading is first there: the caret is not taken back while typing
  let reveal = $state<{ line: number; n: number; focus: boolean; col: number } | null>(null);
  $effect(() => {
    if (!toEnd || reveal || !h || !file) return;
    const lines = file.text.split('\n');
    let l = h.end - 1;
    while (l > h.line && !lines[l]?.trim() && !lines[l - 1]?.trim()) l--; // the last line of text, or one blank under it
    reveal = { line: l, n: 1, focus: true, col: (lines[l] ?? '').length };
  });
  function moved(l: number, _last: number, typed: boolean) {
    if (!typed || !file) return;
    const i = headingAt(file.headings, l);
    if (i >= 0) at = { line: file.headings[i].line, title: file.headings[i].title };
  }
</script>

{#if file && h}
  <div class="ped">
    <Editor text={file.text} fileKey={'peek|' + path + '|' + line} path={file.name} wf={file.wf} {reveal} narrow={{ line: h.line, end: h.end }} onnarrow={moved}
      levels={store.levels} drawers={store.foldDrawers} rich={RICH_ENABLED && !source} richNumbers={store.richNumbers}
      onchange={(t) => store.setText(t, file.path)} oncursor={() => {}} onfollow={(l) => store.follow(l)} />
  </div>
{:else}
  <div class="gone" role="status">Заголовок не найден</div>
{/if}

<style>
  .ped { height: 100%; min-height: 0; display: flex; flex-direction: column; }
  .ped :global(.cm-editor) { height: 100%; }
  .gone { padding: 16px; color: var(--ink3); font-size: 13px; }
</style>
