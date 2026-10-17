<script lang="ts">
  import { untrack } from 'svelte';
  import { plugins } from '../api/host.svelte';
  import { iconOf } from '../api/manifest';
  import { store } from '../store.svelte';
  import type { ReviewTone } from '../api/index';
  import { fileReview } from './fileReview.svelte';
  import { TONE, TONE_WORD } from './reviewTones';
  import Compat from './Compat.svelte';

  // The card of a review in the file (ТЗ 46 §3, ТЗ 41 §1), first in the column: the plugin's icon and the review's
  // title; the number of the card in Yeseva One 22 and «из 5 · осталось 3»; a segment of 4 pt for each card, its colour
  // the card's outcome (the current `lamp`, those ahead `track`); the actions in a column, 30 pt each — the label, its
  // `sub`, the key right at 65%; «← Назад» and «Закончить ⎋» in a row; what the plugin draws under them (`below`).
  // The queue through: «Разбор окончен» — the outcomes that are not nil, in their colours, the bar whole, «Готово ⎋».
  const r = $derived(fileReview.run);
  const c = $derived(fileReview.card);
  const total = $derived(r?.refs.length ?? 0);
  const marks = $derived(r ? r.refs.map((_, i) => plugins.reviewMark(i)) : []);
  const remaining = $derived(r ? marks.filter((m, i) => !m && i !== r.cur && !r.doneAt.has(i)).length : 0);
  const icon = $derived(r ? (iconOf(plugins.manifest(r.plugin) ?? ({ contributes: { navSections: [], views: [], fileViews: [] } } as never)) ?? '') : '');
  const kbd = (cmd?: string) => (cmd ? store.keyHint(cmd) : '');
  const acts = $derived.by(() => {
    void plugins.reviewBar;
    void plugins.reviewRedraw;
    if (!r || !c) return [];
    return r.spec.actions.filter((a) => !a.hidden).map((a) => ({ a, off: !!a.disabled && plugins.guard(r.plugin, () => a.disabled!(c.info), false) }));
  });
  const seg = (i: number) => (r && i === r.cur ? 'var(--lamp)' : marks[i] ? TONE[marks[i]!.tone] : r?.doneAt.has(i) ? 'var(--done)' : 'var(--track)');
  const counts = $derived.by(() => {
    const n = new Map<ReviewTone, number>();
    for (const m of marks) if (m) n.set(m.tone, (n.get(m.tone) ?? 0) + 1);
    return [...n].filter(([, v]) => v > 0);
  });

  // the plugin's part under the actions: drawn for each card
  let belowEl = $state<HTMLElement>();
  const belowKey = $derived(c && r ? `${r.cur}|${r.gen}|${c.info.ref.path}|${c.info.ref.line}` : '');
  $effect(() => {
    const node = belowEl;
    void belowKey;
    const run = r;
    const ref = untrack(() => c?.info.ref);
    if (!node || !run?.spec.below || !ref) return;
    const tab = untrack(() => fileReview.tabId) ?? '';
    const d = plugins.guard(run.plugin, () => run.spec.below!(node, ref, { id: tab, setState: () => {} }), undefined);
    return () => {
      plugins.guard(run.plugin, () => d?.(), undefined);
      node.replaceChildren();
    };
  });
</script>

{#if r}
  <section class="scard" aria-label={r.cur >= 0 ? r.spec.title : 'Разбор окончен'} data-review={r.plugin}>
    <div class="head">
      {#if icon}<svg class="ic" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icon} /></svg>{/if}
      <span class="t">{r.cur >= 0 ? r.spec.title : `${r.spec.title.split(' ')[0]} окончен`}</span>
    </div>
    {#if r.cur >= 0}
      <div class="count"><b>{r.cur + 1}</b><span>из {total} · осталось {remaining}</span></div>
    {:else}
      <div class="sums">
        {#each counts as [tone, n] (tone)}
          <div class="sum"><b style:color={TONE[tone]}>{n}</b><span>{TONE_WORD[tone]}</span></div>
        {:else}
          <div class="sum"><b>0</b><span>разобрано</span></div>
        {/each}
      </div>
    {/if}
    <div class="segs" aria-hidden="true">
      {#each r.refs as ref, i (i + ref.title)}<span style:background={r.cur < 0 && !marks[i] && !r.doneAt.has(i) ? 'var(--track)' : seg(i)}></span>{/each}
    </div>
    {#if r.cur >= 0 && c}
      <div class="acts">
        {#each acts as { a, off } (a.id)}
          <button class="act" class:ok={a.kind === 'ok'} class:main={a.kind === 'primary'} disabled={off} onclick={() => void plugins.reviewAct(a.id)}>
            <span class="l">{a.label}</span>{#if a.sub}<span class="sub">{a.sub}</span>{/if}
            {#if kbd(a.command)}<kbd>{kbd(a.command)}</kbd>{/if}
          </button>
        {/each}
      </div>
      <div class="row">
        <button class="small" disabled={r.cur === 0} onclick={() => fileReview.back()}>← Назад{#if kbd(r.spec.backCommand)}<kbd>{kbd(r.spec.backCommand)}</kbd>{/if}</button>
        <button class="small" onclick={() => fileReview.finish()}>Закончить<kbd>⎋</kbd></button>
      </div>
      {#if r.spec.below}<Compat><div class="below" bind:this={belowEl}></div></Compat>{/if}
    {:else}
      <div class="row"><button class="small main" onclick={() => fileReview.finish()}>Готово<kbd>⎋</kbd></button></div>
    {/if}
  </section>
{/if}

<style>
  .scard { margin-bottom: 10px; padding: 0 10px 10px; border: 1px solid var(--rule); border-radius: 10px; background: var(--panel); color: var(--ink); font: 12px/1.4 var(--ui); }
  .head { height: 30px; display: flex; align-items: center; gap: 7px; }
  .ic { flex: 0 0 15px; color: var(--plug); }
  .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .count { display: flex; align-items: baseline; gap: 6px; margin: 2px 0 8px; }
  .count b, .sum b { font: 400 22px/1 var(--title); }
  .count span, .sum span { font-size: 12px; color: var(--ink3); }
  .sums { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 2px 0 8px; }
  .sum { display: flex; flex-direction: column; gap: 2px; }
  .segs { display: flex; gap: 3px; margin-bottom: 10px; }
  .segs span { flex: 1; height: 4px; border-radius: 2px; }
  .acts { display: flex; flex-direction: column; gap: 5px; }
  .act { height: 30px; display: flex; align-items: center; gap: 7px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); text-align: left; }
  .act .l { font-weight: 500; }
  .act .sub { font-size: 11px; letter-spacing: 0.02em; opacity: 0.75; }
  .act kbd, .small kbd { margin-left: auto; font: 11px var(--ui); opacity: 0.65; }
  .act.ok { background: color-mix(in srgb, var(--done) 16%, transparent); color: var(--done); }
  .act.main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .act:disabled { opacity: 0.45; }
  .act:focus-visible, .small:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
  .row { display: flex; gap: 6px; margin-top: 10px; }
  .small { height: 26px; display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink); font: 12px var(--ui); white-space: nowrap; }
  .small.main { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .small:disabled { opacity: 0.45; }
  .below { margin-top: 10px; }
</style>
