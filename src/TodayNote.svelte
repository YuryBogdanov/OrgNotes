<script lang="ts">
  import { noteLines, noteWhen } from './today';

  // «Сегодня» → «Записка со вчера» (tech sprint 4.2, from Today.svelte): the note of the last day of the journal, its
  // time, a link to it in the journal.
  type Day = { date: Date; note: { text: string; time: string | null; line: number } | null };
  let { jd, journal, name, onopen }: { jd: Day | null; journal: { path: string } | undefined; name: string; onopen: (path: string, line: number) => void } = $props();
</script>

<section class="tcard note" aria-label="Записка со вчера">
  <div class="tcard-head">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--noteAcc)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3h9l3 3v11H4zM7 8h6M7 11h6M7 14h3" /></svg>
    <span class="tcard-name">Записка со вчера</span>
    {#if jd?.note}
      <span class="tcard-sub">{noteWhen(jd.date, jd.note.time)}</span>
      <button class="tcard-link" onclick={() => journal && onopen(journal.path, jd!.note!.line)}>{name} ›</button>
    {/if}
  </div>
  {#if jd?.note}
    <div class="ntext">
      {#each noteLines(jd.note.text) as l, i (i)}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- a line of the note escaped by today.ts noteLines -->
        <div class="nl" style:padding-left="{l.depth * 16}px">{#if l.item}<span class="mk">–</span>{/if}<span>{@html l.html}</span></div>
      {/each}
    </div>
  {:else}
    <div class="tcard-none">Вчера записки не было. Вечером — «Завершить день…»</div>
  {/if}
</section>

<style>
  .note { padding: 14px 18px 12px; background: var(--note); border-color: var(--noteLine); }
  .ntext { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; font-size: 14px; line-height: 1.45; }
  .nl { display: flex; gap: 8px; }
  .mk { color: var(--fg3); }
  .ntext :global(.lnk) { color: var(--link); }
  .ntext :global(code) { font: 12.5px var(--mono); }
</style>
