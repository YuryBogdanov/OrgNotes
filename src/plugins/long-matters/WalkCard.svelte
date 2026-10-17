<script lang="ts">
  import type { HeadingRef } from '@panopticon/api';
  import { long } from './state.svelte';
  import { approxWords, shortDay, shown } from './long';
  import { AGAIN, walk } from './walk.svelte';

  // The walk's part of the core's card (ТЗ 41 §3.2, §3.3, §3.5), under its decisions: the line of the matter — «23 дн.
  // без касания · проверить надо было 6 окт» (≈ by the file's date); «Новый статус» — a field of one to three lines,
  // ↩ writes the note into its :LOGBOOK: and the focus stays, ⇧↩ a new line, the focus there at each matter; «Проверить
  // снова через» — the chips, the one chosen on `lamp`, kept till the walk ends.
  let { at }: { at: HeadingRef } = $props();
  const m = $derived(walk.matterOf(at));
  const s = $derived(m ? shown(m, long.today, long.settings.norm) : null);
  const facts = $derived.by(() => {
    if (!m || !s) return '';
    const approx = approxWords(m);
    const age = s.age === null ? '' : m.touched?.approx ? `≈${s.age} дн. без касания${approx ? ' · по дате файла' : ''}` : `${s.age} дн. без касания`;
    const due = s.due ? (s.left !== null && s.left < 0 ? `проверить надо было ${shortDay(s.due)}` : `проверить ${shortDay(s.due)}`) : '';
    return [age, due].filter(Boolean).join(' · ');
  });
  let field = $state<HTMLTextAreaElement>();
  let saved = $state(false);
  $effect(() => {
    void at.title;
    queueMicrotask(() => field?.focus({ preventScroll: true }));
  });
  async function key(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    e.preventDefault();
    if (await walk.writeNote(at)) {
      saved = true;
      setTimeout(() => (saved = false), 1600);
      field?.focus({ preventScroll: true });
    }
  }
  const rows = $derived(Math.min(3, Math.max(1, walk.draft.split('\n').length)));
  async function pickDay() {
    const d = await long.ctx.ui.pickDate({ title: 'Проверить снова', initial: 'day' in walk.again ? walk.again.day : new Date(Date.now() + walk.days * 86_400_000) });
    if (d) walk.again = { day: d };
  }
</script>

<div class="wk">
  {#if facts}<div class="facts">{facts}</div>{/if}
  <label class="lbl" for="wk-status">Новый статус</label>
  <textarea id="wk-status" bind:this={field} bind:value={walk.draft} {rows} placeholder="что сейчас с делом…" onkeydown={key}></textarea>
  <div class="hint">{saved ? 'Записано в журнал' : '↩ — записать в журнал'}</div>
  <div class="lbl">Проверить снова через</div>
  <div class="chips" role="radiogroup" aria-label="Проверить снова через">
    {#each AGAIN as a (a.id)}
      <button role="radio" aria-checked={'days' in walk.again && walk.again.days === a.days} class:on={'days' in walk.again && walk.again.days === a.days} onclick={() => (walk.again = { days: a.days })}>{a.label}</button>
    {/each}
    <button role="radio" aria-checked={'day' in walk.again} class:on={'day' in walk.again} onclick={() => void pickDay()}>{'day' in walk.again ? walk.againWords : 'дата…'}</button>
  </div>
</div>

<style>
  .wk { display: flex; flex-direction: column; gap: 6px; color: var(--ink2, var(--fg2)); font: 12px/1.4 var(--ui, inherit); }
  .facts { font-size: 11.5px; color: var(--ink2, var(--fg2)); }
  .lbl { margin-top: 4px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3, var(--fg3)); }
  textarea { width: 100%; box-sizing: border-box; resize: none; padding: 6px 8px; border: 1px solid var(--rule, var(--line)); border-radius: 7px; background: var(--field, var(--bg)); color: var(--ink, var(--fg)); font: 12.5px/1.4 var(--ui, inherit); }
  textarea:focus { outline: 2px solid var(--lamp, var(--acc)); outline-offset: -1px; }
  .hint { font-size: 10.5px; color: var(--ink3, var(--fg3)); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips button { height: 22px; padding: 0 8px; border: 0; border-radius: 6px; background: var(--chip2, var(--chip)); color: var(--ink, var(--fg)); font: 11.5px var(--ui, inherit); }
  .chips button.on { background: var(--lamp, var(--acc)); color: var(--onlamp, #fff); font-weight: 600; }
</style>
