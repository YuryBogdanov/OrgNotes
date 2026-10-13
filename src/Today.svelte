<script lang="ts">
  import { slide } from 'svelte/transition';
  import { store } from './store.svelte';
  import { openFile } from './layout';
  import { actionOf } from './views';
  import { entriesIn } from './calIndex';
  import { runAgenda } from './agendas';
  import { firstOpen, sequenceFor } from './org';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import { weekdayNames } from './edits';
  import { today } from './todayState.svelte';
  import { allTodayBlocks, arrange, todayBlockOf } from './todayBlocks';
  import { newMeeting, oneOnOnes, type OneOnOne } from './oneOnOne';
  import { plugins } from './api/host.svelte';
  import {
    agendaRows, dateTitle, doneStatus, focusRows, journalDays, kicker, lastDay, noteLines, noteWhen, overdue, overdueWords, taskGroups, whenChosen,
    type OverdueRow, type TaskRow,
  } from './today';

  // «Сегодня» (ТЗ 32 §2): the morning's overview — the note from yesterday and the choice for today (from the
  // journal), the agenda of the day, the tasks, the overdue ones; a click on a row opens its heading in a tab.
  let { pane = 0 }: { pane?: number } = $props();

  const cfg = $derived(today.folder);
  const day = $derived(today.day);
  const now = $derived(today.now);
  const files = $derived(store.files);
  const tone = (kw: string, path: string) => {
    const f = files.find((x) => x.path === path);
    return f && kw ? toneStyle(toneFor(kw, f.wf)) : '';
  };
  const base = (p: string) => p.split('/').pop() ?? p;

  // ---- the journal: yesterday's note and choice ----
  const journal = $derived(files.find((f) => f.name === cfg.journal));
  const jd = $derived(journal ? lastDay(journalDays(journal), day) : null);
  const focus = $derived(jd ? focusRows(jd.focus, files, day) : []);

  // ---- the agenda of the day ----
  const agendaId = $derived(store.agendas.some((a) => a.id === cfg.agenda) ? cfg.agenda : '');
  const agenda = $derived.by(() => {
    let list = entriesIn(files, day, day);
    const a = store.agendas.find((x) => x.id === agendaId);
    if (a) {
      const keys = new Set(runAgenda(a, files, day).flatMap((r) => r.groups.flatMap((g) => g.tasks.map((t) => t.path + '#' + t.line))));
      list = list.filter((e) => keys.has(e.file + '#' + e.line));
    }
    return agendaRows(list, files, day, now, cfg.tag);
  });

  // ---- the tasks, the overdue ones ----
  const groups = $derived(taskGroups(files, cfg.statuses, today.taskFiles));
  const tasksTotal = $derived(groups.reduce((n, g) => n + g.total, 0));
  const late = $derived(overdue(cfg.overdueAll ? files : files.filter((f) => today.taskFiles.includes(f.name)), day));
  const LATE_CAP = 6;

  // ---- 1-1: the meetings of the day; what the plugins add to a card (the goals' line, «Разбор целей») ----
  const meetings = $derived(oneOnOnes(files, day, cfg.tag));
  const extras = $state<Record<string, { line: string | null; action: { label: string; run: () => void } | null }[]>>({});
  $effect(() => {
    const specs = [...plugins.oneOnOnes.entries()];
    for (const m of meetings) {
      const file = m.file;
      void Promise.all(
        specs.map(async ([pid, s]) => ({
          line: s.line ? await Promise.resolve(plugins.guard(pid, () => s.line!(file), null)).catch(() => null) : null,
          action: s.action && (await Promise.resolve(plugins.guard(pid, () => s.action!.available?.(file) ?? true, false)).catch(() => false))
            ? { label: s.action.label, run: () => plugins.guard(pid, () => s.action!.run(file), undefined) } : null,
        })),
      ).then((r) => (extras[m.key] = r));
    }
  });
  async function meeting(m: OneOnOne) {
    if (m.today !== null) return open(m.path, m.today + 1);
    let at = -1;
    const step = await store.transaction('Новая встреча', (tx) =>
      tx.update(m.path, (text) => {
        const f = files.find((x) => x.path === m.path);
        const r = f ? newMeeting(text, f.headings, m.line, day) : null;
        if (r) at = r.line;
        return r?.text ?? null;
      }),
    );
    if (step && at >= 0) open(m.path, at);
  }
  const lastWords = (d: Date) => `${d.getDate()} ${['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'][d.getMonth()]}`;

  const EMPTY: Record<string, () => boolean> = { overdue: () => !late.length, oneOnOne: () => !meetings.length };
  const shown = (id: string) => {
    const b = todayBlockOf(id);
    if (!b || (b.empty?.() ?? EMPTY[id]?.() ?? false)) return undefined;
    return b;
  };
  // a plugin's block left out stays drawn out of sight: it can come back by itself
  const resting = $derived(today.blocks.filter((o) => o.on && todayBlockOf(o.id)?.component && !shown(o.id)).map((o) => o.id));
  const layout = $derived.by(() => {
    void allTodayBlocks();
    return arrange(today.blocks, shown);
  });

  // ---- actions ----
  function open(path: string, line: number) {
    openFile(store.layout, pane, path, line, { focus: true });
    store.layout.active = pane;
  }
  const ref = (r: TaskRow) => ({ path: r.path, line: r.line, title: r.title });
  async function tick(r: TaskRow) {
    const f = files.find((x) => x.path === r.path);
    if (!f) return;
    const to = r.done ? firstOpen(sequenceFor(f.wf, r.kw)) : doneStatus(r.kw, f.wf);
    if (to) await store.transaction(r.done ? 'Вернуть задачу' : 'Задача выполнена', (tx) => tx.setStatus(ref(r), to));
  }
  async function move(r: OverdueRow, d: Date) {
    await store.transaction('Перенести задачу', (tx) => r.kinds.forEach((k) => tx.setPlanning(ref(r), k, d)));
  }
  const shift = (n: number) => {
    const d = new Date(day);
    d.setDate(d.getDate() + n);
    return d;
  };
  function pick(r: OverdueRow) {
    const f = files.find((x) => x.path === r.path);
    store.openCalendar({ kind: r.kind, initial: day, current: r.date, names: weekdayNames(f?.text ?? ''), pick: (d) => void move(r, d) });
  }
  function openAgenda() {
    if (agendaId) store.openAgendaHere(agendaId);
    else store.showAgendaHere();
  }
  const isInbox = (p: string) => p === (store.inboxCfg.file || 'inbox.org');
  const review = $derived(actionOf('inbox.review'));
  const key = $derived(store.keyHint('today'));
