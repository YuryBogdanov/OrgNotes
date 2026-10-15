<script lang="ts">
  import { slide } from 'svelte/transition';
  import { store } from './store.svelte';
  import { openFile } from './layout';
  import { actionOf } from './views';
  import { entriesIn } from './calIndex';
  import { runAgenda } from './agendas';
  import { firstOpen, sequenceFor, titleIndex } from './org';
  import { toneFor } from './org';
  import { toneStyle } from './colors';
  import { weekdayNames } from './edits';
  import { today } from './todayState.svelte';
  import { allTodayBlocks, arrange, todayBlockOf } from './todayBlocks';
  import { oneOnOnes } from './oneOnOne';
  import { untrack } from 'svelte';
  import { lists, type DateKind, type ListTask } from './taskLists.svelte';
  import ListToast from './ListToast.svelte';
  import TodayNote from './TodayNote.svelte';
  import TodayMeetings from './TodayMeetings.svelte';
  import {
    agendaRows, dateTitle, doneStatus, focusRows, journalDays, kicker, lastDay, overdue, overdueWords, taskGroups, whenChosen,
    type OverdueRow, type TaskRow,
  } from './today';

  // «Сегодня» (ТЗ 32 §2): the morning's overview — the note from yesterday and the choice for today (from the
  // journal), the agenda of the day, the tasks, the overdue ones. A click on a row chooses its task, a double click
  // or ↩ opens it in a tab (ТЗ 34): the rows of all the blocks are one list of tasks.
  let { pane = 0 }: { pane?: number } = $props();

  const cfg = $derived(today.folder);
  const day = $derived(today.day);
  const now = $derived(today.now);
  const files = $derived(store.agendaFiles);
  const tone = (kw: string, path: string) => {
    const f = files.find((x) => x.path === path);
    return f && kw ? toneStyle(toneFor(kw, f.wf)) : '';
  };
  const base = (p: string) => p.split('/').pop() ?? p;

  // ---- the rows as one list of tasks (ТЗ 34) ----
  /** Which of the headings with its title in its file a row's task is: its name whatever its line. */
  function nOf(path: string, line: number, title: string) {
    return titleIndex(files.find((x) => x.path === path)?.headings ?? [], line, title);
  }
  type Row = { path: string; line: number; title: string; kw: string | null; slot: string; n: number; stale?: boolean; gone?: boolean };
  /** Rows changed from the list stay as they were until a refresh (`frozen`): drawn with the task's values now. */
  // the rows of three kinds, as they were drawn
  let frozen = $state.raw<{ agenda: any[]; groups: { file: string; rows: any[] }[]; late: any[]; texts: Map<string, string> } | null>(null);
  function shownRows<T extends { path: string; line: number; title: string; kw: string | null }>(block: string, live: T[], was: (T & Row)[] | undefined): (T & Row)[] {
    const rows = live.map((r) => {
      const n = nOf(r.path, r.line, r.title);
      return { ...r, n, slot: `${block}|${r.path}|${r.title}|${n}` };
    });
    if (!was) return rows;
    const now = new Map(rows.map((r) => [r.slot, r]));
    return was.flatMap((r) => {
      const hit = now.get(r.slot);
      if (hit) return [hit];
      const f = store.files.find((x) => x.path === r.path);
      const h = f?.headings.filter((x) => x.title === r.title)[r.n];
      if (!f || !h) return [];
      return [{ ...r, line: h.line, kw: h.keyword ?? '', prio: h.priority, stale: true, gone: !!h.keyword && f.wf.done.includes(h.keyword) }];
    });
  }

  // ---- the journal: yesterday's note and choice ----
  const journal = $derived(files.find((f) => f.name === cfg.journal));
  const jd = $derived(journal ? lastDay(journalDays(journal), day) : null);
  const focus = $derived(jd ? focusRows(jd.focus, files, day) : []);
  const focusRows2 = $derived(focus.map((f) => ({ ...f, task: f.task ? { ...f.task, slot: `f|${f.task.path}|${f.task.title}|${nOf(f.task.path, f.task.line, f.task.title)}`, n: 0 } : null })));

  // ---- the agenda of the day ----
  const agendaId = $derived(store.agendas.some((a) => a.id === cfg.agenda) ? cfg.agenda : '');
  const agendaLive = $derived.by(() => {
    let list = entriesIn(files, day, day);
    const a = store.agendas.find((x) => x.id === agendaId);
    if (a) {
      const keys = new Set(runAgenda(a, files, day).flatMap((r) => r.groups.flatMap((g) => g.tasks.map((t) => t.path + '#' + t.line))));
      list = list.filter((e) => keys.has(e.file + '#' + e.line));
    }
    return agendaRows(list, files, day, now, cfg.tag);
  });
  const agenda = $derived(shownRows('a', agendaLive, frozen?.agenda));

  // ---- the tasks, the overdue ones ----
  const groupsLive = $derived(taskGroups(files, cfg.statuses, today.taskFiles));
  const groups = $derived(groupsLive.map((g, gi) => ({ ...g, rows: shownRows('t' + g.file, g.rows, frozen?.groups[gi]?.file === g.file ? frozen.groups[gi].rows : undefined) })));
  const tasksTotal = $derived(groups.reduce((n, g) => n + g.total, 0));
  const lateLive = $derived(overdue(cfg.overdueAll ? files : files.filter((f) => today.taskFiles.includes(f.name)), day));
  const late = $derived(shownRows('o', lateLive, frozen?.late));
  const LATE_CAP = 6;

  function freeze() {
    if (!frozen) frozen = { agenda, groups: groups.map((g) => ({ file: g.file, rows: g.rows })), late, texts: new Map(store.files.map((f) => [f.path, f.text])) };
  }
  function refresh() {
    frozen = null;
  }
  // a change not made from the lists (the box of «Главное», «Завтра» of an overdue task, the editor): computed again
  $effect(() => {
    const fz = frozen;
    if (!fz) return;
    if (lists.changedOutside(store.files, fz.texts)) untrack(refresh);
  });
  $effect(() => {
    void day.getTime();
    untrack(refresh);
  });

  // the chosen row: its slot; the task and the date it stands by come from the row
  let selKey = $state('');
  let el: HTMLDivElement | undefined = $state();
  const chosen = $derived.by((): (ListTask & { slot: string }) | null => {
    if (!selKey) return null;
    const pick = (r: Row, dk: DateKind | null) => ({ path: r.path, line: r.line, title: r.title, dk, slot: r.slot });
    for (const f of focusRows2) if (f.task?.slot === selKey) return pick(f.task, null);
    for (const a of agenda) if (a.slot === selKey) return pick(a, a.kind === 'event' ? 'event' : a.kind === 'deadline' ? 'DEADLINE' : 'SCHEDULED');
    for (const g of groups) for (const r of g.rows) if (r.slot === selKey) return pick(r, null);
    for (const r of late) if (r.slot === selKey) return pick(r, r.kind);
    return null;
  });
  // a task gone: the selection goes
  $effect(() => {
    if (selKey && !chosen) untrack(() => (selKey = ''));
  });
  const rowsOnScreen = () => [...(el?.querySelectorAll<HTMLElement>('[data-k]') ?? [])];
  function choose(k: string) {
    selKey = k;
    queueMicrotask(() => {
      const b = rowsOnScreen().find((x) => x.dataset.k === k);
      b?.focus({ preventScroll: true });
      b?.scrollIntoView({ block: 'nearest' });
    });
  }
  // The chosen row had the focus and was drawn anew (a block came or went with the folder read, a plugin's block came):
  // the focus left with the old button — it goes to the new one, so the list's keys keep working.
  let rowFocus = false;
  $effect(() => {
    const node = el;
    if (!node) return;
    const into = (e: FocusEvent) => (rowFocus = !!(e.target as HTMLElement).closest?.('[data-k]') && node.contains(e.target as Node));
    document.addEventListener('focusin', into);
    const watch = new MutationObserver(() => {
      if (!rowFocus || !selKey || (document.activeElement && document.activeElement !== document.body)) return;
      rowsOnScreen().find((x) => x.dataset.k === selKey)?.focus({ preventScroll: true });
    });
    watch.observe(node, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('focusin', into);
      watch.disconnect();
    };
  });
  function keydown(e: KeyboardEvent) {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) {
      if (e.code === 'KeyZ' && e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && lists.canUndo) {
        e.preventDefault();
        void lists.undo();
      }
      return;
    }
    const rows = rowsOnScreen();
    if (!rows.length) return;
    e.preventDefault();
    const i = rows.findIndex((x) => x.dataset.k === selKey);
    const j = i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    choose(rows[j].dataset.k!);
  }
  function clickEmpty(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('[data-k], button, a, input')) selKey = '';
  }
  function openChosen(other: boolean) {
    const t = chosen;
    if (!t) return;
    const fi = store.files.findIndex((f) => f.path === t.path);
    if (other) store.openFromAgenda(pane, fi, t.line, 'neighbor-focus');
    else open(t.path, t.line);
  }
  function menu(e: MouseEvent, k: string) {
    choose(k);
    const sp = lists.spec(listId);
    if (sp) queueMicrotask(() => lists.openMenu(e, sp));
    e.preventDefault();
  }
  const listId = $derived('today:' + pane);
  $effect(() => {
    const id = 'today:' + pane;
    return untrack(() =>
      lists.register({
        id,
        el: () => el,
        tab: () => store.layout.panes[pane]?.tabs[store.layout.panes[pane].active],
        selected: () => {
          const t = chosen;
          return t ? { path: t.path, line: t.line, title: t.title, dk: t.dk } : null;
        },
        open: openChosen,
        clear: () => (selKey = ''),
        refresh,
        freeze,
      }),
    );
  });

  // ---- 1-1: the meetings of the day (their cards: TodayMeetings.svelte) ----
  const meetings = $derived(oneOnOnes(files, day, cfg.tag));

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

