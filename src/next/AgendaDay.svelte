<script lang="ts">
  import { untrack } from 'svelte';
  import { store } from '../store.svelte';
  import { openFile, newTab } from '../layout';
  import { plugins } from '../api/host.svelte';
  import { dayTitle, isoDay, monthTitle, weekNumber } from '../calIndex';
  import { dayOf, horizonDate, horizonOf, weekCounts, weekOf, type DayRow } from '../agendaDay';
  import { doneStatus, overdue } from '../today';
  import { firstOpen, sequenceFor, toneFor } from '../org';
  import { toneStyle } from '../colors';
  import { displayName } from '../names';
  import { today } from '../todayState.svelte';
  import { lists, type DateKind } from '../taskLists.svelte';
  import ListToast from './ListToast.svelte';

  // The built-in «Агенда» in the mode «День» (ТЗ 45 §3.2), in place of the list of the next 30 days: the day chosen —
  // its kicker, its title in Yeseva One 40; ‹ ›, «Сегодня», «День / Неделя / Месяц» (the last two the calendar's views,
  // in this tab; none without the plugin); the week strip; on the left the entries with a time as chips, «Запланировано»,
  // «Просрочено» (on today); on the right «Горизонт» — the 30 days after it. ↑↓ over the rows, ← → the day, «.» today, ↩
  // opens, ⌘↩ opens behind it, ⌘↓ «Неделя»; the rows are a list of tasks (ТЗ 34): their menu and keys.
  let { pane = 0 }: { pane?: number } = $props();
  const files = $derived(store.agendaFiles);
  const mid = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // the day it opens on: the calendar's chosen day when it came back from there (ТЗ 47 §1.6), else today
  const startDay = () => {
    const d = (store.layout.panes[pane]?.tabs[store.layout.panes[pane].active]?.data as { date?: string } | undefined)?.date;
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) : mid(store.today);
  };
  let day = $state(startDay());
  const now = $derived(today.now);
  const week = $derived(weekOf(day));
  const counts = $derived(weekCounts(files, week));
  const model = $derived(dayOf(files, day, now));
  const late = $derived(model.isToday ? overdue(files, day) : []);
  const horizon = $derived(horizonOf(files, day));
  const cal = $derived(plugins.live('calendar'));
  const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  const tone = (kw: string | null, path: string) => {
    const f = files.find((x) => x.path === path);
    return f && kw ? toneStyle(toneFor(kw, f.wf)) : '';
  };
  const shift = (n: number) => (day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + n));
  const toToday = () => (day = mid(store.today));

  // ---- the rows: the planned ones and the overdue, one list of tasks ----
  type Row = { key: string; path: string; line: number; title: string; kw: string | null; done: boolean; dk: DateKind };
  const rows = $derived<Row[]>([
    ...model.planned.map((r: DayRow) => ({ key: 'p|' + r.key, path: r.path, line: r.line, title: r.title, kw: r.kw, done: r.done, dk: r.dk as DateKind })),
    ...late.map((r) => ({ key: `o|${r.path}|${r.line}`, path: r.path, line: r.line, title: r.title, kw: r.kw, done: false, dk: r.kind as DateKind })),
  ]);
  let sel = $state('');
  const chosen = $derived(rows.find((r) => r.key === sel) ?? null);
  $effect(() => {
    void day.getTime();
    untrack(() => (sel = ''));
  });
  let el: HTMLDivElement | undefined = $state();
  const listId = $derived('agendaDay:' + pane);

  function open(path: string, line: number, behind = false) {
    const p = store.layout.panes[pane];
    const back = p?.active ?? 0;
    openFile(store.layout, pane, path, line, { focus: !behind });
    if (behind && p) p.active = back;
    else store.layout.active = pane;
  }
  async function tick(r: Row) {
    const f = files.find((x) => x.path === r.path);
    if (!f || !r.kw) return;
    const to = r.done ? firstOpen(sequenceFor(f.wf, r.kw)) : doneStatus(r.kw, f.wf);
    if (to) await store.transaction(r.done ? 'Вернуть задачу' : 'Задача выполнена', (tx) => tx.setStatus({ path: r.path, line: r.line, title: r.title }, to));
  }
  /** «Неделя», «Месяц»: the calendar's view of the day chosen, in this tab. */
  function showAs(view: 'week' | 'month') {
    const p = store.layout.panes[pane];
    if (!p) return;
    p.tabs[p.active] = { ...newTab('calendar.view' as never), data: { view, date: isoDay(day), back: 'agenda' } };
  }
  function keydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    const plain = !e.shiftKey && !e.altKey && !e.ctrlKey;
    if (plain && e.metaKey && e.key === 'ArrowDown' && cal) return (e.preventDefault(), showAs('week'));
    if (!plain || e.metaKey) {
      if (e.metaKey && e.key === 'Enter' && chosen) (e.preventDefault(), open(chosen.path, chosen.line, true));
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') return (e.preventDefault(), shift(e.key === 'ArrowLeft' ? -1 : 1));
    if (e.key === '.') return (e.preventDefault(), toToday());
    if (e.key === 'Enter' && chosen) return (e.preventDefault(), open(chosen.path, chosen.line));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return;
      e.preventDefault();
      const i = rows.findIndex((r) => r.key === sel);
      sel = rows[i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].key;
      queueMicrotask(() => el?.querySelector<HTMLElement>('[data-k].sel')?.scrollIntoView({ block: 'nearest' }));
    }
  }
  function menu(e: MouseEvent, k: string) {
    sel = k;
    const sp = lists.spec(listId);
    if (sp) queueMicrotask(() => lists.openMenu(e, sp));
    e.preventDefault();
  }
  $effect(() => {
    const id = 'agendaDay:' + pane;
    return untrack(() =>
      lists.register({
        id,
        el: () => el,
        tab: () => store.layout.panes[pane]?.tabs[store.layout.panes[pane].active],
        selected: () => (chosen ? { path: chosen.path, line: chosen.line, title: chosen.title, dk: chosen.dk } : null),
        open: (other) => chosen && open(chosen.path, chosen.line, other),
        clear: () => (sel = ''),
        refresh: () => {},
        freeze: () => {},
      }),
    );
  });
