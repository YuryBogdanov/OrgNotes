<script lang="ts">
  import { cal as calendar } from './state.svelte';
  import { onMount } from 'svelte';
  import CalDayList from './DayList.svelte';
  import {
    fromIso, isoDay, layoutEvents, monthSub, monthTitle, monthWeeks, toneVars, weekDays, weekNumber, weekSub, weekdayShort, type CalEntry,
  } from '@panopticon/api/org';
  import type { CalState } from './state.svelte';

  // «Календарь» (ТЗ 24): a month or a week of every dated entry. The layers and the files are in the navigator, the
  // chosen day in the inspector. A cell shows what fits (three at least), the rest is behind «… ещё N».
  // the tab's state is ours: drawn once by the core, changed here and kept with the layout (`setState`)
  let { initial, setState }: { initial: CalState; setState: (s: CalState) => void } = $props();
  // svelte-ignore state_referenced_locally
  let cal = $state<CalState>(initial);
  const sel = $derived(fromIso(cal.date));
  const today = $derived(isoDay(new Date()));
  const cfg = $derived(calendar.cfg);
  const weeks = $derived(monthWeeks(sel.getFullYear(), sel.getMonth()));
  const allWeek = $derived(weekDays(sel));
  const range = $derived(cal.view === 'month' ? [weeks[0][0], weeks[weeks.length - 1][6]] : [allWeek[0], allWeek[6]]);
  // «Показывать выходные» off: Saturday and Sunday are left out of the grid
  const shownDays = (w: Date[]) => (cfg.weekends ? w : w.filter((d) => d.getDay() !== 0 && d.getDay() !== 6));
  const week = $derived(shownDays(allWeek));
  const days = $derived(calendar.days(range[0], range[1]));
  const at = (d: Date) => days.get(isoDay(d)) ?? [];

  const set = (c: Partial<CalState>) => {
    cal = { ...cal, ...c };
    setState(cal);
  };
  const pick = (d: Date) => {
    calendar.picked = null; // a click on a day, not on an entry: the entry chosen goes (ТЗ 34)
    set({ date: isoDay(d) });
  };
  /** A double click on a day (not on an entry): «+ Задача» on it. */
  function dbl(ev: MouseEvent, d: Date) {
    if ((ev.target as Element).closest('.ch, .more, .evb')) return;
    pick(d);
    calendar.openNew('task', isoDay(d));
  }
  function step(n: number) {
    const d = new Date(sel);
    if (cal.view === 'month') d.setMonth(d.getMonth() + n, Math.min(d.getDate(), 28));
    else d.setDate(d.getDate() + 7 * n);
    pick(d);
  }
  const move = (n: number) => pick(new Date(sel.getFullYear(), sel.getMonth(), sel.getDate() + n));

  // ---- «calendar.weekCell» (API 1.8): what the plugins put by a week's number --------------------------------------
  /** The week of a row (any of its days): its ISO year and number, its Monday, the view. */
  const cellOf = (d: Date, view: 'month' | 'week') => {
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    const thu = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 3);
    return { year: thu.getFullYear(), week: weekNumber(thu), monday: isoDay(mon), view };
  };
  type Cell = ReturnType<typeof cellOf>;
  function weekCell(node: HTMLElement, cell: Cell) {
    let key = JSON.stringify(cell);
    const h = calendar.ctx.ui.drawSlot(node, 'calendar.weekCell', cell);
    return {
      update(c: Cell) {
        if (JSON.stringify(c) === key) return;
        key = JSON.stringify(c);
        h.update(c);
      },
      destroy: () => h.dispose(),
    };
  }
  const thisWeek = $derived(cellOf(new Date(), 'month').monday);

  // ---- the size of a cell: how many entries fit (three at least) -------------------------------------------------
  let rowH = $state(112);
  // lines of 23 under the number; three entries at least, and «… ещё N» takes a line of its own
  const fits = $derived(Math.max(4, Math.floor((rowH - 34) / 23)));

  // ---- «… ещё N»: the list of the day, by the pointer (300 ms) or a click -----------------------------------------
  let pop = $state<{ day: string; at: { left: number; top: number } } | null>(null);
  let openT: ReturnType<typeof setTimeout> | undefined;
  let closeT: ReturnType<typeof setTimeout> | undefined;
  const placeOf = (el: HTMLElement) => {
    const cell = el.closest('.cell, .allday') as HTMLElement;
    const r = (cell ?? el).getBoundingClientRect();
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
    e.stopPropagation();
    clearTimeout(openT);
    clearTimeout(closeT);
    pop = { day, at: placeOf(e.currentTarget as HTMLElement) };
  }
  onMount(() => () => {
    clearTimeout(openT);
    clearTimeout(closeT);
  });

  // ---- the keyboard ------------------------------------------------------------------------------------------------
  let root: HTMLDivElement | undefined = $state();
  // the calendar is a list of tasks of the core (ТЗ 34): a click chooses an entry, the core's menu, keys, palette
  onMount(() => {
    if (!root) return;
    const tasks = calendar.ctx.ui.taskList(root, {
      selected: () => {
        const p = calendar.picked;
        const ref = calendar.pickedRef();
        return p && ref ? { ref, date: p.layer === 'event' ? 'event' : p.layer === 'deadline' ? 'DEADLINE' : 'SCHEDULED' } : null;
      },
      open: (other) => {
        const p = calendar.picked;
        if (p) calendar.openEntry(p, other);
      },
      clear: () => (calendar.picked = null),
    });
    calendar.tasks = tasks;
    return () => {
      tasks.dispose();
      if (calendar.tasks === tasks) calendar.tasks = null;
    };
  });
  /** A click on an entry: chosen, its day the chosen day; ⌘-click opens it in the neighbour pane, as before. */
  function choose(ev: MouseEvent, e: CalEntry) {
    ev.stopPropagation();
    if (ev.metaKey) return calendar.openEntry(e, true);
    calendar.pick(e);
    set({ date: e.day });
    root?.focus({ preventScroll: true });
  }
  function open(ev: MouseEvent, e: CalEntry) {
    ev.stopPropagation();
    calendar.openEntry(e);
  }
  function key(e: KeyboardEvent) {
    if (pop || (e.target as HTMLElement).closest('input, textarea')) return;
    // an entry chosen: ↑ ↓ go over the entries of its day; ← → to another day, as before (ТЗ 24), and let it go
    const p = calendar.picked;
    if (p?.day && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      const list = at(fromIso(p.day));
      const i = list.findIndex((x) => calendar.isPicked(x));
      const n = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) calendar.pick(n);
      return;
    }
    if (p && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) calendar.picked = null;
    const arrows: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      set({ view: cal.view === 'month' ? 'week' : 'month' });
    } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (arrows[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      move(arrows[e.key]);
    } else if (e.key === '.' && !e.metaKey) {
      e.preventDefault();
      pick(new Date());
    } else if ((e.key === 'n' || e.key === 'N' || e.code === 'KeyN') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      calendar.openNew('task', cal.date);
    } else if (e.key === 'Enter' && !e.metaKey) {
      const first = at(sel)[0];
      if (first) {
        e.preventDefault();
        calendar.openEntry(first);
      }
    }
  }

  // ---- the look of an entry ----------------------------------------------------------------------------------------
  const wfOf = (e: CalEntry) => calendar.files.find((f) => f.path === e.path)?.wf;
  const toneOf = (e: CalEntry) => (e.keyword && wfOf(e) ? toneVars(e.keyword, wfOf(e)!) : '');
  const past = (e: CalEntry) => e.day < today;
  const title = (e: CalEntry) => (e.layer === 'deadline' ? `Дедлайн: ${e.title}` : `${e.priority ? `[#${e.priority}] ` : ''}${e.title}`);
  const hours = $derived(Array.from({ length: cfg.to - cfg.from }, (_, i) => cfg.from + i));
  const HOUR = 48;
  let now = $state(new Date());
  onMount(() => {
    const t = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(t);
  });
  const nowTop = $derived(((now.getHours() - cfg.from) * 60 + now.getMinutes()) * (HOUR / 60));

  // ---- moving by the mouse (ТЗ 24, 2.6): a chip onto a day, an event onto a time; a repeat asks first ---------------
  let over = $state<string | null>(null); // the day (or «day time») under the drag
  let ask = $state<{ e: NonNullable<typeof calendar.drag>; to: Date; time?: string } | null>(null);
  const canDrag = (e: CalEntry) => e.layer !== 'done';
  function dragStart(ev: DragEvent, e: CalEntry) {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    calendar.drag = { path: e.path, line: e.line, layer: e.layer, repeat: e.repeat, title: e.title, dy: e.layer === 'event' && e.time ? ev.clientY - r.top : 0 };
    ev.dataTransfer?.setData('text/plain', e.title);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    pop = null;
  }
  const dragEnd = () => {
    calendar.drag = null;
    over = null;
  };
  function dragOver(ev: DragEvent, key: string) {
    if (!calendar.drag) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    over = key;
  }
  /** The time under the pointer in a day's column, by quarters of an hour (the grab's offset taken off). */
  function timeAt(ev: DragEvent, col: HTMLElement) {
    const y = ev.clientY - col.getBoundingClientRect().top - (calendar.drag?.dy ?? 0);
    const m = Math.min((cfg.to * 60) - 15, Math.max(cfg.from * 60, cfg.from * 60 + Math.round((y / HOUR) * 4) * 15));
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  function drop(ev: DragEvent, d: Date, time?: string) {
    const e = calendar.drag;
    dragEnd();
    if (!e) return;
    ev.preventDefault();
    if (e.repeat && cfg.askRepeat) ask = { e, to: d, time };
    else void calendar.move(e, d, time);
  }
  const hoverTime = (ev: DragEvent, d: Date) => dragOver(ev, `${isoDay(d)} ${timeAt(ev, ev.currentTarget as HTMLElement)}`);
</script>

{#snippet chip(e: CalEntry)}
  <button class="ch {e.layer}" class:past={past(e) && e.layer === 'event'} style={e.layer === 'task' || e.layer === 'wait' || e.layer === 'done' ? toneOf(e) : ''}
    draggable={canDrag(e)} ondragstart={(ev) => dragStart(ev, e)} ondragend={dragEnd}
    class:picked={calendar.isPicked(e)} title="{title(e)} — {e.where}" onclick={(ev) => choose(ev, e)} ondblclick={(ev) => open(ev, e)} oncontextmenu={(ev) => calendar.menuOf(ev, e)}>
    {#if e.layer === 'deadline'}
      <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17V3M5 4h10l-2 3 2 3H5" /></svg>
    {:else if e.layer !== 'event'}
      <span class="dot" aria-hidden="true"></span>
    {/if}
    {#if e.layer === 'event' && e.time}<b class="tm">{e.time}</b>{/if}
    <span class="tx">{title(e)}</span>
  </button>
{/snippet}

{#snippet wkNum(w: Date[])}
  {@const c = cellOf(w[0], 'month')}
  <div class="wk" class:now={c.monday === thisWeek}>
    <span title="Неделя {c.week}">{c.week}</span>
    <div class="wkslot" use:weekCell={c}></div>
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="cal" bind:this={root} tabindex="0" role="application" aria-label="Календарь" onkeydown={key}>
  <header>
    <div class="ttl">
      <div class="tline">
        <h1>{cal.view === 'month' ? monthTitle(sel) : `Неделя ${weekNumber(sel)}`}</h1>
        {#if cal.view === 'week'}<div class="hslot" use:weekCell={cellOf(sel, 'week')}></div>{/if}
      </div>
      <span>{cal.view === 'month' ? monthSub(sel) : weekSub(allWeek)}</span>
    </div>
    <div class="nav">
      <button aria-label="Назад" onclick={() => step(-1)}><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2L4 6l4 4" /></svg></button>
      <button class="today" onclick={() => pick(new Date())}>Сегодня</button>
      <button aria-label="Вперёд" onclick={() => step(1)}><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg></button>
    </div>
    <div class="seg" role="tablist" aria-label="Вид">
      <button role="tab" aria-selected={cal.view === 'month'} class:on={cal.view === 'month'} onclick={() => set({ view: 'month' })}>Месяц</button>
      <button role="tab" aria-selected={cal.view === 'week'} class:on={cal.view === 'week'} onclick={() => set({ view: 'week' })}>Неделя</button>
    </div>
  </header>

  {#if cal.view === 'month'}
    <div class="wd">{#if cfg.weekNumbers}<i class="wk"></i>{/if}{#each shownDays(weeks[0]) as d (d.getDay())}<span>{weekdayShort(d.getDay())}</span>{/each}</div>
    <div class="month">
      {#each weeks as w, wi (wi)}
        {#if wi === 0}
          <div class="row" bind:clientHeight={rowH}>
            {#if cfg.weekNumbers}{@render wkNum(w)}{/if}
            {#each shownDays(w) as d (isoDay(d))}{@render cell(d)}{/each}
          </div>
        {:else}
          <div class="row">
            {#if cfg.weekNumbers}{@render wkNum(w)}{/if}
            {#each shownDays(w) as d (isoDay(d))}{@render cell(d)}{/each}
          </div>
        {/if}
      {/each}
    </div>
  {:else}
    <div class="week">
      <div class="whead">
        <span class="gut"></span>
        {#each week as d (isoDay(d))}
          <button class="wh" class:selcol={isoDay(d) === cal.date} onclick={() => pick(d)}>
            <span>{weekdayShort(d.getDay())}</span><span class="wn" class:today={isoDay(d) === today}>{d.getDate()}</span>
          </button>
        {/each}
      </div>
      <div class="adrow">
        <span class="gut">весь день</span>
        {#each week as d (isoDay(d))}
          {@const all = at(d).filter((e) => !(e.layer === 'event' && e.time))}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="allday" class:selcol={isoDay(d) === cal.date} class:over={over === isoDay(d)} data-day={isoDay(d)} onclick={() => pick(d)} ondblclick={(ev) => dbl(ev, d)}
            ondragover={(ev) => dragOver(ev, isoDay(d))} ondragleave={() => (over = null)} ondrop={(ev) => drop(ev, d)}>
            {#each all.slice(0, all.length > 3 ? 2 : 3) as e (e.path + e.line + e.layer)}{@render chip(e)}{/each}
            {#if all.length > 3}
              <button class="more" onmouseenter={(ev) => moreEnter(ev, isoDay(d))} onmouseleave={moreLeave} onclick={(ev) => moreClick(ev, isoDay(d))}>… ещё {all.length - 2}</button>
            {/if}
          </div>
        {/each}
      </div>
      <div class="hours">
        <div class="hgrid" style="height:{hours.length * HOUR}px">
          <div class="hcol">{#each hours as h (h)}<span style="height:{HOUR}px">{h}:00</span>{/each}</div>
          {#each week as d (isoDay(d))}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="dcol" class:selcol={isoDay(d) === cal.date} class:we={d.getDay() === 0 || d.getDay() === 6} data-day={isoDay(d)} onclick={() => pick(d)}
              ondragover={(ev) => hoverTime(ev, d)} ondragleave={() => (over = null)} ondrop={(ev) => drop(ev, d, timeAt(ev, ev.currentTarget as HTMLElement))}>
              {#if over?.startsWith(isoDay(d) + ' ')}
                {@const t = over.slice(11)}
                <div class="droptime" style="top:{((+t.slice(0, 2) - cfg.from) * 60 + +t.slice(3)) * (HOUR / 60)}px" aria-hidden="true">{t}</div>
              {/if}
              {#each layoutEvents(at(d)) as x (x.e.path + x.e.line + x.e.time)}
                {@const top = Math.min(hours.length * HOUR - 18, Math.max(0, (x.start - cfg.from * 60) * (HOUR / 60)))}
                <button class="evb" class:past={past(x.e)} draggable="true" ondragstart={(ev) => dragStart(ev, x.e)} ondragend={dragEnd} style="top:{top}px;height:{Math.max(18, (x.end - x.start) * (HOUR / 60) - 2)}px;left:calc({(x.col / x.cols) * 100}% + 3px);width:calc({100 / x.cols}% - 6px)"
                  class:picked={calendar.isPicked(x.e)} title="{x.e.title} — {x.e.where}" onclick={(ev) => choose(ev, x.e)} ondblclick={(ev) => open(ev, x.e)} oncontextmenu={(ev) => calendar.menuOf(ev, x.e)}>
                  <b>{x.e.time}{x.e.end ? ` – ${x.e.end}` : ` – ${String(Math.floor(x.end / 60)).padStart(2, '0')}:${String(x.end % 60).padStart(2, '0')}`}</b>
                  <span>{x.e.title}</span>
                </button>
              {/each}
              {#if isoDay(d) === today && nowTop >= 0 && nowTop <= hours.length * HOUR}<div class="nowline" style="top:{nowTop}px" aria-hidden="true"></div>{/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

{#snippet cell(d: Date)}
  {@const k = isoDay(d)}
  {@const list = at(d)}
  {@const shown = list.length > fits ? list.slice(0, fits - 1) : list}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="cell" class:sel={k === cal.date} class:other={d.getMonth() !== sel.getMonth()} class:we={d.getDay() === 0 || d.getDay() === 6} class:over={over === k} data-day={k}
    onclick={() => pick(d)} ondblclick={(ev) => dbl(ev, d)} ondragover={(ev) => dragOver(ev, k)} ondragleave={() => (over = null)} ondrop={(ev) => drop(ev, d)}>
    <span class="num" class:today={k === today}>{d.getDate()}</span>
    {#each shown as e (e.path + e.line + e.layer + (e.time ?? ''))}{@render chip(e)}{/each}
    {#if list.length > shown.length}
      <button class="more" class:open={pop?.day === k} onmouseenter={(ev) => moreEnter(ev, k)} onmouseleave={moreLeave} onclick={(ev) => moreClick(ev, k)}>… ещё {list.length - shown.length}</button>
    {/if}
  </div>
{/snippet}

{#if pop}
  {@const p = pop}
  <CalDayList day={p.day} entries={days.get(p.day) ?? []} at={p.at} onclose={() => { pop = null; root?.focus(); }} onenter={() => clearTimeout(closeT)} onleave={moreLeave} />
{/if}

{#if ask}
  {@const a = ask}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal" onmousedown={() => (ask = null)}>
    <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Повторяющаяся запись" onmousedown={(e) => e.stopPropagation()}>
      <h2>Перенести повторяющуюся запись?</h2>
      <p>«{a.e.title}» повторяется. Перенесётся вся серия: следующие повторы пойдут от новой даты.</p>
      <div class="btns">
        <button onclick={() => { ask = null; root?.focus(); }}>Отмена</button>
        <!-- svelte-ignore a11y_autofocus -->
        <button class="primary-b" autofocus onclick={() => { const x = a; ask = null; void calendar.move(x.e, x.to, x.time); root?.focus(); }}>Перенести серию</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .cal { flex: 1; height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--bg); outline: none; } /* the whole tab of a plugin's view */
  header { flex: 0 0 auto; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
  .ttl { display: flex; flex-direction: column; }
  .tline { display: flex; align-items: center; gap: 8px; }
  h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
  .ttl span { font-size: 12.5px; color: var(--fg2); }
  .nav { display: flex; align-items: center; gap: 4px; margin-left: 8px; }
  .nav button { width: 28px; height: 26px; border: 0; border-radius: 6px; background: var(--field); color: var(--fg2); padding: 0; display: flex; align-items: center; justify-content: center; }
  .nav .today { width: auto; padding: 0 12px; color: var(--fg); font-size: 12.5px; }
  .seg { margin-left: auto; display: flex; padding: 2px; background: var(--field); border-radius: 8px; gap: 2px; }
  .seg button { border: 0; height: 24px; padding: 0 14px; border-radius: 6px; background: transparent; color: var(--fg2); font-size: 12.5px; font-weight: 500; }
  .seg button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); }
  .wd { flex: 0 0 auto; display: flex; border-bottom: 1px solid var(--line); }
  .wd span { flex: 1; padding: 6px 10px; font-size: 11.5px; font-weight: 600; color: var(--fg2); }
  .month { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; overflow: auto; }
  .row { flex: 1 1 112px; min-height: 112px; display: flex; border-bottom: 1px solid var(--line); }
  .cell { position: relative; flex: 1 1 0; min-width: 0; padding: 5px 5px 4px; display: flex; flex-direction: column; gap: 3px; border-right: 1px solid var(--line); overflow: hidden; }
  .cell.we { background: color-mix(in srgb, var(--fg) 2%, transparent); }
  .cell.other { background: color-mix(in srgb, var(--fg) 4%, transparent); }
  .cell.other .num { color: var(--fg3); }
  .cell.sel { background: var(--sel); box-shadow: inset 0 0 0 1.5px var(--acc); }
  .cell.over, .allday.over { background: color-mix(in srgb, var(--acc) 14%, transparent); box-shadow: inset 0 0 0 1.5px var(--acc); }
  .wk { flex: 0 0 28px; min-width: 0; box-sizing: border-box; padding-top: 8px; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; font-size: 10.5px; font-style: normal; color: var(--fg3); border-right: 1px solid var(--line); font-variant-numeric: tabular-nums; }
  .wk.now > span { color: var(--acc); font-weight: 700; }
  .wkslot, .hslot { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .hslot { flex-direction: row; align-self: center; }
  /* a plugin's piece by the numbers: the column wider */
  .month:has(:global(.wkslot > [data-plugin] > *)) .wk, .cal:has(:global(.wkslot > [data-plugin] > *)) .wd .wk { flex-basis: 32px; }
  .droptime { position: absolute; left: 2px; right: 2px; height: 0; border-top: 2px solid var(--acc); font-size: 10.5px; font-weight: 700; color: var(--acc); padding-left: 4px; pointer-events: none; z-index: 2; }
  .modal { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.25); }
  .dlg { width: 380px; max-width: calc(100vw - 32px); padding: 18px 20px 16px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35); }
  .dlg h2 { margin: 0 0 6px; font-size: 15px; }
  .dlg p { margin: 0; font-size: 13px; color: var(--fg2); line-height: 1.45; }
  .btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  .btns button { height: 28px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--field); color: var(--fg); font-size: 13px; }
  .btns .primary-b { background: var(--acc); color: var(--onacc); font-weight: 600; }
  .num { align-self: flex-end; min-width: 22px; height: 22px; padding: 0 5px; box-sizing: border-box; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; }
  .num.today, .wn.today { background: var(--acc); color: var(--onacc); font-weight: 700; }
  .cell.sel .num { font-weight: 700; }
  .ch { --tc: var(--tl, var(--next)); flex: 0 0 20px; height: 20px; width: 100%; display: flex; align-items: center; gap: 5px; padding: 0 6px; border: 0; border-radius: 5px; background: color-mix(in srgb, var(--tc) 14%, transparent); color: var(--fg); font-size: 11.5px; overflow: hidden; white-space: nowrap; text-align: left; }
  .ch .dot { flex: 0 0 6px; width: 6px; height: 6px; border-radius: 3px; background: var(--tc); }
  .ch.deadline { --tc: var(--todo); color: var(--fg); }
  .ch.deadline svg { flex: 0 0 10px; color: var(--todo); }
  .ch.event { background: color-mix(in srgb, var(--acc) 18%, transparent); }
  .ch.event.past { background: color-mix(in srgb, var(--acc) 8%, transparent); color: var(--fg3); }
  .ch.done .tx { text-decoration: line-through; }
  .ch.done { color: var(--fg3); }
  /* the entry chosen (ТЗ 34): a ring of the accent while the calendar has the focus, grey otherwise */
  .ch.picked, .evb.picked { box-shadow: inset 0 0 0 1.5px var(--acc); }
  .cal:not(:focus-within) :is(.ch, .evb).picked { box-shadow: inset 0 0 0 1.5px var(--fg3); }
  .tm { flex: 0 0 auto; font-weight: 700; color: var(--acc); }
  .past .tm { color: var(--fg3); }
  .tx { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .more { align-self: flex-start; flex: 0 0 20px; height: 20px; padding: 0 6px; border: 0; border-radius: 5px; background: transparent; color: var(--fg2); font-size: 11.5px; font-weight: 600; }
  .more:hover, .more.open { background: var(--field); }
  .ch:focus-visible, .more:focus-visible, .evb:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .week { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
  .whead, .adrow { flex: 0 0 auto; display: flex; border-bottom: 1px solid var(--line); }
  .gut { flex: 0 0 52px; padding: 8px 6px 0 0; text-align: right; font-size: 10.5px; color: var(--fg3); box-sizing: border-box; }
  .wh { flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 7px; padding: 8px; border: 0; border-left: 1px solid var(--line); background: transparent; color: var(--fg2); font-size: 12px; }
  .wn { min-width: 26px; height: 26px; padding: 0 6px; box-sizing: border-box; border-radius: 13px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: var(--fg); }
  .adrow { min-height: 56px; }
  .allday { position: relative; flex: 1 1 0; min-width: 0; padding: 5px; display: flex; flex-direction: column; gap: 3px; border-left: 1px solid var(--line); }
  .selcol { background: var(--sel); }
  .hours { flex: 1 1 0; min-height: 0; overflow: auto; }
  .hgrid { display: flex; box-sizing: content-box; padding-top: 8px; } /* room for «8:00» above its line */
  .hcol { flex: 0 0 52px; display: flex; flex-direction: column; }
  .hcol span { box-sizing: border-box; padding-right: 8px; text-align: right; font-size: 10.5px; color: var(--fg3); transform: translateY(-7px); }
  .dcol { position: relative; flex: 1 1 0; min-width: 0; border-left: 1px solid var(--line); background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 47px, var(--line) 47px, var(--line) 48px); }
  .dcol.we:not(.selcol) { background-color: color-mix(in srgb, var(--fg) 2%, transparent); }
  .evb { position: absolute; box-sizing: border-box; padding: 4px 7px; border: 0; border-radius: 6px; background: color-mix(in srgb, var(--acc) 22%, transparent); color: var(--fg); overflow: hidden; display: flex; flex-direction: column; gap: 1px; text-align: left; }
  .evb b { font-size: 11px; color: var(--acc); }
  .evb span { font-size: 12px; font-weight: 500; }
  .evb.past { background: color-mix(in srgb, var(--acc) 10%, transparent); color: var(--fg3); }
  .nowline { position: absolute; left: 0; right: 0; height: 2px; background: var(--todo); pointer-events: none; }
  .nowline::before { content: ''; position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 4px; background: var(--todo); }
</style>
