<script lang="ts">
  import CardReview from './CardReview.svelte';
  import NarrowEditor from './NarrowEditor.svelte';
  import { plugins, REVIEW_KIND } from './api/host.svelte';
  import { REVIEW_SCOPE } from './api/declare';
  import { store } from './store.svelte';
  import type { Tab } from './layout';

  // A plugin's review (ТЗ 26 §5.2, `ui.review`): the core's review by cards — one heading at a time, narrowed, the
  // plugin's actions in the bar and on their keys (its commands in «"scope": "review"»), «Назад», the summary.
  let { tab }: { tab: Tab; pane: number } = $props();

  const r = $derived(plugins.review);
  const c = $derived(plugins.reviewHeading());
  const total = $derived(r?.refs.length ?? 0);
  const kbd = (cmd?: string) => (cmd ? store.keyHint(cmd) : '');
  const header = $derived(r && c && r.spec.header ? plugins.guard(r.plugin, () => r.spec.header!(c.info), '') : '');
  const keys = {
    active: () => store.tab?.kind === REVIEW_KIND && !store.sheetOpen,
    run: (id: string) => {
      const a = plugins.review?.spec.actions.find((x) => x.command === id);
      if (!a || !plugins.reviewHeading()) return false;
      void plugins.reviewAct(a.id);
      return true;
    },
  };

  // something of the plugin under the card: drawn again for each card
  let belowEl = $state<HTMLElement>();
  $effect(() => {
    const node = belowEl;
    const run = plugins.review;
    const ref = c?.info.ref;
    if (!node || !run?.spec.below || !ref) return;
    const d = plugins.guard(run.plugin, () => run.spec.below!(node, ref, { id: tab.id, setState: () => {} }), undefined);
    return () => {
      plugins.guard(run.plugin, () => d?.(), undefined);
      node.replaceChildren();
    };
  });
</script>

<CardReview cls="preview" scope={REVIEW_SCOPE} {keys}
  state={r && r.cur >= 0 && c ? 'card' : r && r.cur < 0 ? 'summary' : 'empty'}
  cardKey={r && c ? r.cur + '|' + c.info.ref.path + '|' + c.info.ref.title : ''}
  back={r ? { disabled: r.cur <= 0, run: () => plugins.reviewStep(-1), key: '' } : null}>
  {#snippet head()}
    {#if r && c}
      <b>{r.spec.title} · {r.cur + 1} из {total}</b>
      <span class="file">{c.file.name.split('/').pop()}</span>
      {#if header}<span class="hd">{header}</span>{/if}
    {/if}
  {/snippet}
  {#snippet body()}
    {#if r && c}
      <div class="ed">
        <NarrowEditor file={c.file} line={c.heading.line} end={c.heading.end} {tab} fileKey={'preview|' + r.cur + '|' + c.file.path} />
      </div>
    {/if}
  {/snippet}
  {#snippet below()}
    {#if r && c && r.spec.below}<div class="below" bind:this={belowEl}></div>{/if}
  {/snippet}
  {#snippet actions()}
    {#if r && c}
      {#each r.spec.actions as a (a.id)}
        <button class="a" onclick={() => void plugins.reviewAct(a.id)}>{a.label}{#if kbd(a.command)}<kbd>{kbd(a.command)}</kbd>{/if}</button>
      {/each}
      <button class="a" onclick={() => plugins.reviewStep(1)}>Пропустить</button>
    {/if}
  {/snippet}
  {#snippet summary()}
    {#if r}
      <p class="sum">Разобрано {r.done} из {total}. Всё уже записано в файлы.</p>
      <button class="pri" onclick={() => plugins.endReview(true)}>Закончить</button>
    {/if}
  {/snippet}
  {#snippet empty()}
    {#if r && r.cur >= 0}
      <div class="none">Заголовок «{r.refs[r.cur].title}» не найден: его переименовали или перенесли. <button onclick={() => plugins.reviewStep(1)}>Следующий</button></div>
    {:else}
      <div class="none">Разбор закончен.</div>
    {/if}
  {/snippet}
</CardReview>

<style>
  .file { color: var(--fg2); }
  .hd { margin-left: auto; color: var(--fg2); }
  .ed { min-height: 240px; display: flex; flex-direction: column; }
  .sum { margin: 0; color: var(--fg2); }
  .pri { height: 32px; padding: 0 16px; border: 0; border-radius: 7px; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .none { margin-top: 40px; color: var(--fg2); }
  .none button { margin-left: 8px; }
  .below { width: 100%; max-width: 820px; margin-top: 14px; }
</style>