</script>

<div class="today" role="region" aria-label="Сегодня">
  <div class="wrap">
    <header>
      <div class="ttl">
        <div class="kick">{kicker(day)}</div>
        <h1>{dateTitle(day, now)}</h1>
      </div>
      <div class="acts">
        {#if key}<span class="hint">{key} — открыть «Сегодня»</span>{/if}
        <button class="btn" onclick={() => today.openEndDay()}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" /></svg>Завершить день…
        </button>
        <button class="ico" aria-label="Настроить экран" title="Настроить экран" onclick={() => store.openSettings('Сегодня')}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" /></svg>
        </button>
      </div>
    </header>

    {#if layout.top.length}
      <div class="row">
        {#each layout.top as id (id)}{@render block(id)}{/each}
      </div>
    {/if}
    {#if resting.length}
      <div hidden>{#each resting as id (id)}{@const b = todayBlockOf(id)}{#if b?.component}<b.component id={b.id} />{/if}{/each}</div>
    {/if}
    {#if layout.cols.length}
      <div class="row cols">
        {#each layout.cols as col (col.join())}
          <div class="col">{#each col as id (id)}{@render block(id)}{/each}</div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#snippet block(id: string)}
  {@const b = todayBlockOf(id)}
  {#if b?.component}
    <section class="card" aria-label={b.title}><b.component id={b.id} /></section>
  {:else if id === 'oneOnOne'}
    {#each meetings as m (m.key)}
      {@const ex = extras[m.key] ?? []}
      <section class="card one" aria-label="1-1 сегодня: {m.name}">
        <div class="head"><span class="name">1-1 сегодня</span>{#if m.time}<span class="sub">{m.time}</span>{/if}</div>
        <div class="who">
          <span class="av" style:background={m.color} aria-hidden="true">{m.initials}</span>
          <div class="wl"><div class="wn">{m.name}</div><div class="ws">{[m.file, m.every, m.last ? `прошлая — ${lastWords(m.last)}` : ''].filter(Boolean).join(' · ')}</div></div>
        </div>
        {#if ex.some((e) => e.line) || m.open}
          <div class="facts">
            {#each ex.filter((e) => e.line) as e, i (i)}<div class="fact"><span class="fdot wait"></span><span>{e.line}</span></div>{/each}
            {#if m.open}<div class="fact"><span class="fdot red"></span><span>Открытые договорённости с прошлой 1-1: {m.open}</span></div>{/if}
          </div>
        {/if}
        <div class="mbtns">
          <button class="mb primary" onclick={() => void meeting(m)}>{m.today !== null ? 'Открыть встречу' : 'Новая встреча'}</button>
          <button class="mb" onclick={() => open(m.path, m.line)}>Открыть файл</button>
          {#each ex.filter((e) => e.action) as e, i (i)}<button class="mb" onclick={() => e.action!.run()}>{e.action!.label}</button>{/each}
        </div>
      </section>
    {/each}
  {:else if id === 'note'}
    <section class="card note" aria-label="Записка со вчера">
      <div class="head">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--noteAcc)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3h9l3 3v11H4zM7 8h6M7 11h6M7 14h3" /></svg>
        <span class="name">Записка со вчера</span>
        {#if jd?.note}
          <span class="sub">{noteWhen(jd.date, jd.note.time)}</span>
          <button class="link" onclick={() => journal && open(journal.path, jd!.note!.line)}>{base(cfg.journal)} ›</button>
        {/if}
      </div>
      {#if jd?.note}
        <div class="ntext">
          {#each noteLines(jd.note.text) as l, i (i)}
            <div class="nl" style:padding-left="{l.depth * 16}px">{#if l.item}<span class="mk">–</span>{/if}<span>{@html l.html}</span></div>
          {/each}
        </div>
      {:else}
        <div class="none">Вчера записки не было. Вечером — «Завершить день…»</div>
      {/if}
    </section>
  {:else if id === 'focus'}
    <section class="card focus" aria-label="Главное на сегодня">
      <div class="head">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3.5" /></svg>
        <span class="name">Главное на сегодня</span>
        {#if jd && focus.length}<span class="sub">выбрано {whenChosen(jd.date, day)}</span>{/if}
      </div>
      {#each focus as f (f.id)}
        {#if f.task}
          {@const t = f.task}
          <div class="frow" class:done={t.done}>
            <button class="box" role="checkbox" aria-checked={t.done} aria-label="Выполнено: {t.title}" onclick={() => void tick(t)}>{#if t.done}✓{/if}</button>
            <button class="rowbtn" onclick={() => open(t.path, t.line)}>
              <span class="kw tone" style={tone(t.kw, t.path)}>{t.kw}</span>
              <span class="t">{t.title}</span>
              <span class="meta" class:red={t.late && !t.done}>{t.meta}</span>
            </button>
          </div>
        {:else}
          <div class="frow lost"><span class="box off"></span><span class="t">Задача не найдена</span><span class="meta">{f.title}</span></div>
        {/if}
      {:else}
        <div class="none">Главное не выбрано. Вечером — «Завершить день…»</div>
      {/each}
    </section>
  {:else if id === 'agenda'}
    <section class="card" aria-label="Агенда на сегодня">
      <div class="head">
        <span class="name">Агенда на сегодня</span><span class="sub">{agenda.length}</span>
        <button class="link" onclick={openAgenda}>Открыть агенду ›</button>
      </div>
      {#each agenda as a (a.key)}
        <button class="arow" class:past={a.past} onclick={() => open(a.path, a.line)}>
          <span class="time" class:strong={!a.past}>{a.time}</span>
          <span class="dot" class:ev={a.kind === 'event'}></span>
          <span class="t">{#if a.kind === 'task' && a.kw}<span class="kw tone" style={tone(a.kw, a.path)}>{a.kw}</span> {/if}{a.title}</span>
          {#if a.meeting}<span class="badge">1-1</span>{/if}
        </button>
      {:else}
        <div class="none">На сегодня ничего нет</div>
      {/each}
    </section>
  {:else if id === 'tasks'}
    <section class="card" aria-label="Задачи">
      <div class="head"><span class="name">Задачи</span><span class="sub">{cfg.statuses.join(', ')} · {tasksTotal}</span></div>
      {#each groups as g (g.file)}
        <div class="grp">
          <span>{g.file.toUpperCase()}</span><span class="n">{g.total || ''}</span>
          {#if isInbox(g.file) && review && !g.missing}<button class="link" onclick={() => review?.()}>Разобрать ›</button>{/if}
        </div>
        {#if g.missing}
          <div class="trow none">Файл не найден</div>
        {/if}
        {#each g.rows as r (r.key)}
          <button class="trow" onclick={() => open(r.path, r.line)}>
            <span class="kw col tone" style={tone(r.kw, r.path)}>{r.kw}</span>
            <span class="t">{r.title}</span>
            {#if r.prio}<span class="meta">[#{r.prio}]</span>{/if}
          </button>
        {/each}
        {#if g.more}
          {@const f = files.find((x) => x.name === g.file)}
          <button class="trow more" onclick={() => f && open(f.path, 0)}>Ещё {g.more} ›</button>
        {/if}
      {/each}
    </section>
  {:else if id === 'overdue'}
    <section class="card" aria-label="Просрочено">
      <div class="head"><span class="name">Просрочено</span><span class="count">{late.length}</span></div>
      {#each late.slice(0, LATE_CAP) as r (r.key)}
        <div class="orow" transition:slide={{ duration: 180 }}>
          <button class="rowbtn" onclick={() => open(r.path, r.line)}>
            <span class="kw tone" style={tone(r.kw, r.path)}>{r.kw}</span><span class="t">{r.title}</span>
          </button>
          <div class="ofoot">
            <span class="when">{overdueWords(r)}</span>
            <button class="chip" onclick={() => void move(r, shift(0))}>Сегодня</button>
            <button class="chip" onclick={() => void move(r, shift(1))}>Завтра</button>
            <button class="chip" onclick={() => pick(r)}>Дата…</button>
          </div>
        </div>
      {/each}
      {#if late.length > LATE_CAP}
        <button class="trow more" onclick={() => store.showAgendaHere()}>Ещё {late.length - LATE_CAP} ›</button>
      {/if}
    </section>
  {/if}
{/snippet}

<style>
  .today { height: 100%; overflow: auto; background: var(--stage); color: var(--fg); font-family: var(--ui); font-size: 13px; }
  .wrap { max-width: 1340px; margin: 0 auto; padding: 22px 32px 28px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; }
  header { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
  .ttl { flex: 1 1 auto; min-width: 0; }
  .kick { font-size: 12px; font-weight: 600; letter-spacing: 0.05em; color: var(--fg3); }
  h1 { margin: 2px 0 0; font-size: 26px; font-weight: 700; line-height: 1.2; }
  .acts { display: flex; align-items: center; gap: 8px; }
  .hint { font-size: 12px; color: var(--fg3); }
  .btn { height: 30px; display: flex; align-items: center; gap: 6px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font: inherit; }
  .btn:hover { background: var(--field); }
  .ico { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg2); padding: 0; }
  .ico:hover { color: var(--fg); }
  .row { display: flex; gap: 16px; flex-wrap: wrap; }
  .row.cols { align-items: flex-start; }
  .row:not(.cols) > :global(.card:first-child) { flex: 1.25 1 420px; }
  .row:not(.cols) > :global(.card) { flex: 1 1 360px; }
  .col { flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .card { min-width: 0; box-sizing: border-box; padding: 12px 16px 8px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); }
  .note { padding: 14px 18px 12px; background: var(--note); border-color: var(--noteLine); }
  .focus { padding: 14px 18px 10px; }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .name { font-weight: 700; }
  .sub { color: var(--fg2); font-size: 12px; }
  .link { margin-left: auto; border: 0; background: none; padding: 0; font: inherit; font-size: 12px; color: var(--acc); cursor: default; }
  .link:hover { text-decoration: underline; }
  .none { color: var(--fg2); padding: 8px 0 6px; }
  .count { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: color-mix(in srgb, var(--todo) 12%, transparent); color: var(--todo); }
  .kw { flex: 0 0 auto; font-size: 11px; font-weight: 700; }
  .kw.col { flex-basis: 40px; }
  .t { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: left; }
  .meta { flex: 0 0 auto; font-size: 11.5px; color: var(--fg3); }
  .meta.red { color: var(--todo); }
  button.arow, button.trow, button.rowbtn { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none; padding: 0; font: inherit; color: inherit; text-align: left; cursor: default; }
  .arow:hover .t, .trow:hover .t, .rowbtn:hover .t { color: var(--acc); }

  .ntext { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; font-size: 14px; line-height: 1.45; }
  .nl { display: flex; gap: 8px; }
  .mk { color: var(--fg3); }
  .ntext :global(.lnk) { color: var(--link); }
  .ntext :global(code) { font: 12.5px var(--mono); }

  .frow { display: flex; align-items: center; gap: 10px; min-height: 34px; }
  .frow + .frow { border-top: 1px solid var(--line); }
  .frow .rowbtn .t { font-size: 13.5px; }
  .frow.done .t { color: var(--fg3); text-decoration: line-through; }
  .frow.done .kw { opacity: 0.6; }
  .frow.lost .t { color: var(--fg3); }
  .box { flex: 0 0 16px; width: 16px; height: 16px; box-sizing: border-box; padding: 0; border-radius: 5px; border: 1.5px solid var(--fg3); background: transparent; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: 700; }
  .frow.done .box { border-color: var(--done); background: var(--done); }
  .box.off { opacity: 0.4; }

  .arow { min-height: 32px; border-top: 1px solid var(--line) !important; gap: 10px !important; }
  .arow.past { opacity: 0.55; }
  .time { flex: 0 0 86px; white-space: nowrap; font-size: 12.5px; font-variant-numeric: tabular-nums; color: var(--fg3); }
  .time.strong { color: var(--fg); font-weight: 600; }
  .dot { flex: 0 0 6px; width: 6px; height: 6px; border-radius: 3px; background: var(--todo); }
  .dot.ev { background: var(--acc); }
  .badge { font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: var(--sel); color: var(--acc); }

  .grp { display: flex; align-items: center; gap: 6px; height: 28px; margin-top: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--fg3); }
  .grp .n { font-weight: 400; }
  .grp .link { letter-spacing: 0; font-weight: 500; }
  .trow { min-height: 30px; border-top: 1px solid var(--line) !important; }
  .trow.none { display: flex; align-items: center; padding: 0; }
  .trow.more { color: var(--acc); font-size: 12px; }

  .orow { border-top: 1px solid var(--line); padding: 7px 0; }
  .ofoot { display: flex; align-items: center; gap: 6px; margin-top: 5px; }
  .when { margin-right: auto; font-size: 11.5px; color: var(--todo); }
  .chip { height: 22px; display: inline-flex; align-items: center; padding: 0 8px; border: 0; border-radius: 5px; background: var(--field); color: var(--fg); font: inherit; font-size: 11.5px; }
  .chip:hover { background: var(--sel); }

  /* «1-1 сегодня» */
  .one { padding: 12px 16px; }
  .who { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
  .av { flex: 0 0 30px; width: 30px; height: 30px; border-radius: 15px; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .wl { flex: 1; min-width: 0; }
  .wn { font-weight: 600; }
  .ws { font-size: 12px; color: var(--fg2); }
  .facts { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; }
  .fact { display: flex; gap: 8px; }
  .fdot { flex: 0 0 8px; width: 8px; height: 8px; margin-top: 5px; border-radius: 4px; }
  .fdot.wait { background: var(--wait); }
  .fdot.red { background: var(--todo); }
  .mbtns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .mb { height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font: inherit; font-size: 12px; }
  .mb:hover { background: var(--field); }
  .mb.primary { border: 0; background: var(--acc); color: var(--onacc); font-weight: 600; }
</style>
