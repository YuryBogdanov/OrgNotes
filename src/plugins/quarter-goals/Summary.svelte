<script lang="ts">
  import { goals } from './state.svelte';

  // «Разбор закончен» of the 1-1 review: what was done; the person's file, or the end.
  let { end }: { end: () => void } = $props();
  const r = goals.goalReview;
</script>

{#if r}
  <div class="stats">
    <div class="stat"><span class="n" style:color="var(--acc)">{r.marks}</span><span>{r.marks === 1 ? 'отметка добавлена' : 'отметок добавлено'}</span></div>
    <div class="stat"><span class="n" style:color="var(--done)">{r.closed}</span><span>{r.closed === 1 ? 'цель закрыта' : 'целей закрыто'}</span></div>
    <div class="stat"><span class="n" style:color="var(--wait)">{r.moved}</span><span>{r.moved === 1 ? 'срок сдвинут' : 'сроков сдвинуто'}</span></div>
  </div>
  <div class="btns">
    <button onclick={() => { const k = r.key; end(); goals.openGoalFile(k); }}>Открыть файл человека</button>
    <button class="pri" onclick={end}>Закончить</button>
  </div>
  <span class="fine">Всё уже записано в файл.</span>
{/if}

<style>
  .stats { display: flex; gap: 24px; }
  .stat { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; color: var(--fg2); }
  .stat .n { font-size: 22px; font-weight: 700; }
  .btns { display: flex; gap: 8px; }
  .btns button { height: 30px; padding: 0 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); }
  .btns .pri { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .fine { font-size: 11.5px; color: var(--fg3); }
</style>
