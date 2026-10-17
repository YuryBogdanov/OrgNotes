<script lang="ts">
  import type { HeadingRef } from '@panopticon/api';
  import { long } from './state.svelte';
  import { ageWords, dueWords, grouped, shortDay } from './long';
  import { review, reviewed, status, toggleWait } from './actions';

  // The card of a file of the long matters (ТЗ 44 §5, §7): «пора проверить · ждём · в норме» of its matters, «Открыть
  // список»; under the caret — the matter's status and title, how long untouched, the day to look, its last status,
  // and the actions with their keys (§9). Not on a matter: the actions are there, off.
  let { at }: { at: { path: string; heading: HeadingRef | null } } = $props();
  const rows = $derived(long.rows.filter((r) => r.m.path === at.path));
  const g = $derived(grouped(rows));
  const row = $derived(at.heading ? rows.find((r) => r.m.line === at.heading!.line) : undefined);
  const key = (id: string) => long.ctx.commands.keyOf(id);
  const fmt = (d: Date) => shortDay(d);
  const anchor = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: r.left, y: r.bottom + 4 };
  };
</script>

<div class="fc-stats lm-stats">
  <div class="fc-stat"><b class:late={g.due.length > 0}>{g.due.length}</b><span>пора проверить</span></div>
  <div class="fc-stat"><b>{g.waiting.length}</b><span>ждём</span></div>
  <div class="fc-stat"><b>{g.ok.length}</b><span>в норме</span></div>
</div>
<div class="fc-btns">
  <button type="button" class="fc-btn main" onclick={() => void long.ctx.commands.run('long-matters.open')}>Открыть список</button>
</div>
<div class="fc-under">Под курсором</div>
{#if row}
  <div class="lm-cur">
    {#if row.m.keyword}<span class="kw tone-chip" style={row.m.tone}>{row.m.keyword}</span>{/if}
    <b>{row.m.title}</b>
  </div>
  <div class="lm-facts">
    {ageWords(row.s, row.m)} без касания · проверить <b>{dueWords(row.s)}</b>{#if row.m.waiting} · ждём: {row.m.waiting}{/if}
    {#if row.m.note}<br /><span class="lm-day">{fmt(row.m.note.at)}</span> {row.m.note.text}{/if}
  </div>
{:else}
  <div class="lm-none">Курсор не на долгом деле</div>
{/if}
<div class="fc-btns">
  <button type="button" class="fc-btn" disabled={!row} onclick={(e) => row && status(row.m, anchor(e))}>Статус{#if key('addNote')}<kbd>{key('addNote')}</kbd>{/if}</button>
  <button type="button" class="fc-btn" disabled={!row} onclick={() => row && toggleWait(row.m)}>{row?.m.waiting ? 'Больше не ждём' : 'Ждём…'}{#if key(row?.m.waiting ? 'long-matters.unwait' : 'long-matters.wait')}<kbd>{key(row?.m.waiting ? 'long-matters.unwait' : 'long-matters.wait')}</kbd>{/if}</button>
  <button type="button" class="fc-btn" disabled={!row} onclick={() => row && void review(row.m)}>Проверить через…{#if key('long-matters.review')}<kbd>{key('long-matters.review')}</kbd>{/if}</button>
  <button type="button" class="fc-btn" disabled={!row} onclick={() => row && void reviewed(row.m)}>Осмотрено{#if key('long-matters.seen')}<kbd>{key('long-matters.seen')}</kbd>{/if}</button>
</div>

<style>
  .lm-stats .fc-stat b.late { color: var(--todo); }
  .lm-cur { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; color: var(--fg); }
  .lm-cur b { font-size: 12.5px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lm-cur .kw { flex: 0 0 auto; display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 4px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.02em; }
  .lm-facts { font-size: 11.5px; line-height: 1.45; }
  .lm-facts b { font-weight: 600; color: var(--fg); }
  .lm-day { font: 10.5px var(--mono, ui-monospace, Menlo, monospace); opacity: 0.75; }
  .lm-none { font-size: 11.5px; opacity: 0.75; }
</style>
