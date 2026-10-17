<script lang="ts">
  import { untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import { plugins } from '../api/host.svelte';
  import { reviewScope } from '../api/declare';
  import { store, type ScopeKeys } from '../store.svelte';
  import { displayName } from '../names';
  import type { Tab } from '../layout';
  import type { CardRender, ReviewCard } from '../api/index';
  import Editor from './Editor.svelte';
  import Compat from './Compat.svelte';

  // A review by cards in the new interface (ТЗ 45 §4, the Inbox's; the core's frame of `ui.review`): on the left the
  // queue, 270 pt — «Разбор» in Yeseva One, «2 из 5 · inbox», a bar of progress, rows of 32 pt (the current on `lamp`,
  // the handled on `done` and faded, the plugin's note on the right); in the middle a column of 820 pt — the card
  // (`card`, 12 pt; the plugin's head and quick parts, the narrowed editor — its heading the title, Cormorant 30, its
  // text Cormorant 19 in «Оформление»), the row of actions with «← Назад», what the plugin puts under it. The plugin's parts are drawn in the
  // compatibility layer; the plugin dresses them for `data-ui="next"` itself. The workings are the core's (host).
  let { tab }: { tab: Tab; pane?: number } = $props();

  const r = $derived(plugins.review);
  const c = $derived(plugins.reviewHeading());
  const total = $derived(r?.refs.length ?? 0);
  const kbd = (cmd?: string) => (cmd ? store.keyHint(cmd) : '');
  const narrow = $derived(r && c && r.spec.narrow ? plugins.guard(r.plugin, () => r.spec.narrow!(c.info), {}) : {});
  const phase = $derived(r && r.cur >= 0 && c ? 'card' : r && r.cur < 0 ? 'summary' : 'empty');
  const scope = $derived(reviewScope(r?.plugin ?? ''));

  // ---- the queue ----
  const queue = $derived.by(() => {
    if (!r) return [];
    void r.done;
    void plugins.reviewRedraw;
    return r.refs.map((ref, i) => {
      const note = r.spec.note ? plugins.guard(r.plugin, () => r.spec.note!(i), null) : null;
      // handled: by the core's actions, or as the plugin says (a review of its own order moves on itself)
      return { i, title: ref.title, cur: i === r.cur, done: r.doneAt.has(i) || !!note, note };
    });
  });
  const handled = $derived(queue.filter((q) => q.done).length);
  const where = $derived(c ? displayName(c.file.name) : '');

  // ---- the keys of the review (its commands of «"scope": "review"»): while its tab is shown ----
  const keys: ScopeKeys = {
    active: () => store.tab?.id === tab.id && !store.sheetOpen,
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
  $effect(() => {
    const s = scope;
    store.setScopeKeys(s, keys);
    return () => {
      if (store.scopeKeys.get(s) === keys) store.setScopeKeys(s, null);
    };
  });

  // ---- the plugin's parts: drawn for each card, and again when an action stays or the plugin asks ----
  const cardSig = $derived.by(() => {
    const run = plugins.review;
    const cur = plugins.reviewHeading();
    return run && cur ? JSON.stringify([plugins.reviewRedraw, run.cur, run.gen, cur.info]) : '';
  });
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
  let belowEl = $state<HTMLElement>();
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

<div class="rv {r?.spec.cls ?? ''}">
  <nav class="queue" aria-label="Очередь разбора">
    <div class="qh">Разбор</div>
    <div class="qs">{r && r.cur >= 0 ? `${r.cur + 1} из ${total}` : `${handled} из ${total}`}{where ? ` · ${where}` : ''}</div>
    <div class="track" aria-hidden="true"><i style:width="{total ? Math.round((handled / total) * 100) : 0}%"></i></div>
    {#each queue as q (q.i)}
      <div class="qr" class:cur={q.cur} class:handled={q.done && !q.cur} aria-current={q.cur ? 'true' : undefined}>
        <i class="qd" aria-hidden="true"></i><span class="qt">{q.title}</span>{#if q.note}<span class="qn">{q.note}</span>{/if}
      </div>
    {/each}
  </nav>
  <div class="stage">
    <div class="col">
      {#if phase === 'card' && r && c}
        {#key r.cur + '|' + r.gen + '|' + c.info.ref.path}
          <article class="card" aria-label="Карточка разбора" in:fly={{ y: 8, duration: 150 }}>
            {#if r.spec.head}<Compat><div class="part ph" use:part={() => r.spec.head}></div></Compat>{/if}
            {#if r.spec.quick}<Compat><div class="part pq" role="toolbar" aria-label="Быстрые действия" use:part={() => r.spec.quick}></div></Compat>{/if}
            <div class="ed grid">
              <Editor text={c.file.text} fileKey={'review|' + r.cur + '|' + r.gen + '|' + c.file.path} path={c.file.name} wf={c.file.wf}
                narrow={{ line: c.heading.line, end: c.heading.end }} initialFolds={narrow.fold ?? []} drawers={!r.spec.drawers} levels={store.levels} rich={store.rich}
                reveal={narrow.reveal ? { line: narrow.reveal.line, n: narrow.reveal.n, col: narrow.reveal.col, focus: true } : null}
                onchange={(t) => store.setText(t, c.file.path)} oncursor={() => {}} onfollow={(l) => store.follow(l)}
                onnarrow={(line, _last, typed) => typed && plugins.reviewEdited(line)} />
            </div>
          </article>
        {/key}
        <div class="acts">
          <button class="a back" disabled={r.cur === 0} onclick={() => void plugins.reviewStep(-1)}><span class="l">← Назад</span>{#if kbd(r.spec.backCommand)}<span class="s">{kbd(r.spec.backCommand)}</span>{/if}</button>
          {#if r.spec.bar}
            <Compat><div class="part pbar" use:part={() => r.spec.bar}></div></Compat>
          {:else}
            {#each r.spec.actions as a (a.id)}
              <button class="a" class:pri={a.kind === 'primary'} class:ok={a.kind === 'ok'} onclick={() => void plugins.reviewAct(a.id)}>
                <span class="l">{a.label}</span><span class="s">{[a.sub, kbd(a.command)].filter(Boolean).join(' · ')}</span>
              </button>
            {/each}
            {#if !r.spec.noSkip}<button class="a" onclick={() => void plugins.reviewStep(1)}><span class="l">Пропустить</span></button>{/if}
          {/if}
          {#if r.spec.barEnd}<Compat><div class="part pend" use:part={() => r.spec.barEnd}></div></Compat>{/if}
        </div>
        {#if r.spec.below}<Compat><div class="below" bind:this={belowEl}></div></Compat>{/if}
      {:else if phase === 'summary' && r}
        <div class="fin" in:fly={{ y: 8, duration: 150 }}>
          <span class="okc" aria-hidden="true">✓</span>
          <h2>Разбор закончен</h2>
          {#if r.spec.summary}
            <Compat><div class="psum" bind:this={sumEl}></div></Compat>
          {:else}
            <p>Разобрано {r.done} из {total}. Всё уже записано в файлы.</p>
            <button class="pri" onclick={() => plugins.endReview(true)}>Закончить</button>
          {/if}
        </div>
      {:else if r && r.cur >= 0}
        <div class="none">Заголовок «{r.refs[r.cur].title}» не найден: его переименовали или перенесли. <button onclick={() => void plugins.reviewStep(1)}>Следующий</button></div>
      {:else}
        <div class="none">Разбор закончен.</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .rv { flex: 1; min-height: 0; display: flex; color: var(--ink); font: 13px/1.45 var(--ui); background: var(--bg); }
  .queue { flex: 0 0 270px; width: 270px; box-sizing: border-box; padding: 22px 14px; border-right: 1px solid var(--rule); overflow: auto; }
  .qh { margin: 0 10px 4px; font: 400 28px/1.1 var(--title); }
  .qs { margin: 0 10px 12px; font-size: 12px; color: var(--ink3); }
  .track { height: 4px; margin: 0 10px 14px; border-radius: 2px; background: var(--track); overflow: hidden; }
  .track i { display: block; height: 100%; border-radius: 2px; background: var(--lamp); }
  .qr { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border-radius: 7px; }
  .qr.cur { background: var(--lampsoft); }
  .qr.handled { opacity: 0.45; }
  .qd { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 4px; background: var(--ink3); }
  .qr.cur .qd { background: var(--lamp); }
  .qr.handled .qd { background: var(--done); }
  .qt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qn { flex: 0 0 auto; font-size: 11px; color: var(--ink3); white-space: nowrap; }
  .stage { flex: 1; min-width: 0; overflow: auto; padding: 34px 40px; box-sizing: border-box; display: flex; justify-content: center;
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 24px 24px; background-position: -1px -1px; container-type: inline-size; }
  .col { width: 100%; max-width: 820px; display: flex; flex-direction: column; gap: 14px; }
  .card { display: flex; flex-direction: column; gap: 8px; padding: 18px 22px 16px; border: 1px solid var(--rule); border-radius: 12px; background: var(--card); }
  .part { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .ed { min-height: 120px; display: flex; flex-direction: column; margin: 2px -22px 0; }
  .ed :global(.cm-editor), .ed :global(.cm-scroller), .ed :global(.cm-gutters) { background: transparent; }
  /* the editor in the card, not a tab: no column of its own, no room above and below; its heading the card's title
     (Cormorant 30 in «Оформление»), its text Cormorant 19 */
  .ed :global(.cm-rich .cm-content) { max-width: none; padding: 0 22px 8px; }
  .ed :global(.cm-rich .cm-r-h) { --hfs: 30px; font-size: 30px; padding-top: 0; line-height: 1.15; }
  .ed :global(.cm-rich .cm-line:not(.cm-r-h):not(.cm-r-dline)) { font-size: 19px; }
  .acts { display: flex; align-items: stretch; gap: 8px; }
  /* the plugin's buttons: one row, each of the same width (§4.3), whatever wraps them */
  .acts .pbar { flex: 1; min-width: 0; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); align-items: stretch; gap: 8px; }
  .a { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 9px 10px 8px; border: 0; border-radius: 10px; background: var(--chip); color: var(--ink); font: 600 13px var(--ui); white-space: nowrap; }
  .a .s { margin-top: 2px; font-size: 11px; font-weight: 400; opacity: 0.7; }
  .a.back { flex: 0 0 auto; color: var(--ink2); font-weight: 400; }
  .a.back:disabled { opacity: 0.45; }
  .a.pri { background: var(--lamp); color: var(--onlamp); }
  .a.ok { background: color-mix(in srgb, var(--done) 16%, transparent); color: var(--done); }
  .a:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
  .pend { flex: 0 0 auto; }
  .below { width: 100%; }
  .fin { align-self: center; width: 100%; max-width: 560px; margin-top: 40px; padding: 36px 32px 28px; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; border: 1px solid var(--rule); border-radius: 12px; background: var(--card); }
  .okc { width: 52px; height: 52px; border-radius: 26px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--done) 16%, transparent); color: var(--done); font-size: 22px; font-weight: 800; }
  .fin h2 { margin: 0; font: 400 26px var(--title); }
  .fin p { margin: 0; color: var(--ink2); }
  .pri { height: 32px; padding: 0 16px; border: 0; border-radius: 7px; background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .none { margin-top: 40px; color: var(--ink2); }
  /* below 640 pt of the column the second line of the buttons (the status) goes: the key stays (§4.3) */
  @container (max-width: 700px) { .a .s { font-size: 10.5px; } }
</style>
