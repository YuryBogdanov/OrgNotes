<script lang="ts">
  import { goals } from './state.svelte';
  import { agoWords, goalsCount, quarterLabel, quarterOf, todayPerson } from './goals';

  // «Цели квартала» on «Сегодня» (ТЗ 32 §2.7): mine first, then each person — the active goals and the time since the
  // last mark; one silent longer than the threshold lights it (the hint says which). A row opens that person's goals.
  let { hide }: { hide: (h: boolean) => void } = $props();
  const q = quarterOf(new Date());
  const rows = $derived(
    goals.goalPeople.filter((p) => p.found).map((p) => ({ p, t: todayPerson(p.data, q, new Date(), goals.goalSettings.silent) })),
  );
  $effect(() => hide(!rows.length));
  const tip = (t: ReturnType<typeof todayPerson>) => t.silent.map((s) => `${s.title} — ${agoWords(s.days, true)} без отметок`).join('\n');
</script>

<div class="qg-today">
  <div class="qg-th">
    <span class="qg-tn">Цели квартала</span><span class="qg-ts">{quarterLabel(q).split(' ')[0]} · последняя отметка</span>
    <button class="qg-tl" onclick={() => goals.openGoals('*')}>Обзор ›</button>
  </div>
  {#each rows as { p, t } (p.key)}
    <button class="qg-tr" onclick={() => goals.openGoals(p.key)} title={tip(t) || undefined}>
      <span class="qg-av" style:background={p.color} aria-hidden="true">{p.ini}</span>
      <span class="qg-nm" class:me={p.src.me}>{p.name}</span>
      <span class="qg-n">{goalsCount(t.active)}</span>
      <span class="qg-ago" class:silent={t.silent.length > 0}>{agoWords(t.last, false)}</span>
    </button>
  {/each}
</div>

<style>
  .qg-th { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .qg-tn { font-weight: 700; }
  .qg-ts { color: var(--fg2); font-size: 12px; }
  .qg-tl { margin-left: auto; border: 0; background: none; padding: 0; font: inherit; font-size: 12px; color: var(--acc); }
  .qg-tl:hover { text-decoration: underline; }
  .qg-tr { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 32px; padding: 0; border: 0; border-top: 1px solid var(--line); background: none; color: var(--fg); font: inherit; text-align: left; }
  .qg-tr:hover .qg-nm { color: var(--acc); }
  .qg-av { flex: 0 0 20px; width: 20px; height: 20px; border-radius: 10px; color: #fff; font-size: 9.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .qg-nm { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .qg-nm.me { font-weight: 600; }
  .qg-n { font-size: 11.5px; color: var(--fg3); }
  .qg-ago { min-width: 84px; text-align: right; font-size: 12px; color: var(--fg2); }
  .qg-ago.silent { color: var(--wait); font-weight: 600; }
</style>
