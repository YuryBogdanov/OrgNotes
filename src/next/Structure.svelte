<script lang="ts">
  import { store } from '../store.svelte';
  import { headingAt, toneFor } from '../org';
  import { toneStyle } from '../colors';
  import { backlinks } from '../links';

  // The column «Структура» right of the editor (ТЗ 42 §7): the headings of levels 1–3 on a line, each with a dot of its
  // status's colour (none: grey; done: faded); the one the caret is under — the lamp's dot with a halo, its title bold;
  // a click goes to it; the current one kept in view. «Ссылаются»: the links to the heading under the caret, up to 6.
  // A narrowed tab (§5.8): only the subtree it shows.
  let { range = null }: { range?: { line: number; end: number } | null } = $props();
  const file = $derived(store.fileOf(store.tab));
  const fi = $derived(file ? store.files.indexOf(file) : -1);
  const line = $derived(store.tab?.cursor.line ?? 0);
  const heads = $derived(file ? file.headings.map((h, i) => ({ h, i })).filter((x) => x.h.level <= 3 && (!range || (x.h.line >= range.line && x.h.line < range.end))) : []);
  /** The heading of levels 1–3 the caret is under. */
  const current = $derived.by(() => {
    if (!file) return -1;
    let k = headingAt(file.headings, line);
    while (k >= 0 && file.headings[k].level > 3) k = file.headings[k].parent;
    return k;
  });
  /** The deepest heading under the caret: whose links «Ссылаются» shows. */
  const deepest = $derived(file ? headingAt(file.headings, line) : -1);
  const back = $derived(file && deepest >= 0 ? backlinks(store.files, fi, file.headings[deepest].line) : []);
  let showAll = $state(false);
  $effect(() => {
    void deepest;
    showAll = false;
  });
  const shownBack = $derived(showAll ? back : back.slice(0, 6));
  const dot = (kw: string | null) => (file && kw ? toneStyle(toneFor(kw, file.wf)) : '');
  const isDone = (kw: string | null) => !!kw && !!file?.wf.done.includes(kw);
  const plain = (t: string) => t.replace(/\[\[(?:[^\]]*\]\[)?([^\]]*)\]\]/g, '$1');
  const nameOf = (i: number) => store.files[i]?.name.replace(/\.org$/, '').split('/').pop() ?? '';

  let list: HTMLDivElement | undefined = $state();
  $effect(() => {
    void current;
    queueMicrotask(() => list?.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'nearest' }));
  });
</script>

<aside class="struct" aria-label="Структура">
  <div class="lbl">Структура</div>
  <div class="list" bind:this={list}>
    {#each heads as { h, i } (i)}
      <button class="row lv{h.level}" class:on={i === current} class:done={isDone(h.keyword)} aria-current={i === current ? 'true' : undefined}
        title={plain(h.title)} onclick={() => store.open(fi, h.line)}>
        <span class="dot" class:kw={!!h.keyword} style={dot(h.keyword)}></span>
        <span class="t">{plain(h.title)}</span>
      </button>
    {:else}
      <p class="none">Заголовков нет</p>
    {/each}
  </div>
  {#if back.length}
    <div class="back">
      <div class="lbl">Ссылаются</div>
      {#each shownBack as b (b.file + ':' + b.line)}
        <button class="bl" title="{store.files[b.file]?.name} · строка {b.line + 1}" onclick={() => store.open(b.file, b.line)}>↳ {nameOf(b.file)}{b.heading ? ` · ${plain(b.heading)}` : ''}</button>
      {/each}
      {#if back.length > 6 && !showAll}<button class="more" onclick={() => (showAll = true)}>ещё {back.length - 6}</button>{/if}
    </div>
  {/if}
</aside>

<style>
  .struct { flex: 0 0 220px; width: 220px; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box; padding: 46px 22px 16px 0; overflow: hidden; }
  .lbl { padding-left: 22px; margin-bottom: 12px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  .list { position: relative; min-height: 0; overflow: auto; padding-left: 22px; }
  .list::before { content: ''; position: absolute; left: 5px; top: 6px; bottom: 6px; width: 1px; background: var(--rule); }
  .row { position: relative; width: 100%; height: 26px; display: flex; align-items: center; padding: 0; border: 0; background: none; color: var(--ink2); font: 12.5px var(--ui); text-align: left; white-space: nowrap; cursor: default; }
  .row:hover .t { color: var(--ink); }
  .row.lv2, .row.lv3 { padding-left: 12px; }
  .row.lv3 { padding-left: 24px; }
  .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .dot { position: absolute; left: -20px; width: 7px; height: 7px; border-radius: 4px; background: var(--ink3); }
  .dot.kw { background: var(--tl); }
  .row.done .dot { opacity: 0.55; }
  .row.on { color: var(--ink); font-weight: 600; }
  .row.on .dot { left: -21px; width: 9px; height: 9px; border-radius: 5px; background: var(--lamp); opacity: 1; box-shadow: 0 0 0 4px var(--lampsoft); }
  .row:focus-visible, .bl:focus-visible, .more:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
  .none { margin: 0; color: var(--ink3); font-size: 12px; }
  .back { margin: 30px 0 0 22px; padding-top: 14px; border-top: 1px solid var(--rule); }
  .back .lbl { padding-left: 0; margin-bottom: 10px; }
  .bl, .more { display: block; width: 100%; padding: 3px 0; border: 0; background: none; color: var(--ink2); font: 12px var(--ui); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bl:hover { color: var(--ink); text-decoration: underline; }
  .more { color: var(--ink3); }
</style>
