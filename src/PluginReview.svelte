<script lang="ts">
  import { untrack } from 'svelte';
  import CardReview from './CardReview.svelte';
  import NarrowEditor from './NarrowEditor.svelte';
  import { plugins, REVIEW_KIND } from './api/host.svelte';
  import { reviewScope } from './api/declare';
  import { store } from './store.svelte';
  import type { Tab } from './layout';
  import type { CardRender, ReviewAction, ReviewCard } from './api/index';
  import { sumsOf } from './reviewSums';

  // A plugin's review (ТЗ 26 §5.2, `ui.review`): the core's review by cards — one heading at a time, narrowed, the
  // plugin's actions in the bar and on their keys (its commands in «"scope": "review"»), «Назад», the summary. ТЗ 27
  // §2.3: the plugin may draw the card's header, its quick buttons, a panel right of the editor and the summary, and
  // fold lines of the editor — a review of its own on the core's frame (the goals' 1-1).
  let { tab }: { tab: Tab; pane: number } = $props();

  const r = $derived(plugins.review);
  const c = $derived(plugins.reviewHeading());
  const total = $derived(r?.refs.length ?? 0);
  const kbd = (cmd?: string) => (cmd ? store.keyHint(cmd) : '');
  const header = $derived(r && c && r.spec.header ? plugins.guard(r.plugin, () => r.spec.header!(c.info), '') : '');
  // the word after an action's label for this card (`subOf`, 1.14), else its `sub`
  const subOf = (a: ReviewAction) => (r && c && a.subOf ? plugins.guard(r.plugin, () => a.subOf!(c.info), null) : null) ?? a.sub ?? '';
  // the summary's figures when the plugin keeps the outcomes (`mark`, 1.14) and draws no summary of its own
  const sums = $derived.by(() => {
    void plugins.reviewRedraw;
    if (!r || r.cur >= 0 || r.spec.summary) return [];
    return sumsOf(r.refs.map((_, i) => plugins.reviewMark(i)), Array.isArray(r.spec.endOrder) ? r.spec.endOrder : undefined);
  });
  const endNote = $derived(r && r.cur < 0 && !r.spec.summary && r.spec.endNote ? String(plugins.guard(r.plugin, () => r.spec.endNote!(), '') ?? '') : '');
  const narrow = $derived(r && c && r.spec.narrow ? plugins.guard(r.plugin, () => r.spec.narrow!(c.info), {}) : {});
  const off = (dis: ((h: never) => boolean) | undefined) => {
    void plugins.reviewBar;
    void plugins.reviewRedraw;
    return !!(r && c && dis && plugins.guard(r.plugin, () => dis(c.info as never), false));
  };
  const keys = {
    active: () => store.tab?.kind === REVIEW_KIND && !store.sheetOpen,
    run: (id: string) => {
      if (id && id === plugins.review?.spec.backCommand) {
        if (plugins.review.cur !== 0) void plugins.reviewStep(-1);
        return true;
      }
      const a = plugins.review?.spec.actions.find((x) => x.command === id);
      if (!a || !plugins.reviewHeading()) return false;
      void plugins.reviewAct(a.id);
      return true;
    },
  };
  // What the card's parts show: they are drawn again only when it changes — not when the file is merely parsed anew
  // (an autosave read back from the disk would take the focus from a note being typed in the panel)
  const cardSig = $derived.by(() => {
    const run = plugins.review;
    const cur = plugins.reviewHeading();
    return run && cur ? JSON.stringify([plugins.reviewRedraw, run.cur, run.gen, cur.info]) : '';
  });
  /** A card's part of the plugin: drawn for each card, and again when an action stays or the plugin asks. */
  function part(node: HTMLElement, which: () => CardRender | undefined) {
    let done: (() => void) | void;
    const clean = $effect.root(() => {
      $effect(() => {
        void cardSig;
        const render = which();
        const run = untrack(() => plugins.review);
        const cur = untrack(() => plugins.reviewHeading());
        if (!run || !cur || !render) return;
        const card: ReviewCard = { heading: cur.info, index: run.cur, total: run.refs.length };
        done = plugins.guard(run.plugin, () => render(node, card), undefined);
        return () => {
          if (done) plugins.guard(run.plugin, () => done!(), undefined);
          done = undefined;
          node.replaceChildren();
        };
      });
    });
    return { destroy: clean };
  }

  // something of the plugin under the card: drawn again for each card
  let belowEl = $state<HTMLElement>();
  // drawn again only when the card changes (not when an action stays on it: a calendar opened under it stays open)
  const belowKey = $derived(c ? `${plugins.review?.cur}|${plugins.review?.gen}|${c.info.ref.path}|${c.info.ref.line}` : '');
  $effect(() => {
    const node = belowEl;
    void belowKey;
    const run = plugins.review;
    const ref = untrack(() => c?.info.ref);
    if (!node || !run?.spec.below || !ref) return;
    const d = plugins.guard(run.plugin, () => run.spec.below!(node, ref, { id: tab.id, setState: () => {} }), undefined);
    return () => {
      plugins.guard(run.plugin, () => d?.(), undefined);
      node.replaceChildren();
    };
  });

  // the plugin's summary
  let sumEl = $state<HTMLElement>();
  $effect(() => {
    const node = sumEl;
    const run = plugins.review;
    if (!node || !run?.spec.summary || run.cur >= 0) return;
    const d = plugins.guard(run.plugin, () => run.spec.summary!(node, { total: run.refs.length, done: run.done, finished: true, end: () => plugins.endReview(true) }), undefined);
    return () => {
      plugins.guard(run.plugin, () => d?.(), undefined);
      node.replaceChildren();
    };
  });
