<script lang="ts">
  import { untrack } from 'svelte';
  import { plugins } from '../api/host.svelte';
  import type { Dispose, HeadingRef } from '../api/index';
  import { store } from '../store.svelte';
  import type { Card } from './fileCards.svelte';
  import Compat from './Compat.svelte';

  // A card of a file (ТЗ 44 §7): a `rule` frame, 10 pt corners, on `panel`. Its head of 30 pt — the plugin's icon in
  // `plug`, the title 12 pt semibold, the count `ink3`, ⌄ / › — folds and unfolds it on a click anywhere in it. The body
  // is the plugin's (in the compatibility layer), up to 260 pt, then it scrolls inside with no bar and fades at the
  // bottom. Its plugin failed: «Карточка не загрузилась» and «Подробнее», as the plugins' panels.
  let { card, path, heading, folded, ontoggle }: { card: Card; path: string; heading: HeadingRef | null; folded: boolean; ontoggle: () => void } = $props();
  const text = $derived(store.files.find((f) => f.name === path)?.text);
  const count = $derived.by(() => {
    void text;
    const spec = card.spec;
    if (!spec?.count || card.broken) return null;
    const n = plugins.guard(card.plugin, () => spec.count!(path), null);
    return n === null || n === undefined || n === '' ? null : String(n);
  });

  let body = $state<HTMLElement>();
  let drawn: Dispose[] = [];
  const draw = (el: HTMLElement, h: HeadingRef | null) => {
    const spec = card.spec;
    if (!spec) return;
    const d = plugins.guard(card.plugin, () => spec.render(el, { path, heading: h }), undefined);
    if (typeof d === 'function' && !drawn.includes(d)) drawn.push(d);
  };
  // drawn when it shows (a new file, unfolded); again with the same element on a new heading under the caret
  $effect(() => {
    const el = body;
    void card.spec;
    void path;
    if (!el || card.broken) return;
    untrack(() => draw(el, heading));
    return () => {
      for (const d of drawn) plugins.guard(card.plugin, () => d(), undefined);
      drawn = [];
      el.replaceChildren();
    };
  });
  let first = true;
  $effect(() => {
    const h = heading;
    if (first) return void (first = false);
    const el = untrack(() => body);
    if (el && !card.broken) untrack(() => draw(el, h));
  });

  // the fade at the edge it goes on past (§7, as «Структура», ТЗ 42 §7.1)
  let scroller = $state<HTMLElement>();
  let fadeBot = $state(false);
  let fadeTop = $state(false);
  const edges = () => {
    if (!scroller) return;
    fadeTop = scroller.scrollTop > 1;
    fadeBot = scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
  };
  $effect(() => {
    const el = scroller;
    if (!el) return;
    const ro = new ResizeObserver(edges);
    ro.observe(el);
    if (body) ro.observe(body);
    return () => ro.disconnect();
  });
</script>

<section class="fcard" aria-label={card.title} data-card={card.id}>
  <button class="head" aria-expanded={!folded} onclick={ontoggle}>
    <svg class="ic" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={card.icon} /></svg>
    <span class="t">{card.title}</span>
    {#if count}<span class="n">{count}</span>{/if}
    <span class="chev" aria-hidden="true">{folded ? '›' : '⌄'}</span>
  </button>
  {#if !folded}
    {#if card.broken}
      <div class="broken" role="alert">
        <b>Карточка не загрузилась</b>
        <span>Плагин выключен: {card.broken}</span>
        <button onclick={() => store.openSettings('Плагины')}>Подробнее</button>
      </div>
    {:else}
      <div class="scroll" class:ft={fadeTop} class:fb={fadeBot} bind:this={scroller} onscroll={edges}>
        <Compat><div class="body" bind:this={body}></div></Compat>
      </div>
    {/if}
  {/if}
</section>

<style>
  .fcard { margin-bottom: 10px; border: 1px solid var(--rule); border-radius: 10px; background: var(--panel); overflow: hidden; }
  .head { width: 100%; height: 30px; display: flex; align-items: center; gap: 7px; padding: 0 10px; border: 0; background: none; color: var(--ink); text-align: left; cursor: default; }
  .head:focus-visible { outline: 2px solid var(--lamp); outline-offset: -2px; border-radius: 10px; }
  .ic { flex: 0 0 15px; color: var(--plug); }
  .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 12px var(--ui); }
  .n { font: 11.5px var(--ui); color: var(--ink3); white-space: nowrap; }
  .chev { margin-left: auto; width: 12px; text-align: center; color: var(--ink3); font-size: 12px; }
  .scroll { max-height: 260px; overflow: auto; scrollbar-width: none; }
  .scroll::-webkit-scrollbar { display: none; }
  .scroll.fb { -webkit-mask-image: linear-gradient(#000 calc(100% - 24px), transparent); mask-image: linear-gradient(#000 calc(100% - 24px), transparent); }
  .scroll.ft { -webkit-mask-image: linear-gradient(transparent, #000 24px); mask-image: linear-gradient(transparent, #000 24px); }
  .scroll.ft.fb { -webkit-mask-image: linear-gradient(transparent, #000 24px, #000 calc(100% - 24px), transparent); mask-image: linear-gradient(transparent, #000 24px, #000 calc(100% - 24px), transparent); }
  .body { padding: 0 10px 10px; color: var(--ink2); font: 12px/1.45 var(--ui); }
  /* the conventions of a card's body (§7), for the plugins: the figures of a summary, «ПОД КУРСОРОМ», the buttons */
  .body :global(.fc-stats) { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 2px 0 8px; }
  .body :global(.fc-stat) { display: flex; flex-direction: column; }
  .body :global(.fc-stat b) { font: 400 22px/1.1 var(--title); color: var(--ink); }
  .body :global(.fc-stat span) { font-size: 11px; color: var(--ink3); }
  .body :global(.fc-under) { margin: 10px 0 4px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3); }
  .body :global(.fc-btns) { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .body :global(.fc-btn) { height: 24px; display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink); font: 11.5px var(--ui); white-space: nowrap; }
  .body :global(.fc-btn.main) { background: var(--lamp); color: var(--onlamp); font-weight: 600; }
  .body :global(.fc-btn:disabled) { opacity: 0.45; }
  .body :global(.fc-btn kbd) { font: 10.5px var(--ui); opacity: 0.6; }
  .broken { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 0 10px 10px; font-size: 12px; color: var(--ink2); }
  .broken b { color: var(--ink); }
  .broken button { margin-top: 4px; height: 24px; padding: 0 9px; border: 0; border-radius: 6px; background: var(--chip2); color: var(--ink); font: 11.5px var(--ui); }
</style>
