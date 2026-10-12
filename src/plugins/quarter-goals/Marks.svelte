<script lang="ts">
  import { tick } from 'svelte';
  import type { ReviewCard } from '@panopticon/api';
  import { listEnter } from '@panopticon/api/org';
  import { goals } from './state.svelte';
  import { markDay } from './actions';
  import { dayLabel, markDayLabel } from './goals';

  // The marks of the 1-1 review, right of the goal: the field of a new one (its day), the marks, newest first; a
  // double click shows a mark on the left.
  let { card }: { card: ReviewCard } = $props();
  const c = $derived(goals.cardOf(card.heading.ref));
  const r = $derived(goals.goalReview);
  const marksNewest = $derived(c?.goal ? [...c.goal.marks].map((m, i) => ({ m, i })).sort((a, b) => +b.m.date - +a.m.date || b.i - a.i).map((x) => x.m) : []);
  const kbd = $derived(goals.markKey);

  let field: HTMLTextAreaElement | undefined = $state();
  // a new card: the field takes the keys, its caret at the end («Итог: »)
  $effect(() => {
    const f = field;
    if (!f) return;
    void tick().then(() => {
      f.focus();
      f.selectionStart = f.selectionEnd = f.value.length;
    });
  });
  /** «- » makes an item, ↩ a new line, ⌘↩ adds (the review's key). */
  function fieldKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.isComposing || !r) return;
    const ta = e.currentTarget as HTMLTextAreaElement;
    const x = listEnter(ta.value, ta.selectionStart);
    if (!x) return;
    e.preventDefault();
    r.draft = x.value;
    goals.ctx.ui.currentReview()?.update();
    void tick().then(() => (ta.selectionStart = ta.selectionEnd = x.caret));
  }
</script>

{#if c?.goal && r}
  <div class="marks" role="complementary" aria-label="Отметки">
    <div class="mh"><span class="cap">ОТМЕТКИ · {c.goal.marks.length}</span><span class="nt">новые сверху</span></div>
    <div class="new">
      <button class="day" title="Другой день" onclick={() => void markDay()}>{markDayLabel(r.date ?? new Date())}</button>
      <textarea bind:this={field} bind:value={r.draft} rows="3" aria-label="Новая отметка" placeholder="Что сделано, что дальше…" onkeydown={fieldKey}
        oninput={() => goals.ctx.ui.currentReview()?.update()}></textarea>
      <span class="nt">↩ новая строка · «- » пункт списка · {kbd || '⌘↩'} добавить</span>
    </div>
    {#each marksNewest as m (m.line)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="mark" ondblclick={() => goals.showMark(m.line)} title="Двойной клик — показать слева">
        <span class="md">{dayLabel(m.date)}</span>
        <span class="mt">{m.text}</span>
      </div>
    {/each}
    <span class="nt">Отметки пишутся в подзаголовок «Отметки» этой цели строками <code>- [дата] текст</code>, по порядку дат.</span>
  </div>
{/if}

<style>
  .marks { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; padding: 14px 16px 18px; background: var(--side); }
  .mh { display: flex; align-items: baseline; gap: 8px; }
  .cap { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; color: var(--fg2); }
  .nt { font-size: 11px; color: var(--fg3); line-height: 1.45; }
  .new { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1.5px solid var(--acc); border-radius: 9px; background: var(--bg); }
  .day { align-self: flex-start; height: 20px; padding: 0 8px; border: 0; border-radius: 10px; font-size: 11.5px; font-weight: 600; color: var(--ts); background: color-mix(in srgb, var(--ts) 12%, transparent); }
  textarea { min-height: 60px; resize: vertical; border: 0; outline: none; background: transparent; color: var(--fg); font: inherit; font-size: 13px; line-height: 1.5; padding: 0; -webkit-user-select: text; user-select: text; }
  .mark { display: flex; flex-direction: column; gap: 4px; padding: 0 2px 10px; border-bottom: 1px solid var(--line); cursor: default; }
  .md { font-size: 11.5px; font-weight: 600; color: var(--fg2); }
  .mt { white-space: pre-wrap; line-height: 1.5; -webkit-user-select: text; user-select: text; }
  code { font-family: var(--mono); }
</style>
