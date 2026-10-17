<script lang="ts">
  import { long } from './state.svelte';
  import { dueWords } from './long';

  // «Долгие дела» on «Сегодня» (ТЗ 40 §7): «3 пора проверить», «Обход ›» (ТЗ 41 §2), «Все ›», up to three of «Пора проверить» (the most
  // overdue first) — a click opens the tab with that one; «и ещё 2». None due, or turned off in the settings: no block.
  let { hide }: { hide: (h: boolean) => void } = $props();
  const due = $derived(long.groups.due);
  const shown = $derived(due.slice(0, 3));
  $effect(() => hide(!long.settings.today || !due.length));
</script>

<div class="lm-today">
  <div class="th">
    <span class="tn">Долгие дела</span><span class="ts">{due.length} пора проверить</span>
    <button class="tl" onclick={() => void long.ctx.commands.run('long-matters.walk')}>Обход ›</button>
    <button class="tl" onclick={() => long.openList()}>Все ›</button>
  </div>
  {#each shown as r (r.m.key)}
    <button class="tr" onclick={() => long.openList(r.m.key)}>
      {#if r.m.keyword}<span class="kw tone-chip" style={r.m.tone}>{r.m.keyword}</span>{/if}
      <span class="nm">{r.m.title}</span>
      <span class="late">{dueWords(r.s)}</span>
    </button>
  {/each}
  {#if due.length > 3}<button class="more" onclick={() => long.openList()}>и ещё {due.length - 3}</button>{/if}
</div>

<style>
  .th { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .tn { font-weight: 700; }
  .ts { color: var(--fg2); font-size: 12px; }
  .tl + .tl { margin-left: 10px; }
  .tl { margin-left: auto; border: 0; background: none; padding: 0; font: inherit; font-size: 12px; color: var(--acc); }
  .tl:hover, .more:hover { text-decoration: underline; }
  .tr { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 0; border: 0; border-top: 1px solid var(--line); background: none; color: var(--fg); font: inherit; text-align: left; }
  .tr:hover .nm { color: var(--acc); }
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font: 600 10px var(--mono); }
  .nm { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .late { flex: 0 0 auto; font-size: 12px; color: var(--todo); font-weight: 600; font-variant-numeric: tabular-nums; }
  .more { display: block; width: 100%; padding: 6px 0 0; border: 0; border-top: 1px solid var(--line); background: none; color: var(--fg2); font: inherit; font-size: 12px; text-align: left; }
</style>
