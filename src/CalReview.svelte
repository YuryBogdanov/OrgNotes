<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from './store.svelte';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import CalDayList from './CalDayList.svelte';
  import { entriesWord, isoDay, monthTitle, monthWeeks, weekdayShort, type CalEntry } from './calIndex';

  // The calendar under the card of the Inbox review (ТЗ 24, part 3): folded by default, a compact month of the same
  // entries as the calendar tab (its layers and files), two in a cell and «… ещё N». The task's own date has a
  // dashed frame, and the task is «— эта задача» in the list of the day. No dragging: dates are set by the card.
  let { task }: { task: { path: string; line: number; date: Date | null } } = $props();

  const open = $derived(store.reviewCal);
  // the month of the task's date, else this month; leafing holds until the next card
  let month = $state(new Date());
  let shownFor = '';
  $effect(() => {
    const key = task.path + '|' + task.line + '|' + (task.date ? isoDay(task.date) : '');
    if (key === shownFor) return;
    shownFor = key;
    const d = task.date ?? new Date();
    month = new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const weeks = $derived(monthWeeks(month.getFullYear(), month.getMonth()));
  const days = $derived(store.calDays(weeks[0][0], weeks[weeks.length - 1][6]));
  const inMonth = $derived([...days].filter(([k]) => +k.slice(5, 7) === month.getMonth() + 1).reduce((n, [, v]) => n + v.length, 0));
  const today = isoDay(new Date());
  const mine = (e: CalEntry) => e.path === task.path && e.line === task.line;
  const mark = $derived(task.date ? isoDay(task.date) : '');
  const step = (n: number) => (month = new Date(month.getFullYear(), month.getMonth() + n, 1));

  // «… ещё N»: the list of the day, as in the calendar tab
  let pop = $state<{ day: string; at: { left: number; top: number } } | null>(null);
  let openT: ReturnType<typeof setTimeout> | undefined;
  let closeT: ReturnType<typeof setTimeout> | undefined;
  const placeOf = (el: HTMLElement) => {
    const r = ((el.closest('.cell') as HTMLElement) ?? el).getBoundingClientRect();
    return { left: r.left + 6, top: r.bottom - 8 };
  };
  function moreEnter(e: MouseEvent, day: string) {
    clearTimeout(closeT);
    const el = e.currentTarget as HTMLElement;
    openT = setTimeout(() => (pop = { day, at: placeOf(el) }), 300);
  }
  function moreLeave() {
    clearTimeout(openT);
    closeT = setTimeout(() => (pop = null), 300);
  }
  function moreClick(e: MouseEvent, day: string) {
    clearTimeout(openT);
    clearTimeout(closeT);
    pop = { day, at: placeOf(e.currentTarget as HTMLElement) };
  }
  onMount(() => () => {
    clearTimeout(openT);
    clearTimeout(closeT);
  });

  const wfOf = (e: CalEntry) => store.files.find((f) => f.path === e.path)?.wf;
  const toneOf = (e: CalEntry) => (e.keyword && wfOf(e) ? toneStyle(toneFor(e.keyword, wfOf(e)!)) : '');
  const title = (e: CalEntry) => (e.layer === 'deadline' ? `Дедлайн: ${e.title}` : `${e.priority ? `[#${e.priority}] ` : ''}${e.title}`);
</script>

<div class="rcal">
  <button class="toggle" aria-expanded={open} onclick={() => (store.reviewCal = !open)} title="{open ? 'Скрыть' : 'Показать'} календарь{store.keyHint('reviewCalendar') ? ' · ' + store.keyHint('reviewCalendar') : ''}">
    <svg class="chev" class:open width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg>
    <span class="tl">{open ? 'Скрыть календарь' : 'Показать календарь'}</span>
    <span class="sub">{monthTitle(month)} · {entriesWord(inMonth)}</span>
    {#if store.keyHint('reviewCalendar')}<kbd>{store.keyHint('reviewCalendar')}</kbd>{/if}
  </button>
  {#if open}
    <div class="rcard" role="region" aria-label="Календарь">
      <header>
        <b>{monthTitle(month)}</b>
        <div class="nav">
          <button aria-label="Назад" onclick={() => step(-1)}><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2L4 6l4 4" /></svg></button>
          <button class="today" onclick={() => (month = new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Сегодня</button>
          <button aria-label="Вперёд" onclick={() => step(1)}><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg></button>
        </div>
        <span class="legend">
          <span><i class="lg mine"></i>срок этой задачи</span>
          <span><i class="lg ev"></i>событие</span>
          <span><i class="lg dl"></i>дедлайн</span>
        </span>
      </header>
      <div class="wd">{#each [1, 2, 3, 4, 5, 6, 0] as i (i)}<span>{weekdayShort(i)}</span>{/each}</div>
      <div class="grid">
        {#each weeks as w, wi (wi)}
          <div class="row">
            {#each w as d (isoDay(d))}
              {@const k = isoDay(d)}
              {@const list = days.get(k) ?? []}
              {@const shown = list.length > 2 ? list.slice(0, 2) : list}
              <div class="cell" class:other={d.getMonth() !== month.getMonth()} class:we={d.getDay() === 0 || d.getDay() === 6} class:mark={k === mark} data-day={k}>
                <span class="num" class:today={k === today}>{d.getDate()}</span>
                {#each shown as e (e.path + e.line + e.layer + (e.time ?? ''))}
                  <button class="ch {e.layer}" class:mine={mine(e)} style={e.layer === 'task' || e.layer === 'wait' || e.layer === 'done' ? toneOf(e) : ''}
                    title="{title(e)} — {e.where}" onclick={(ev) => store.openCalEntry(e, ev.metaKey)}>
                    {#if e.layer === 'event' && e.time}<b class="tm">{e.time}</b>{:else if e.layer !== 'event' && e.layer !== 'deadline'}<span class="dot" aria-hidden="true"></span>{/if}
                    <span class="tx">{title(e)}</span>
                  </button>
                {/each}
                {#if list.length > shown.length}
                  <button class="more" class:open={pop?.day === k} onmouseenter={(ev) => moreEnter(ev, k)} onmouseleave={moreLeave} onclick={(ev) => moreClick(ev, k)}>… ещё {list.length - shown.length}</button>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
      <p class="foot">Показываются запланированные задачи, дедлайны и события из всех файлов — как в основном календаре.</p>
    </div>
  {/if}
</div>

{#if pop}
  {@const p = pop}
  <CalDayList day={p.day} entries={days.get(p.day) ?? []} at={p.at} mark={mine} onclose={() => (pop = null)} onenter={() => clearTimeout(closeT)} onleave={moreLeave} />
{/if}

<style>
  .rcal { width: 100%; max-width: 820px; margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
  .toggle { align-self: flex-start; display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg); font-size: 13px; }
  .chev { color: var(--fg2); transition: transform 0.12s; }
  .chev.open { transform: rotate(90deg); }
  .tl { font-weight: 600; }
  .sub { color: var(--fg2); }
  kbd { font: 10.5px var(--mono); padding: 0 4px; border: 1px solid var(--line); border-radius: 4px; color: var(--fg2); }
  .rcard { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1); overflow: hidden; }
  header { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  header b { font-size: 15px; }
  .nav { display: flex; gap: 4px; }
  .nav button { width: 26px; height: 24px; border: 0; border-radius: 6px; background: var(--field); color: var(--fg2); padding: 0; display: flex; align-items: center; justify-content: center; }
  .nav .today { width: auto; padding: 0 10px; color: var(--fg); font-size: 12px; }
  .legend { margin-left: auto; display: flex; flex-wrap: wrap; gap: 12px; font-size: 11.5px; color: var(--fg2); }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .lg { display: inline-block; width: 12px; height: 10px; border-radius: 3px; }
  .lg.mine { border: 1.5px dashed var(--ts); box-sizing: border-box; }
  .lg.ev { background: color-mix(in srgb, var(--acc) 30%, transparent); }
  .lg.dl { background: color-mix(in srgb, var(--todo) 30%, transparent); }
  .wd { display: flex; border-bottom: 1px solid var(--line); }
  .wd span { flex: 1; padding: 5px 8px; font-size: 11px; font-weight: 600; color: var(--fg2); }
  .row { display: flex; min-height: 86px; border-bottom: 1px solid var(--line); }
  .row:last-child { border-bottom: 0; }
  .cell { position: relative; flex: 1 1 0; min-width: 0; padding: 4px; display: flex; flex-direction: column; gap: 2px; border-right: 1px solid var(--line); overflow: hidden; }
  .cell:last-child { border-right: 0; }
  .cell.we { background: color-mix(in srgb, var(--fg) 2%, transparent); }
  .cell.other { background: color-mix(in srgb, var(--fg) 4%, transparent); }
  .cell.other .num { color: var(--fg3); }
  .cell.mark { outline: 1.5px dashed var(--ts); outline-offset: -3px; }
  .num { align-self: flex-end; min-width: 20px; height: 20px; padding: 0 4px; box-sizing: border-box; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 500; }
  .num.today { background: var(--acc); color: var(--onacc); font-weight: 700; }
  .ch { --tc: var(--tl, var(--next)); flex: 0 0 18px; height: 18px; width: 100%; display: flex; align-items: center; gap: 4px; padding: 0 5px; border: 0; border-radius: 4px; background: color-mix(in srgb, var(--tc) 14%, transparent); color: var(--fg); font-size: 11px; overflow: hidden; white-space: nowrap; text-align: left; }
  @media (prefers-color-scheme: dark) { .ch { --tc: var(--td, var(--next)); } }
  .ch .dot { flex: 0 0 6px; width: 6px; height: 6px; border-radius: 3px; background: var(--tc); }
  .ch.deadline { --tc: var(--todo); }
  .ch.event { background: color-mix(in srgb, var(--acc) 18%, transparent); }
  .ch.done { color: var(--fg3); }
  .ch.done .tx { text-decoration: line-through; }
  .ch.mine .tx { font-weight: 700; }
  .tm { flex: 0 0 auto; font-weight: 700; color: var(--acc); }
  .tx { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .more { align-self: flex-start; flex: 0 0 18px; height: 18px; padding: 0 5px; border: 0; border-radius: 4px; background: transparent; color: var(--fg2); font-size: 11px; font-weight: 600; }
  .more:hover, .more.open { background: var(--field); }
  .foot { margin: 0; padding: 8px 14px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); }
  @media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
</style>