</script>

{#snippet cap(kw: string | null, path: string)}
  {#if kw}<span class="cap" style={tone(kw, path)}>{kw}</span>{/if}
{/snippet}

{#snippet row(r: Row, chip: string | null)}
  <div class="row" class:done={r.done}>
    <button class="box" role="checkbox" aria-checked={r.done} aria-label="Выполнено: {r.title}" onclick={() => void tick(r)}>{#if r.done}✓{/if}</button>
    <button class="rb" class:sel={sel === r.key} data-k={r.key} onclick={() => (sel = r.key)} ondblclick={() => open(r.path, r.line)} oncontextmenu={(e) => menu(e, r.key)}>
      {@render cap(r.kw, r.path)}<span class="t">{r.title}</span>{#if chip}<span class="chip red">{chip}</span>{/if}
      <span class="file">{displayName(files.find((f) => f.path === r.path)?.name ?? '')}</span>
    </button>
  </div>
{/snippet}

<div class="host">
<!-- the screen is a list of tasks: ↑↓ move in its rows, ← → the day (ТЗ 34, 45) -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="aday" role="region" aria-label="Агенда" tabindex="-1" bind:this={el} onkeydown={keydown}>
  <header>
    <div class="ttl">
      <div class="kick">Неделя {weekNumber(day)} · {monthTitle(day)}</div>
      <h1>{dayTitle(day)}</h1>
    </div>
    <span class="nav">
      <button class="ib" aria-label="Предыдущий день" onclick={() => shift(-1)}>‹</button>
      <button class="ib" aria-label="Следующий день" onclick={() => shift(1)}>›</button>
    </span>
    <button class="btn" onclick={toToday}>Сегодня</button>
    {#if cal}
      <span class="seg" role="radiogroup" aria-label="Вид">
        <button role="radio" aria-checked="true" class="on">День</button>
        <button role="radio" aria-checked="false" onclick={() => showAs('week')}>Неделя</button>
        <button role="radio" aria-checked="false" onclick={() => showAs('month')}>Месяц</button>
      </span>
    {/if}
  </header>

  <div class="strip" role="group" aria-label="Неделя">
    {#each week as d, i (+d)}
      {@const on = +d === +day}
      <button class="wd" class:on aria-pressed={on} aria-label={dayTitle(d)} onclick={() => (day = d)}>
        <span class="wn">{WD[d.getDay()]}</span><span class="wdn">{d.getDate()}</span>
        <span class="dots" aria-hidden="true">{#each { length: Math.min(5, counts[i]) } as _, k (k)}<i></i>{/each}</span>
      </button>
    {/each}
  </div>

  <div class="cols">
    <div class="left">
      {#if model.timed.length}
        <div class="timed" role="group" aria-label="Со временем">
          <span class="lbl">Со временем</span>
          {#each model.timed as t (t.key)}
            <button class="tchip" class:past={t.past} onclick={() => open(t.path, t.line)}>{#if t.now}<span class="nowdot">●</span> {/if}{t.time} {t.title}</button>
          {/each}
        </div>
      {/if}
      <section aria-label="Запланировано">
        <div class="sh"><b>Запланировано</b><span>{model.planned.length}</span></div>
        {#each model.planned as r (r.key)}
          {@render row({ key: 'p|' + r.key, path: r.path, line: r.line, title: r.title, kw: r.kw, done: r.done, dk: r.dk }, r.chip)}
        {:else}
          <div class="none">На этот день ничего не запланировано</div>
        {/each}
      </section>
      {#if late.length}
        <section aria-label="Просрочено">
          <div class="sh red"><b>Просрочено</b><span>{late.length}</span></div>
          {#each late as r (r.path + r.line)}
            {@render row({ key: `o|${r.path}|${r.line}`, path: r.path, line: r.line, title: r.title, kw: r.kw, done: false, dk: r.kind }, `${r.late} дн.`)}
          {/each}
        </section>
      {/if}
    </div>
    <aside class="hz" aria-label="Горизонт">
      <div class="sh"><b>Горизонт</b><span>30 дней</span></div>
      <div class="line">
        {#each horizon as h (+h.day)}
          <div class="hd">
            <span class="hdot" class:due={h.due} aria-hidden="true"></span>
            <div class="hdate">{horizonDate(h, day)}</div>
            {#each h.items as it (it.key)}
              <button class="hi" onclick={() => open(it.path, it.line)}>{#if it.kw}{@render cap(it.kw, it.path)}{:else if it.layer === 'event'}<span class="cap ev">СОБ.</span>{/if}<span class="t">{it.title}</span></button>
            {/each}
          </div>
        {:else}
          <div class="none">В ближайшие 30 дней ничего нет</div>
        {/each}
      </div>
    </aside>
  </div>
</div>
<ListToast list={listId} />
</div>

<style>
  .host { position: relative; height: 100%; container-type: inline-size; }
  .aday { height: 100%; overflow: auto; box-sizing: border-box; padding: 30px 40px 32px; color: var(--ink); font: 13px/1.45 var(--ui); background-color: var(--bg);
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 24px 24px; background-position: -1px -1px; }
  .aday:focus { outline: none; }
  header { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
  .ttl { flex: 1 1 auto; min-width: 0; }
  .kick { margin-bottom: 8px; font: 500 11px var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink3); }
  h1 { margin: 0; font: 400 40px/1.05 var(--title); }
  .nav { display: flex; gap: 2px; }
  .ib { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--ink2); font: 16px var(--ui); }
  .ib:hover { background: var(--chip); }
  .btn { height: 28px; padding: 0 12px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); }
  .seg { display: flex; gap: 2px; padding: 2px; border-radius: 7px; background: var(--chip); }
  .seg button { height: 24px; padding: 0 12px; border: 0; border-radius: 5px; background: none; color: var(--ink2); font: 12.5px var(--ui); }
  .seg button.on { background: var(--segon); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); }
  button:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }

  .strip { display: flex; gap: 6px; max-width: 760px; margin-bottom: 6px; }
  .wd { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 0; border: 0; border-radius: 8px; background: none; color: var(--ink); }
  .wd:hover { background: var(--chip); }
  .wd.on { background: var(--lampsoft); color: var(--lampink); }
  .wn { font-size: 11px; font-weight: 600; color: var(--ink3); }
  .wd.on .wn { color: var(--lampink); }
  .wdn { font: 400 22px/1 var(--title); }
  .dots { display: flex; gap: 3px; height: 4px; }
  .dots i { width: 4px; height: 4px; border-radius: 2px; background: var(--ink3); }
  .wd.on .dots i { background: var(--lamp); }

  .cols { display: flex; gap: 56px; align-items: flex-start; }
  .left { flex: 1; min-width: 0; max-width: 720px; }
  .timed { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
  .lbl { margin-right: 4px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  .tchip { height: 24px; display: inline-flex; align-items: center; gap: 4px; padding: 0 8px; border: 0; border-radius: 6px; background: var(--chip); color: var(--ink2); font: 12px var(--ui); white-space: nowrap; }
  .tchip.past { opacity: 0.55; }
  .nowdot { color: var(--lampink); }
  section { margin-top: 22px; }
  .sh { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .sh b { font-size: 15px; font-weight: 600; }
  .sh span { font-size: 12px; color: var(--ink3); }
  .sh.red b { color: var(--todo); }
  .none { padding: 8px 0; color: var(--ink3); }

  .row { display: flex; align-items: center; gap: 11px; min-height: 40px; border-bottom: 1px solid var(--rule); }
  .row.done { opacity: 0.45; }
  .row.done .t { text-decoration: line-through; }
  .box { flex: 0 0 16px; width: 16px; height: 16px; box-sizing: border-box; padding: 0; border-radius: 4px; border: 1.5px solid var(--ink3); background: transparent; display: flex; align-items: center; justify-content: center; color: var(--card); font-size: 10px; font-weight: 800; }
  .row.done .box { border-color: var(--done); background: var(--done); }
  .rb { flex: 1; min-width: 0; height: 40px; display: flex; align-items: center; gap: 11px; margin: 0 -10px 0 -4px; padding: 0 10px 0 4px; border: 0; border-radius: 7px; background: none; color: inherit; font: inherit; text-align: left; cursor: default; }
  .rb.sel { background: var(--chip); }
  .aday:focus-within .rb.sel { background: var(--lampsoft); }
  .rb:focus { outline: none; }
  .cap { flex: 0 0 auto; display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 4px; font: 700 10.5px var(--ui); letter-spacing: 0.02em; white-space: nowrap; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .cap.ev { color: var(--lampink); background: var(--lampsoft); }
  .t { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 14px; }
  .chip { flex: 0 0 auto; height: 20px; display: inline-flex; align-items: center; padding: 0 7px; border-radius: 5px; background: var(--chip); font-size: 11.5px; white-space: nowrap; }
  .chip.red { color: var(--todo); }
  .file { margin-left: auto; flex: 0 0 auto; font-size: 11.5px; color: var(--ink3); white-space: nowrap; }

  .hz { flex: 0 0 300px; width: 300px; padding-top: 14px; }
  .hz .sh { margin-bottom: 14px; }
  .line { margin-left: 4px; border-left: 1px solid var(--rule); }
  .hd { position: relative; padding: 0 0 14px 22px; }
  .hdot { position: absolute; left: -5px; top: 4px; width: 9px; height: 9px; border-radius: 5px; background: var(--ink3); }
  .hdot.due { background: var(--todo); }
  .hdate { font: 11px var(--mono); color: var(--ink3); }
  .hi { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 4px; padding: 0; border: 0; background: none; color: var(--ink); font: 13px var(--ui); text-align: left; cursor: default; }
  .hi .t { font-size: 13px; }
  .hi:hover .t { color: var(--lampink); }
  .line .none { padding-left: 22px; }
  @container (max-width: 980px) { .cols { flex-direction: column; gap: 24px; } .hz { width: auto; flex: 1 1 auto; } }
</style>
