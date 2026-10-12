<script lang="ts">
  import { store } from './store.svelte';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import { dayTitle, entriesIn, fromIso, isoDay, sortDay, type CalEntry } from './calIndex';
  import { relWords } from './calendar';

  // The inspector while a calendar tab is shown (ТЗ 24): the chosen day — its entries as cards, and the deadlines
  // ahead of it.
  const c = $derived(store.tab?.calendar);
  const day = $derived(c ? fromIso(c.date) : new Date());
  const list = $derived(c ? (store.calDays(day, day).get(c.date) ?? []) : []);
  const ahead = $derived.by(() => {
    if (!c) return [] as CalEntry[];
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const to = new Date(day.getFullYear(), day.getMonth() + 3, day.getDate());
    const hidden = new Set(store.calHiddenNow);
    return sortDay(entriesIn(store.files.filter((f) => !hidden.has(f.name)), from, to).filter((e) => e.layer === 'deadline'))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(0, 3);
  });
  const wfOf = (e: CalEntry) => store.files.find((f) => f.path === e.path)?.wf;
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const when = (iso: string) => {
    const d = fromIso(iso);
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WD[d.getDay()]}`;
  };
</script>

<section class="day" aria-label="Выбранный день">
  <div class="cap">ВЫБРАННЫЙ ДЕНЬ</div>
  <div class="dt">{dayTitle(day)}</div>
  <div class="rel">{relWords(day)}</div>
  <div class="cards">
    {#each list as e (e.path + e.line + e.layer + (e.time ?? ''))}
      <button class="card" class:done={e.layer === 'done'} onclick={(ev) => store.openCalEntry(e, ev.metaKey)}>
        {#if e.layer === 'event'}
          <span class="tm">{e.time ?? 'весь день'}</span>
        {:else if e.layer === 'deadline'}
          <span class="kw dl">СРОК</span>
        {:else}
          <span class="kw tone-chip" style={e.keyword && wfOf(e) ? toneStyle(toneFor(e.keyword, wfOf(e)!)) : ''}>{e.keyword}</span>
        {/if}
        <span class="tt"><span class="t">{#if e.priority}<b class="pr">[#{e.priority}]</b>{' '}{/if}{e.title}</span><span class="w">{e.where}</span></span>
      </button>
    {:else}
      <p class="none">На этот день ничего нет</p>
    {/each}
  </div>
  {#if ahead.length}
    <div class="sep"></div>
    <div class="cap">ВПЕРЕДИ</div>
    {#each ahead as e (e.path + e.line + e.day)}
      <button class="ah" onclick={() => store.openCalEntry(e)}><span>Дедлайн: {e.title}</span><span class="w">{when(e.day)}</span></button>
    {/each}
  {/if}
</section>

<style>
  .day { display: flex; flex-direction: column; gap: 6px; padding: 14px; overflow: auto; }
  .cap { font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .dt { font-size: 16px; font-weight: 700; }
  .rel { font-size: 12px; color: var(--fg2); margin-bottom: 8px; }
  .cards { display: flex; flex-direction: column; gap: 6px; }
  .card { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; color: var(--fg); text-align: left; }
  .card.done .t { text-decoration: line-through; color: var(--fg3); }
  .tm { flex: 0 0 auto; font-family: var(--mono); font-size: 11.5px; color: var(--acc); font-weight: 700; }
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .kw.dl { color: var(--todo); background: color-mix(in srgb, var(--todo) 16%, transparent); }
  .tt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .t { font-weight: 500; }
  .pr { color: var(--wait); }
  .w { font-size: 11.5px; color: var(--fg2); }
  .none { margin: 0; color: var(--fg2); font-size: 12.5px; }
  .sep { height: 1px; background: var(--line); margin: 8px 0; }
  .ah { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 4px 0; border: 0; background: transparent; color: var(--fg); text-align: left; }
</style>
