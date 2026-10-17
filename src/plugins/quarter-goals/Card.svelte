<script lang="ts">
  import type { HeadingRef } from '@panopticon/api';
  import { goals, type GoalPerson } from './state.svelte';
  import { GOAL_STATES, goalsIn, isDone, lastMark, quarterOf, quietDays, type Goal } from './goals';
  import { startReview } from './actions';

  // The card of a file of goals (ТЗ 44 §5, §7): the person's goals of this quarter — a dot (`todo`: silent longer than
  // the threshold), the title, how long since a mark; the longest silent one said in words; «Разбор целей на 1-1»,
  // «Отметить прогресс…» (the goal under the caret, else the longest silent one). A row goes to its goal.
  let { at, person }: { at: { path: string; heading: HeadingRef | null }; person: () => GoalPerson | undefined } = $props();
  const p = $derived(person());
  const list = $derived(p ? goalsIn(p.data, quarterOf(new Date())).filter((g) => !isDone(g, [GOAL_STATES.done])) : []);
  const ago = (g: Goal) => {
    const m = lastMark(g);
    if (!m) return 'нет отметок';
    const w = Math.floor((quietDays(g) ?? 0) / 7);
    return w < 1 ? 'эта нед.' : `${w} нед.`;
  };
  const quiet = $derived(list.filter((g) => goals.goalSilent(g)).sort((a, b) => (quietDays(b) ?? 0) - (quietDays(a) ?? 0)));
  const under = $derived(at.heading ? list.find((g) => at.heading!.line >= g.line && at.heading!.line < g.end) : undefined);
  const target = $derived(under ?? quiet[0] ?? list[0]);
  const refOf = (g: Goal): HeadingRef => ({ path: at.path, line: g.line, title: g.title });
  const go = (g: Goal) => void goals.ctx.commands.run('heading.reveal', { ref: refOf(g) });
  const weeks = (g: Goal) => Math.floor((quietDays(g) ?? 0) / 7);
  const weeksWord = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'неделю' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'недели' : 'недель'}`;
</script>

{#if list.length}
  <div class="qg-list" role="group" aria-label="Цели квартала">
    {#each list as g (g.line)}
      {@const silent = goals.goalSilent(g)}
      <button type="button" class="qg-row" class:on={g === under} onclick={() => go(g)}>
        <span class="qg-dot" class:silent></span><span class="qg-t">{g.title}</span><span class="qg-n" class:silent>{ago(g)}</span>
      </button>
    {/each}
  </div>
  {#if quiet[0]}
    <div class="qg-note"><b>«{quiet[0].title}»</b> не обсуждали {weeksWord(Math.max(1, weeks(quiet[0])))}.</div>
  {/if}
{:else}
  <div class="qg-none">Целей этого квартала нет</div>
{/if}
<div class="fc-btns">
  <button type="button" class="fc-btn main" disabled={!p || p.src.me} onclick={() => p && void startReview(p.key)}>Разбор целей на 1-1</button>
  <button type="button" class="fc-btn" disabled={!target} onclick={() => target && void goals.markFromList(refOf(target))}>Отметить прогресс…</button>
</div>

<style>
  .qg-list { display: flex; flex-direction: column; }
  .qg-row { display: flex; align-items: center; gap: 7px; height: 26px; padding: 0 4px; margin: 0 -4px; border: 0; border-radius: 5px; background: none; color: var(--fg); font-size: 12px; text-align: left; }
  .qg-row:hover { background: color-mix(in srgb, currentColor 6%, transparent); }
  .qg-row.on .qg-t { font-weight: 600; }
  .qg-dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 4px; background: var(--fg); }
  .qg-dot.silent { background: var(--todo); }
  .qg-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qg-n { font-size: 11px; opacity: 0.6; white-space: nowrap; }
  .qg-n.silent { color: var(--todo); opacity: 1; }
  .qg-note { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--acc) 14%, transparent); font-size: 11.5px; line-height: 1.45; }
  .qg-note b { font-weight: 600; color: var(--acc); }
  .qg-none { font-size: 11.5px; opacity: 0.75; }
</style>
