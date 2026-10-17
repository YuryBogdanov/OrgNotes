<script lang="ts">
  import { untrack } from 'svelte';
  import { plugins } from '../api/host.svelte';
  import { iconOf } from '../api/manifest';
  import { store } from '../store.svelte';
  import { allDays, openEntry } from '../calOpen';
  import { isoDay, monthWeeks, type CalEntry } from '../calIndex';
  import { lsGet, lsSet } from '../storage';
  import { fileReview } from './fileReview.svelte';

  // «Календарь» under the review's card in the file (ТЗ 46 §6): its head — the calendar's icon, «Календарь», the month
  // grey, ‹ › to leaf; a small month — days of 10.5 pt in cells of 22, today framed `lampline`, the past `ink3` at 60%,
  // a dot of 4 pt `next` under a day with entries (of the layers and files the calendar shows), the card's own day in
  // a dashed frame. A click on a day: its entries and «Отложить сюда» (the review's `calendar.defer`). Folds on a click
  // on its head, and by the review's key (⌘K); kept on this Mac.
  const r = $derived(fileReview.run);
  const c = $derived(fileReview.card);
  const spec = $derived(r?.spec.calendar);
  const icon = $derived(iconOf(plugins.manifest('calendar') ?? ({ contributes: { navSections: [], views: [], fileViews: [] } } as never)) ?? 'M3 5h14v12H3zM3 9h14M7 3v4M13 3v4');
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: { y: number; m: number; d: number }) => `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  const mark = $derived.by(() => {
    if (!c || !r || !spec) return '';
    if (spec.date) return plugins.guard(r.plugin, () => spec.date!(c.info), null) ?? '';
    const d = c.info.scheduled ?? c.info.deadline;
    return d ? iso(d) : '';
  });
  // the month of the card's day, else this one; leafing holds till the next card
  let month = $state(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  $effect(() => {
    const m = mark;
    void c?.info.ref.line;
    untrack(() => {
      const d = m ? new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1) : new Date();
      month = new Date(d.getFullYear(), d.getMonth(), 1);
    });
  });
  const MON = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const weeks = $derived(monthWeeks(month.getFullYear(), month.getMonth()));
  const days = $derived.by(() => {
    void store.files;
    return allDays(weeks[0][0], weeks[weeks.length - 1][6]);
  });
  const today = $derived(isoDay(store.today));
  const step = (n: number) => (month = new Date(month.getFullYear(), month.getMonth() + n, 1));

  let folded = $state(lsGet('next:reviewCalFolded') === '1');
  function toggle() {
    folded = !folded;
    lsSet('next:reviewCalFolded', folded ? '1' : '0');
  }
  $effect(() => {
    fileReview.calToggle = toggle;
    return () => {
      if (fileReview.calToggle === toggle) fileReview.calToggle = null;
    };
  });
  const key = $derived(spec?.command ? store.keyHint(spec.command) : '');

  // a day's list
  let pop = $state<{ day: string; date: Date; x: number; y: number } | null>(null);
  function pick(e: MouseEvent, d: Date) {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const day = isoDay(d);
    pop = pop?.day === day ? null : { day, date: d, x: Math.max(8, b.left - 248), y: b.top - 6 };
  }
  const entries = $derived<CalEntry[]>(pop ? (days.get(pop.day) ?? []) : []);
  const ofCard = (e: CalEntry) => !!c && e.path === c.file.path && e.line === c.heading.line;
  async function deferHere() {
    const p = pop;
    pop = null;
    if (!p || !r || !c || !spec?.defer) return;
    const info = c.info;
    try {
      await spec.defer(info, p.date);
    } catch (err) {
      plugins.guard(r.plugin, () => {
        throw err;
      }, undefined);
    }
  }
  $effect(() => {
    void c?.info.ref.title;
    untrack(() => (pop = null));
  });
  const dayLabel = (d: Date) => `${['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()]}, ${d.getDate()} ${['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][d.getMonth()]}`;
</script>

<svelte:window onkeydown={(e) => { if (pop && e.key === 'Escape') { e.preventDefault(); pop = null; } }} />

<section class="cal" aria-label="Календарь">
  <div class="head">
    <button class="fold" aria-expanded={!folded} onclick={toggle} title={key ? `Свернуть / развернуть · ${key}` : undefined}>
      <svg class="ic" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icon} /></svg>
      <span class="t">Календарь</span><span class="m">{MON[month.getMonth()]}{month.getFullYear() !== store.today.getFullYear() ? ` ${month.getFullYear()}` : ''}</span>
    </button>
    {#if !folded}
      <button class="nav" aria-label="Предыдущий месяц" onclick={() => step(-1)}>‹</button>
      <button class="nav" aria-label="Следующий месяц" onclick={() => step(1)}>›</button>
    {/if}
    <button class="chev" aria-hidden="true" tabindex="-1" onclick={toggle}>{folded ? '›' : '⌄'}</button>
  </div>
  {#if !folded}
    <div class="grid" role="grid" aria-label="Месяц">
      <div class="wk" role="row">{#each WD as w (w)}<span role="columnheader">{w}</span>{/each}</div>
      {#each weeks as week (isoDay(week[0]))}
        <div class="wk" role="row">
          {#each week as d (isoDay(d))}
            {@const k = isoDay(d)}
            {#if d.getMonth() !== month.getMonth()}
              <span class="cell out" role="gridcell"></span>
            {:else}
              <button class="cell" role="gridcell" class:today={k === today} class:past={k < today} class:mine={k === mark} class:on={pop?.day === k}
                aria-label="{dayLabel(d)}{days.get(k)?.length ? `, записей: ${days.get(k)!.length}` : ''}" onclick={(e) => pick(e, d)}>
                {d.getDate()}{#if days.get(k)?.length}<i aria-hidden="true"></i>{/if}
              </button>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</section>

{#if pop}
  <div class="pop" role="dialog" aria-label="День {dayLabel(pop.date)}" style:left="{pop.x}px" style:top="{pop.y}px">
    <div class="ph">{dayLabel(pop.date)}</div>
    {#each entries as e (e.path + ':' + e.line + ':' + e.layer)}
      <button class="ent" class:me={ofCard(e)} onclick={() => { pop = null; openEntry(e, true); }}>
        {#if e.time}<span class="tm">{e.time}</span>{/if}<span class="et">{e.title}</span>{#if ofCard(e)}<span class="me">эта задача</span>{/if}
      </button>
    {:else}
      <p class="none">Записей нет</p>
    {/each}
    {#if spec?.defer}<button class="here" onclick={() => void deferHere()}>Отложить сюда</button>{/if}
  </div>
{/if}

<style>
  .cal { margin-bottom: 10px; border: 1px solid var(--rule); border-radius: 10px; background: var(--panel); color: var(--ink); font: 12px/1.4 var(--ui); overflow: hidden; }
  .head { height: 30px; display: flex; align-items: center; gap: 2px; padding: 0 6px 0 0; }
  .fold { flex: 1; min-width: 0; height: 30px; display: flex; align-items: center; gap: 7px; padding: 0 0 0 10px; border: 0; background: none; color: var(--ink); text-align: left; cursor: default; }
  .ic { flex: 0 0 15px; color: var(--plug); }
  .t { font-weight: 600; }
  .m { color: var(--ink3); }
  .nav, .chev { width: 20px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: none; color: var(--ink3); font: 13px var(--ui); }
  .nav:hover { background: var(--chip); color: var(--ink); }
  .chev { font-size: 12px; }
  .fold:focus-visible, .nav:focus-visible, .cell:focus-visible, .ent:focus-visible, .here:focus-visible { outline: 2px solid var(--lamp); outline-offset: -1px; border-radius: 5px; }
  .grid { padding: 0 8px 8px; }
  .wk { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .wk span[role='columnheader'] { height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--ink3); }
  .cell { position: relative; height: 22px; display: flex; align-items: center; justify-content: center; padding: 0; border: 1px solid transparent; border-radius: 6px; background: none; color: var(--ink); font: 10.5px var(--ui); font-variant-numeric: tabular-nums; cursor: default; }
  .cell.out { border: 0; }
  .cell:hover, .cell.on { background: var(--chip); }
  .cell.past { color: color-mix(in srgb, var(--ink3) 60%, transparent); }
  .cell.today { border-color: var(--lampline); font-weight: 600; }
  .cell.mine { border: 1px dashed var(--next); }
  .cell i { position: absolute; bottom: 1px; left: 50%; width: 4px; height: 4px; margin-left: -2px; border-radius: 2px; background: var(--next); }
  .pop { position: fixed; z-index: 30; width: 240px; max-height: 320px; overflow: auto; padding: 6px; box-sizing: border-box; border: 1px solid var(--rule); border-radius: 10px; background: var(--card); box-shadow: var(--popshadow); color: var(--ink); font: 12px var(--ui); }
  .ph { padding: 4px 6px 6px; font-weight: 600; }
  .ent { width: 100%; display: flex; align-items: baseline; gap: 6px; padding: 5px 6px; border: 0; border-radius: 6px; background: none; color: var(--ink); text-align: left; font: 12px var(--ui); }
  .ent:hover { background: var(--chip); }
  .tm { color: var(--ink3); font-variant-numeric: tabular-nums; }
  .et { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ent .me, .ent.me .et { color: var(--lampink); }
  .none { margin: 0; padding: 4px 6px; color: var(--ink3); }
  .here { width: 100%; height: 28px; margin-top: 6px; border: 0; border-radius: 7px; background: var(--lamp); color: var(--onlamp); font: 600 12px var(--ui); }
</style>