</script>

<CardReview cls={'preview' + (r?.spec.cls ? ' ' + r.spec.cls : '')} scope={reviewScope(r?.plugin ?? '')} {keys} width={r?.spec.width ?? 820}
  state={r && r.cur >= 0 && c ? 'card' : r && r.cur < 0 ? 'summary' : 'empty'}
  cardKey={r && c ? r.cur + '|' + r.gen + '|' + c.info.ref.path : ''}
  back={r ? { disabled: r.cur === 0, run: () => void plugins.reviewStep(-1), key: r.spec.backCommand ?? '' } : null}>
  {#snippet head()}
    {#if r && c}
      {#if r.spec.head}
        <div class="ph" use:part={() => r.spec.head}></div>
      {:else}
        <b>{r.spec.title} · {r.cur + 1} из {total}</b>
        <span class="file">{c.file.name.split('/').pop()}</span>
        {#if header}<span class="hd">{header}</span>{/if}
      {/if}
    {/if}
  {/snippet}
  {#snippet quick()}
    {#if r?.spec.quick && c}<div class="pq" use:part={() => r.spec.quick}></div>{/if}
  {/snippet}
  {#snippet body()}
    {#if r && c}
      <div class="cols" class:with={!!r.spec.aside}>
        <div class="ed">
          <NarrowEditor file={c.file} line={c.heading.line} end={c.heading.end} {tab} fileKey={'preview|' + r.cur + '|' + r.gen + '|' + c.file.path + '|' + (narrow.fold ?? []).join(',')}
            folded={narrow.fold ?? []} lineNote={narrow.note ?? null} drawers={!r.spec.drawers} onnarrow={(line, _last, typed) => typed && plugins.reviewEdited(line)}
            reveal={narrow.reveal ? { line: narrow.reveal.line, n: narrow.reveal.n, col: narrow.reveal.col, focus: true } : null} />
        </div>
        {#if r.spec.aside}<aside class="pa" use:part={() => r.spec.aside}></aside>{/if}
      </div>
    {/if}
  {/snippet}
  {#snippet below()}
    {#if r && c && r.spec.below}<div class="below" bind:this={belowEl}></div>{/if}
  {/snippet}
  {#snippet actions()}
    {#if r && c && r.spec.bar}
      <div class="pbar" use:part={() => r.spec.bar}></div>
    {:else if r && c}
      {#each r.spec.actions.filter((x) => !x.hidden) as a (a.id)}
        {@const sub = subOf(a)}
        <button class="a" class:pri={a.kind === 'primary'} class:ok={a.kind === 'ok'} disabled={off(a.disabled as never)} onclick={() => void plugins.reviewAct(a.id)}>{a.label}{#if sub}<span class="h">{sub}</span>{/if}{#if kbd(a.command)}<kbd>{kbd(a.command)}</kbd>{/if}</button>
      {/each}
      {#if !r.spec.noSkip}<button class="a" onclick={() => void plugins.reviewStep(1)}>Пропустить</button>{/if}
    {/if}
  {/snippet}
  {#snippet barEnd()}
    {#if r?.spec.barEnd && c}<div class="pbar" use:part={() => r.spec.barEnd}></div>{/if}
  {/snippet}
  {#snippet summary()}
    {#if r}
      {#if r.spec.summary}
        <div class="psum" bind:this={sumEl}></div>
      {:else}
        {#if sums.length}
          <div class="sums">{#each sums as x (x.word)}<div><b>{x.n}</b><span>{x.word}</span></div>{/each}</div>
        {:else}
          <p class="sum">Разобрано {r.done} из {total}. Всё уже записано в файлы.</p>
        {/if}
        {#if endNote}<p class="sum">{endNote}</p>{/if}
        <button class="pri" onclick={() => plugins.endReview(true)}>Закончить</button>
      {/if}
    {/if}
  {/snippet}
  {#snippet empty()}
    {#if r && r.cur >= 0}
      <div class="none">Заголовок «{r.refs[r.cur].title}» не найден: его переименовали или перенесли. <button onclick={() => void plugins.reviewStep(1)}>Следующий</button></div>
    {:else}
      <div class="none">Разбор закончен.</div>
    {/if}
  {/snippet}
</CardReview>

<style>
  .file { color: var(--fg2); }
  .hd { margin-left: auto; color: var(--fg2); }
  .ph { display: contents; }
  .pq { display: contents; }
  .cols { display: flex; min-height: 240px; }
  .cols.with { min-height: 360px; }
  .ed { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
  .pa { flex: 0 0 340px; min-width: 0; border-left: 1px solid var(--line); display: flex; flex-direction: column; }
  .sum { margin: 0; color: var(--fg2); }
  .sums { display: flex; flex-wrap: wrap; gap: 6px 22px; }
  .sums div { display: flex; flex-direction: column; }
  .sums b { font-size: 22px; font-weight: 600; color: var(--fg); }
  .sums span { font-size: 12px; color: var(--fg2); }
  .pri { height: 32px; padding: 0 16px; border: 0; border-radius: 7px; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .none { margin-top: 40px; color: var(--fg2); }
  .none button { margin-left: 8px; }
  .below { width: 100%; max-width: 820px; margin-top: 14px; }
  .psum { display: contents; }
  .pbar { display: contents; }
  :global(.preview .acts .a.pri) { background: var(--acc); color: var(--onacc); border-color: transparent; }
  :global(.preview .acts .a.ok) { color: var(--done); }
  :global(.preview .acts .a .h) { font-weight: 400; color: var(--fg2); font-size: 11.5px; }
  :global(.preview .acts .a.pri .h) { color: inherit; opacity: 0.8; }
</style>
