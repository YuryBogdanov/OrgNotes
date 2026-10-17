<script lang="ts">
  import { store } from '../store.svelte';
  import { headingAt, toneFor } from '../org';
  import { toneStyle } from '../colors';
  import { backlinks } from '../links';
  import type { Snippet } from 'svelte';
  import { nextPrefs } from '../nextPrefs.svelte';

  // The column «Структура» right of the editor (ТЗ 42 §7): the headings of levels 1–3 on a line, each with a dot of its
  // status's colour (none: grey; done: faded); the one the caret is under — the lamp's dot with a halo, its title bold;
  // a click goes to it; the current one kept in view. «Связи» (ТЗ 44 §10): the links to the heading under the caret,
  // up to 6, their number by the title. Each folds on a click on its head (⌄ / ›), kept on this Mac for every file;
  // «Связи» folded is its head with the number.
  // A narrowed tab (§5.8): only the subtree it shows.
  // `cards`: the plugins' cards over it (ТЗ 44 §6), the column then `width` wide
  let { range = null, width = 220, cards }: { range?: { line: number; end: number } | null; width?: number; cards?: Snippet } = $props();
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
  /** The deepest heading under the caret: whose links «Связи» shows. */
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
  // §7.1: no bar; a list longer than the room fades out at the edge it goes on past
  let fadeTop = $state(false);
  let fadeBot = $state(false);
  const edges = () => {
    if (!list) return;
    fadeTop = list.scrollTop > 1;
    fadeBot = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
  };
  $effect(() => {
    void current;
    void heads;
    queueMicrotask(() => {
      list?.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'nearest' });
      edges();
    });
  });
  $effect(() => {
    if (!list) return;
    const ro = new ResizeObserver(edges);
    ro.observe(list);
    return () => ro.disconnect();
  });
</script>

<aside class="struct" aria-label="Структура" style:width="{width}px">
  {#if cards}<div class="cards">{@render cards()}</div>{/if}
  <button class="lbl head" aria-expanded={!nextPrefs.structFolded} onclick={() => nextPrefs.toggleStructFolded()}>Структура<span class="chev" aria-hidden="true">{nextPrefs.structFolded ? '›' : '⌄'}</span></button>
  {#if !nextPrefs.structFolded}
  <div class="list" class:ft={fadeTop} class:fb={fadeBot} bind:this={list} onscroll={edges}>
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
  {/if}
  {#if back.length}
    <div class="back" class:tight={nextPrefs.structFolded} role="region" aria-label="Связи">
      <button class="lbl head" aria-expanded={!nextPrefs.linksFolded} onclick={() => nextPrefs.toggleLinksFolded()}>Связи<span class="n">{back.length}</span><span class="chev" aria-hidden="true">{nextPrefs.linksFolded ? '›' : '⌄'}</span></button>
      {#if !nextPrefs.linksFolded}
      {#each shownBack as b (b.file + ':' + b.line)}
        <button class="bl" title="{store.files[b.file]?.name} · строка {b.line + 1}" onclick={() => store.open(b.file, b.line)}>↳ {nameOf(b.file)}{b.heading ? ` · ${plain(b.heading)}` : ''}</button>
      {/each}
      {#if back.length > 6 && !showAll}<button class="more" onclick={() => (showAll = true)}>ещё {back.length - 6}</button>{/if}
      {/if}
    </div>
  {/if}
</aside>

<style>
  /* §7.1: over the right part of the editor's scroller (EditorArea), no ground, no line between; the editor's bar at
     the window's edge, under the right padding. Only the column's content takes the pointer: a wheel over the air
     scrolls the text. */
  .struct { position: absolute; top: 0; right: 0; bottom: 0; z-index: 2; width: 220px; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box; padding: 46px 22px 16px 0; overflow: hidden; pointer-events: none; }
  .struct > * { pointer-events: auto; }
  /* the cards as the mockup has them: 4 pt off the editor, 18 off the window's edge (the column's own 22 less 4) */
  .cards { flex: 0 1 auto; min-height: 0; overflow: auto; margin: 0 -4px 8px 4px; scrollbar-width: none; }
  .cards::-webkit-scrollbar { display: none; }
  .lbl { padding-left: 22px; margin-bottom: 12px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  /* a head that folds its part (§10): the whole row, the chevron at the right */
  .head { display: flex; align-items: center; gap: 6px; width: 100%; padding-top: 0; padding-bottom: 0; padding-right: 2px; border: 0; background: none; text-align: left; font-family: var(--ui); cursor: default; }
  .head:focus-visible { outline: 2px solid var(--lamp); outline-offset: 2px; border-radius: 4px; }
  .head .n { font-weight: 400; font-size: 11px; color: var(--ink3); }
  .head .chev { margin-left: auto; font-size: 10px; }
  .list { position: relative; min-height: 0; overflow: auto; padding-left: 22px; scrollbar-width: none; }
  .list::-webkit-scrollbar { display: none; }
  .list.ft { -webkit-mask-image: linear-gradient(transparent, #000 24px); mask-image: linear-gradient(transparent, #000 24px); }
  .list.fb { -webkit-mask-image: linear-gradient(#000 calc(100% - 24px), transparent); mask-image: linear-gradient(#000 calc(100% - 24px), transparent); }
  .list.ft.fb { -webkit-mask-image: linear-gradient(transparent, #000 24px, #000 calc(100% - 24px), transparent); mask-image: linear-gradient(transparent, #000 24px, #000 calc(100% - 24px), transparent); }
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
  .back.tight { margin-top: 2px; } /* under the folded «Структура»: no list to keep off */
  .bl, .more { display: block; width: 100%; padding: 3px 0; border: 0; background: none; color: var(--ink2); font: 12px var(--ui); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bl:hover { color: var(--ink); text-decoration: underline; }
  .more { color: var(--ink3); }
</style>