<div class="host">
<div class="today" role="region" aria-label="Сегодня" tabindex="-1" bind:this={el} onkeydown={keydown} onclick={clickEmpty}>
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

    {#each layout.rows as r, ri (ri)}
      {#if r.kind === 'top'}
        <div class="row">
          {#each r.ids as id (id)}{@render block(id)}{/each}
        </div>
      {:else if r.kind === 'full'}
        <!-- a plugin's row of the whole width (a banner, «Цели недели», API 1.7) -->
        <div class="row full">{@render block(r.id)}</div>
      {:else}
        <div class="row cols">
          {#each r.cols as col (col.join())}
            <div class="col">{#each col as id (id)}{@render block(id)}{/each}</div>
          {/each}
        </div>
      {/if}
    {/each}
    {#if resting.length}
      <div hidden>{#each resting as id (id)}{@const b = todayBlockOf(id)}{#if b?.component}<b.component id={b.id} />{/if}{/each}</div>
    {/if}
  </div>
</div>
<ListToast list={listId} bottom={16} />
</div>

{#snippet block(id: string)}
  {@const b = todayBlockOf(id)}
  {#if b?.component}
    <section class="tcard" aria-label={b.title}><b.component id={b.id} /></section>
  {:else if id === 'oneOnOne'}
    <TodayMeetings {meetings} {day} onopen={open} />
  {:else if id === 'note'}
    <TodayNote {jd} {journal} name={base(cfg.journal)} onopen={open} />
  {:else if id === 'focus'}
    <section class="tcard focus" aria-label="Главное на сегодня">
      <div class="tcard-head">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--acc)" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3.5" /></svg>
        <span class="tcard-name">Главное на сегодня</span>
        {#if jd && focus.length}<span class="tcard-sub">выбрано {whenChosen(jd.date, day)}</span>{/if}
      </div>
      {#each focusRows2 as f (f.id)}
        {#if f.task}
          {@const t = f.task}
          <div class="frow" class:done={t.done}>
            <button class="box" role="checkbox" aria-checked={t.done} aria-label="Выполнено: {t.title}" onclick={() => void tick(t)}>{#if t.done}✓{/if}</button>
            <button class="rowbtn" class:sel={selKey === t.slot} data-k={t.slot} onclick={() => choose(t.slot)} ondblclick={() => open(t.path, t.line)} oncontextmenu={(e) => menu(e, t.slot)}>
              <span class="kw tone" style={tone(t.kw, t.path)}>{t.kw}</span>
              <span class="t">{t.title}</span>
              <span class="meta" class:red={t.late && !t.done}>{t.meta}</span>
            </button>
          </div>
        {:else}
          <div class="frow lost"><span class="box off"></span><span class="t">Задача не найдена</span><span class="meta">{f.title}</span></div>
        {/if}
      {:else}
        <div class="tcard-none">Главное не выбрано. Вечером — «Завершить день…»</div>
      {/each}
    </section>
  {:else if id === 'agenda'}
    <section class="tcard" aria-label="Агенда на сегодня">
      <div class="tcard-head">
        <span class="tcard-name">Агенда на сегодня</span><span class="tcard-sub">{agenda.length}</span>
        <button class="tcard-link" onclick={openAgenda}>Открыть агенду ›</button>
      </div>
      {#each agenda as a (a.key)}
        <button class="arow" class:past={a.past} class:sel={selKey === a.slot} class:stale={a.stale} class:gone={a.gone} data-k={a.slot}
          onclick={() => choose(a.slot)} ondblclick={() => open(a.path, a.line)} oncontextmenu={(e) => menu(e, a.slot)}>
          <span class="time" class:strong={!a.past}>{a.time}</span>
          <span class="dot" class:ev={a.kind === 'event'}></span>
          <span class="t">{#if a.kind === 'task' && a.kw}<span class="kw tone" style={tone(a.kw, a.path)}>{a.kw}</span> {/if}{a.title}</span>
          {#if a.meeting}<span class="badge">1-1</span>{/if}
        </button>
      {:else}
        <div class="tcard-none">На сегодня ничего нет</div>
      {/each}
    </section>
  {:else if id === 'tasks'}
    <section class="tcard" aria-label="Задачи">
      <div class="tcard-head"><span class="tcard-name">Задачи</span><span class="tcard-sub">{cfg.statuses.join(', ')} · {tasksTotal}</span></div>
      {#each groups as g (g.file)}
        <div class="grp">
          <span>{g.file.toUpperCase()}</span><span class="n">{g.total || ''}</span>
          {#if isInbox(g.file) && review && !g.missing}<button class="tcard-link" onclick={() => review?.()}>Разобрать ›</button>{/if}
        </div>
        {#if g.missing}
          <div class="trow none">Файл не найден</div>
        {/if}
        {#each g.rows as r (r.key)}
          <button class="trow" class:sel={selKey === r.slot} class:stale={r.stale} class:gone={r.gone} data-k={r.slot}
            onclick={() => choose(r.slot)} ondblclick={() => open(r.path, r.line)} oncontextmenu={(e) => menu(e, r.slot)}>
            <span class="kwc"><span class="kw tone" style={tone(r.kw, r.path)}>{r.kw}</span></span>
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
    <section class="tcard" aria-label="Просрочено">
      <div class="tcard-head"><span class="tcard-name">Просрочено</span><span class="count">{late.length}</span></div>
      {#each late.slice(0, LATE_CAP) as r (r.key)}
        <div class="orow" class:stale={r.stale} class:gone={r.gone} transition:slide={{ duration: 180 }}>
          <button class="rowbtn" class:sel={selKey === r.slot} data-k={r.slot} onclick={() => choose(r.slot)} ondblclick={() => open(r.path, r.line)} oncontextmenu={(e) => menu(e, r.slot)}>
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
  .host { position: relative; height: 100%; container-type: inline-size; }
  .today:focus { outline: none; }
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
  .row.full > :global(.tcard) { flex: 1 1 100%; }
  .row:not(.cols) > :global(.tcard:first-child) { flex: 1.25 1 420px; }
  .row:not(.cols) > :global(.tcard) { flex: 1 1 360px; }
  .col { flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .focus { padding: 14px 18px 10px; }
  .none { color: var(--fg2); padding: 8px 0 6px; } /* a row of «нет задач» (.trow.none); a card's own: .tcard-none */
  .count { font-size: 11px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: color-mix(in srgb, var(--todo) 12%, transparent); color: var(--todo); }
  /* a status as a capsule (ТЗ 32, the design's update): as the marks of statuses in the navigator and the agenda */
  .kw { flex: 0 0 auto; padding: 1px 5px; border-radius: 4px; font-size: 10.5px; font-weight: 700; line-height: 15px; letter-spacing: 0.02em; color: var(--tl); background: color-mix(in srgb, var(--tl) 16%, transparent); }
  .kwc { flex: 0 0 46px; display: flex; }
  .t .kw { display: inline-block; vertical-align: 1px; margin-right: 2px; }
  .t { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: left; }
  .meta { flex: 0 0 auto; font-size: 11.5px; color: var(--fg3); }
  .meta.red { color: var(--todo); }
  button.arow, button.trow, button.rowbtn { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none; padding: 0; font: inherit; color: inherit; text-align: left; cursor: default; }
  .arow:hover .t, .trow:hover .t, .rowbtn:hover .t { color: var(--acc); }
  /* a row is a task of the list (ТЗ 34): chosen — the selection's colour and a ring while the screen has the focus */
  [data-k] { margin-inline: -6px; padding-inline: 6px !important; width: calc(100% + 12px) !important; box-sizing: border-box; border-radius: 6px; }
  .frow [data-k] { margin-inline: 0 -6px; width: calc(100% + 6px) !important; padding-inline: 4px 6px !important; }
  [data-k]:focus { outline: none; }
  [data-k].sel { background: color-mix(in srgb, var(--fg) 9%, transparent); }
  .today:focus-within [data-k].sel { background: var(--sel); box-shadow: inset 0 0 0 1.5px var(--acc); }
  /* changed from the list, no longer of the screen: dimmed until a refresh; done: struck through too */
  .stale { opacity: 0.55; }
  .gone .t { text-decoration: line-through; }


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
  .grp .tcard-link { letter-spacing: 0; font-weight: 500; }
  .trow { min-height: 30px; border-top: 1px solid var(--line) !important; }
  .trow.none { display: flex; align-items: center; padding: 0; }
  .trow.more { color: var(--acc); font-size: 12px; }

  .orow { border-top: 1px solid var(--line); padding: 7px 0; }
  .ofoot { display: flex; align-items: center; gap: 6px; margin-top: 5px; }
  .when { margin-right: auto; font-size: 11.5px; color: var(--todo); }
  .chip { height: 22px; display: inline-flex; align-items: center; padding: 0 8px; border: 0; border-radius: 5px; background: var(--field); color: var(--fg); font: inherit; font-size: 11.5px; }
  .chip:hover { background: var(--sel); }

  /* «1-1 сегодня» */
</style>
