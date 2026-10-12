<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fly } from 'svelte/transition';
  import { store, type ScopeKeys } from './store.svelte';

  // The review by cards (roadmap 0.4), a component of the core: the stage, one card at a time — a header, quick
  // buttons, a body (most often a narrowed editor) and something under the card — the bar with «Назад» and the
  // actions, the summary when the queue is through. A review (the Inbox's, the goals') gives its pieces as snippets;
  // its keys are a scope of keys.ts, registered here while the tab is shown.
  let {
    cls, scope, keys, state, cardKey, width = 820, back, head, quick, body, below, actions, barEnd, summary, empty,
  }: {
    cls: string; // the review's own class on the frame («review», «greview»)
    scope: string; // its scope of keys (keys.ts `registerScope`)
    keys: ScopeKeys;
    state: 'card' | 'summary' | 'empty';
    cardKey: string; // a new card comes in with a short move
    width?: number; // the card's widest
    back?: { disabled: boolean; run: () => void; key: string } | null;
    head: Snippet;
    quick?: Snippet;
    body: Snippet;
    below?: Snippet;
    actions?: Snippet;
    barEnd?: Snippet;
    summary: Snippet;
    empty: Snippet;
  } = $props();

  $effect(() => {
    const k = keys;
    store.setScopeKeys(scope, k);
    return () => {
      if (store.scopeKeys.get(scope) === k) store.setScopeKeys(scope, null);
    };
  });
  const hint = (id: string) => store.keyHint(id);
</script>

<div class="creview {cls}">
  <div class="stage">
    {#if state === 'card'}
      {#key cardKey}
        <div class="card" style="max-width:{width}px" in:fly={{ y: 8, duration: 150 }}>
          <div class="chead">{@render head()}</div>
          {#if quick}<div class="quick" role="toolbar" aria-label="Быстрые действия">{@render quick()}</div>{/if}
          {@render body()}
        </div>
      {/key}
      {@render below?.()}
    {:else if state === 'summary'}
      <div class="done" in:fly={{ y: 8, duration: 150 }}>
        <span class="okc" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg></span>
        <h2>Разбор закончен</h2>
        {@render summary()}
      </div>
    {:else}
      {@render empty()}
    {/if}
  </div>

  {#if state === 'card' && actions}
    <div class="bar">
      {#if back}
        <button class="back" disabled={back.disabled} onclick={back.run}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l-6 6 6 6" /></svg>Назад{#if hint(back.key)}<kbd>{hint(back.key)}</kbd>{/if}
        </button>
      {/if}
      <div class="acts">{@render actions()}</div>
      {@render barEnd?.()}
    </div>
  {/if}
</div>

<style>
  .creview { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .stage { flex: 1 1 0; min-height: 0; overflow: auto; background: var(--stage); padding: 28px 24px; display: flex; flex-direction: column; align-items: center; }
  .card { flex: 0 0 auto; width: 100%; display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1); overflow: hidden; }
  .chead { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--line); font-size: 13px; }
  .quick { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 10px 18px; border-bottom: 1px solid var(--line); background: var(--side); }
  .quick :global(button) { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; }
  .done { width: 100%; max-width: 560px; margin-top: 40px; padding: 36px 32px 28px; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1); }
  .okc { width: 52px; height: 52px; border-radius: 26px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--done) 16%, transparent); color: var(--done); }
  .done h2 { margin: 0; font-size: 20px; font-weight: 700; }
  .bar { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bar); border-top: 1px solid var(--line); }
  .back { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: var(--fg2); }
  .back:disabled { opacity: 0.45; }
  .acts { flex: 1 1 auto; min-width: 0; display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; }
  .acts :global(.a) { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font-size: 13px; font-weight: 600; }
  .acts :global(.a:disabled) { opacity: 0.45; }
  .creview :global(kbd) { font: 10.5px var(--mono); padding: 0 4px; border: 1px solid color-mix(in srgb, currentColor 35%, transparent); border-radius: 4px; font-weight: 400; }
  @media (prefers-reduced-motion: reduce) { .card, .done { animation: none; } }
</style>
