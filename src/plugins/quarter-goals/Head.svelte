<script lang="ts">
  import type { ReviewCard } from '@panopticon/api';
  import { goals } from './state.svelte';
  import { goalNote } from './goals';

  // The card's header of the 1-1 review: whose goal, which of how many, the file, how long it is silent.
  let { card }: { card: ReviewCard } = $props();
  const c = $derived(goals.cardOf(card.heading.ref));
</script>

{#if c?.goal}
  <span class="av" style="background:{c.p.color}" aria-hidden="true">{c.p.ini}</span>
  <b>{c.p.name} · цель {card.index + 1} из {card.total}</b>
  <span class="file">{c.p.src.file.split('/').pop()}</span>
  <span class="pill" class:silent={goals.goalSilent(c.goal)}>{goalNote(c.goal, c.file.wf.done, new Date(), goals.goalSettings.silent)}</span>
{/if}

<style>
  .av { flex: 0 0 24px; width: 24px; height: 24px; border-radius: 12px; color: #ffffff; font-size: 10.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .file { color: var(--fg2); }
  .pill { margin-left: auto; display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 11px; font-size: 12px; color: var(--fg2); background: var(--field); }
  .pill.silent { font-weight: 600; color: var(--wait); background: color-mix(in srgb, var(--wait) 14%, transparent); }
</style>
