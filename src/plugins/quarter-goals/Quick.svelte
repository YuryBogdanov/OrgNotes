<script lang="ts">
  import type { ReviewCard } from '@panopticon/api';
  import { goals } from './state.svelte';
  import { shiftDeadline } from './actions';
  import { GOAL_TONES, cmpQuarter, quarterLabel, shiftQuarter, shortDay } from './goals';

  // The quick buttons of the 1-1 review: «Статус» (the core's statuses for the goal), «Срок», «Квартал».
  let { card }: { card: ReviewCard } = $props();
  const c = $derived(goals.cardOf(card.heading.ref));
  let qMenu = $state(false);
  const chip = (kw: string | null) =>
    !kw || !c ? '' : GOAL_TONES[kw] ? `color:${GOAL_TONES[kw]};background:color-mix(in srgb, ${GOAL_TONES[kw]} 15%, transparent)` : goals.toneStyle(kw, c.file.path);
</script>

{#if c?.goal && c.q}
  {@const q = c.q}
  <button onclick={() => void goals.ctx.commands.run('heading.status', { ref: card.heading.ref })}><span>Статус</span><span class="qv st" class:tone-chip={!!c.goal.keyword && !GOAL_TONES[c.goal.keyword]} style={chip(c.goal.keyword)}>{c.goal.keyword ?? '—'}</span></button>
  <button onclick={() => void shiftDeadline(card.heading.ref)}><span>Срок</span><span class="qv ts">{c.goal.deadline ? shortDay(c.goal.deadline) : '—'}</span></button>
  <div class="qwrap">
    <button aria-haspopup="menu" aria-expanded={qMenu} onclick={() => (qMenu = !qMenu)}><span>Квартал</span><span class="qv">{quarterLabel(q)}</span></button>
    {#if qMenu}
      <div class="qmenu" role="menu">
        {#each [-1, 0, 1] as d (d)}
          {@const qq = shiftQuarter(q, d)}
          <button role="menuitemradio" aria-checked={cmpQuarter(qq, q) === 0} onclick={() => { qMenu = false; void goals.goalMoveQuarter(card.heading.ref, qq).then(() => goals.ctx.ui.currentReview()?.redraw()); }}>{quarterLabel(qq)}</button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .qv { font-weight: 600; }
  .qv.st { padding: 1px 6px; border-radius: 5px; font-size: 11px; }
  .qv.ts { color: var(--ts); }
  .qwrap { position: relative; }
  .qmenu { position: absolute; left: 0; top: 32px; z-index: 3; display: flex; flex-direction: column; padding: 4px; min-width: 120px; background: var(--pop); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); }
  .qmenu button { border: 0; justify-content: flex-start; }
  .qmenu button[aria-checked='true'] { color: var(--acc); font-weight: 600; }
</style>
