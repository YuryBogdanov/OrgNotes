<script lang="ts">
  import { builtinItemsOf, builtinSectionsOf, type AgendaItem as Item, type AgendaSection as Section } from './builtinAgenda';
  import { draggedHeading, setDragged } from './dragData';
  import { untrack } from 'svelte';
  import { store } from './store.svelte';
  import { dayDiff, fmtDay, titleIndex, toJs, toneFor, type OrgDate } from './org';
  import { toneOf, toneStyle } from './colors';
  import { displayName } from './names';
  import { runAgenda, tasksCount } from './agendas';
  import { lists } from './taskLists.svelte';
  import ListToast from './ListToast.svelte';

  // the pane the agenda lives in: a task opens in the neighbour pane (↩, double click) or here (⌥↩)
  let { pane = 0 }: { pane?: number } = $props();


  // the colours of the priorities, as the board's (ТЗ 33): A — TODO's, B — WAIT's, C — the secondary
  const PRIO: Record<string, string> = { A: 'var(--todo)', B: 'var(--wait)', C: 'var(--fg2)' };

  // each agenda tab shows its own agenda
  const tab = $derived.by(() => {
    const p = store.layout.panes[pane];
    return p?.tabs[p.active];
  });
  const custom = $derived(store.agendaOf(tab));
  const midnight = $derived(new Date(store.today.getFullYear(), store.today.getMonth(), store.today.getDate()));

  // ---- the built-in agenda: open tasks and events of the next 30 days, by day (builtinAgenda.ts) ------------------
  const builtinItems = $derived(builtinItemsOf(store.agendaFiles, midnight));
  const builtinSections = $derived(builtinSectionsOf(builtinItems, midnight));



  // ---- a custom agenda: its blocks in order, each with its own heading -------------------------------------------
  const customRun = $derived(custom ? runAgenda(custom, store.agendaFiles, midnight) : []);
  const mark = (d: OrgDate | undefined, word: string) => (d ? `${word} ${fmtDay(toJs(d))}` : '');
  const customSections = $derived.by(() => {
    const out: Section[] = [];
    customRun.forEach((r) => {
      const dot = toneStyle(toneOf(r.block.color) ?? toneOf('blue')!);
      const rows = (tasks: (typeof r.groups)[number]['tasks'], at: string) =>
        tasks.map((t): Item => {
          const f = store.files[t.file];
          const h = f.headings.find((x) => x.line === t.line);
          const n = h ? titleIndex(f.headings, h.line, h.title) : 0;
          const d = t.scheduled ?? t.deadline;
          return {
            day: d ? dayDiff(toJs(d), midnight) : 0, time: t.scheduled?.time ?? '', kw: t.kw, tone: toneStyle(toneFor(t.kw, f.wf)), ev: false,
            prio: t.prio, title: t.title, src: t.src, tags: t.tags.filter((x) => !f.filetags.includes(x)).join(' '),
            mark: t.scheduled ? mark(t.scheduled, 'Запланировано') : mark(t.deadline, 'Дедлайн'),
            late: !!d && !t.done && dayDiff(toJs(d), midnight) < 0, file: t.file, line: t.line, order: t.order,
            path: f.path, n, dk: t.scheduled ? 'SCHEDULED' : t.deadline ? 'DEADLINE' : null, key: `${at}|${f.path}|${t.title}|${n}`,
          };
        });
      const grouped = r.groups.length && r.groups[0].title !== '';
      out.push({
        key: r.block.id, title: r.block.name, sub: tasksCount(r.total), tone: '', dot, level: 1,
        items: grouped ? [] : rows(r.groups[0]?.tasks ?? [], r.block.id), empty: r.total === 0, more: grouped ? 0 : r.more,
      });
      if (grouped) {
        r.groups.forEach((g, gi) =>
          out.push({ key: `${r.block.id}:${g.key}`, title: g.title, sub: String(g.tasks.length), tone: '--fg2', level: 2, items: rows(g.tasks, `${r.block.id}:${g.key}`), more: gi === r.groups.length - 1 ? r.more : 0 }),
        );
      }
    });
    return out;
  });

  const live = $derived<Section[]>(custom ? customSections : builtinSections);

  // ---- rows changed from the list stay where they were until it is refreshed (ТЗ 34) ------------------------------
  // `frozen`: the rows as they were before the first change; drawn with the values of now, a row that no longer fits
  // dimmed; new rows wait. ⌘R, another agenda or day, a change of a file not made from the lists, a new tab: refresh.
  let frozen = $state.raw<{ sections: Section[]; texts: Map<string, string> } | null>(null);
  function freeze() {
    if (!frozen) frozen = { sections: live, texts: new Map(store.files.map((f) => [f.path, f.text])) };
  }
  function refresh() {
    frozen = null;
  }
  /** A row whose task no longer fits: its values now, or null when the task is gone. */
  function staleOf(it: Item): Item | null {
    const fi = store.files.findIndex((f) => f.path === it.path);
    const f = store.files[fi];
    const h = f?.headings.filter((x) => x.title === it.title)[it.n];
    if (!f || !h) return null;
    const done = !!h.keyword && f.wf.done.includes(h.keyword);
    const date = it.dk === 'event' ? h.event : it.dk === 'DEADLINE' ? h.deadline : h.scheduled;
    const word = it.dk === 'event' ? 'Событие' : it.dk === 'DEADLINE' ? 'Дедлайн' : 'Запланировано';
    const closed = h.closed && dayDiff(toJs(h.closed), midnight) === 0 ? `Закрыто сегодня${h.closed.time ? ' ' + h.closed.time : ''}` : h.closed ? `Закрыто ${fmtDay(toJs(h.closed))}` : 'Выполнено';
    return {
      ...it, kw: h.keyword, tone: h.keyword ? toneStyle(toneFor(h.keyword, f.wf)) : '', ev: !h.keyword && !!h.event, prio: h.priority,
      tags: (custom ? h.tags.filter((x) => !f.filetags.includes(x)) : h.tags).join(' '), file: fi, line: h.line, late: false,
      mark: done ? closed : date ? `${word} ${fmtDay(toJs(date))}` : 'Без даты', stale: true, done,
    };
  }
  const sections = $derived.by<Section[]>(() => {
    if (!frozen) return live;
    const now = new Map(live.flatMap((s) => s.items.map((it) => [it.key, it] as const)));
    return frozen.sections.map((s) => ({ ...s, items: s.items.flatMap((it) => now.get(it.key) ?? staleOf(it) ?? []) }));
  });
  // a change not made from the lists (typed in the editor, from disk): the list is computed again, as before
  $effect(() => {
    const fz = frozen;
    if (!fz) return;
    if (lists.changedOutside(store.files, fz.texts)) untrack(refresh);
  });
  // another agenda, another day
  $effect(() => {
    void custom?.id;
    void midnight.getTime();
    untrack(refresh);
  });

  const items = $derived(sections.flatMap((s) => s.items));
  const total = $derived(custom ? customRun.reduce((n, r) => n + r.total, 0) : items.length);
  const sourcesWord = $derived(custom ? (custom.sources.length ? custom.sources.map((s) => displayName(s)).join(', ') : 'все файлы') : '');

  // ---- choosing a task: a click chooses, a double click or ↩ opens (ТЗ 34) -----------------------------------------
  // `items` is in display order, so an index into it is the row order
  let sel = $state(-1);
  let list: HTMLDivElement | undefined = $state();
  let selKey = $state('');
  // the selection follows its row when the list is computed again; a task gone takes it away
  $effect(() => {
    if (!selKey) return;
    const i = items.findIndex((it) => it.key === selKey);
    if (i < 0) {
      sel = -1;
      selKey = '';
    } else if (i !== sel) sel = i;
  });
  function choose(i: number) {
    if (!items.length) return;
    sel = Math.max(0, Math.min(items.length - 1, i));
    selKey = items[sel]?.key ?? '';
    queueMicrotask(() => list?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }));
  }
  function clear() {
    sel = -1;
    selKey = '';
  }
  function openItem(i: number, mode: 'neighbor' | 'neighbor-focus' | 'here') {
    const it = items[i];
    if (!it) return;
    choose(i);
    store.openFromAgenda(pane, it.file, it.line, mode);
    if (mode === 'neighbor') queueMicrotask(() => list?.focus()); // the focus stays in the agenda
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      choose(sel + 1);
    } else if (e.key === 'ArrowUp' && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      choose(sel < 0 ? 0 : sel - 1);
    } else if (e.code === 'KeyZ' && e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && lists.canUndo) {
      // ⌘Z: the lists' own steps first (the window's ⌘Z takes the rest)
      e.preventDefault();
      void lists.undo();
    }
  }
  // another agenda picked in the list: the selection starts over
  $effect(() => {
    void custom?.id;
    untrack(clear);
  });
  // a click on no row takes the selection away
  function clickEmpty(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('.item')) clear();
  }

  // the lists' part: the keys, the menu, the palette and the inspector act on the chosen task
  $effect(() => {
    const id = 'agenda:' + pane;
    return untrack(() =>
      lists.register({
        id,
        el: () => list,
        tab: () => tab,
        selected: () => {
          const it = items[sel];
          return it ? { path: it.path, line: it.line, title: it.title, dk: it.dk } : null;
        },
        open: (other) => openItem(sel, other ? 'here' : 'neighbor'),
        otherLabel: 'Открыть здесь',
        clear,
        refresh,
        freeze,
      }),
    );
  });
  const listId = $derived('agenda:' + pane);

  // the hint bar: the keys as set now
  const pair = (a: string, b: string) => (a && b && a.slice(0, -1) === b.slice(0, -1) ? `${a} ${b.slice(-1)}` : [a, b].filter(Boolean).join(' '));
  const hints = $derived(
    [
      [store.keyHint('taskOpen'), 'открыть'],
      [pair(store.keyHint('taskStatusPrev'), store.keyHint('taskStatusNext')), 'статус'],
      [pair(store.keyHint('taskDatePrev'), store.keyHint('taskDateNext')), 'дата ±1 день'],
      [pair(store.keyHint('taskPrioUp'), store.keyHint('taskPrioDown')), 'приоритет'],
      [store.keyHint('taskSchedule'), 'запланировать'],
    ].filter(([k]) => k),
  );
</script>

<div class="agenda">

  <div class="view">
    <header class:custom={!!custom}>
      <div>
        <div class="h1">{custom ? custom.name : 'Агенда'}</div>
        <div class="sub">{custom ? `${tasksCount(total)} · ${sourcesWord}` : `${total} записей · ближайшие 30 дней`}</div>
      </div>
      {#if custom}<button class="edit" onclick={(e) => store.editAgenda(custom.id, e.currentTarget)}>Редактировать…</button>{/if}
    </header>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="scroll" bind:this={list} role="listbox" tabindex="0" aria-label="Задачи агенды" aria-activedescendant={sel >= 0 ? `ag-${pane}-${sel}` : undefined}
      onkeydown={keydown} onclick={clickEmpty}>
      {#each sections as g (g.key)}
        <div class="gh" class:l2={g.level === 2} data-block={g.level === 1 && custom ? g.title : undefined}>
          {#if g.dot}<span class="bdot tone-bg" style={g.dot}></span>{/if}
          <span class="gt" class:tone={!!g.dot} style={g.dot ? g.dot : `color:var(${g.tone})`}>{g.title}</span>
          {#if g.sub && !custom}<span class="gs">{g.sub}</span>{/if}
          <span class="rule"></span>
          <span class="gs">{custom ? g.sub : g.items.length}</span>
        </div>
        {#if g.empty}<div class="none">нет задач</div>{/if}
        {#each g.items as it (it.key)}
          {@const i = items.indexOf(it)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="item" class:sel={i === sel} class:stale={it.stale} class:done={it.done} id="ag-{pane}-{i}" data-i={i} role="option" aria-selected={i === sel}
            onclick={() => choose(i)} ondblclick={() => openItem(i, 'neighbor-focus')}
            draggable="true" ondragstart={(e) => { const d = draggedHeading(it.path, it.line); if (d) setDragged(e.dataTransfer, d); }}
            oncontextmenu={(e) => { choose(i); list?.focus({ preventScroll: true }); const sp = lists.spec(listId); if (sp) lists.openMenu(e, sp); }}>
            <span class="time">{it.time}</span>
            {#if it.kw}
              <span class="kw tone-chip" style={it.tone}>{it.kw}</span>
            {:else}
              <span class="kw ev">СОБ.</span>
            {/if}
            <div class="main">
              <span class="ttl">{#if it.prio}<span class="prio" style:--c={PRIO[it.prio] ?? 'var(--fg2)'} aria-label="Приоритет {it.prio}">#{it.prio}</span>{/if}{it.title}</span>
              <span class="src">{it.src}</span>
            </div>
            {#if it.tags}<span class="tag">{it.tags}</span>{/if}
            <span class="mark" class:late={it.late}>{it.mark}</span>
            <svg class="go" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" /></svg>
          </div>
        {/each}
        {#if g.more}<div class="none">и ещё {g.more}</div>{/if}
      {/each}
    </div>
    <ListToast list={listId} />
    <div class="foot">
      {#each hints as [k, t] (t)}<span class="hk"><span class="kk">{k}</span>{t}</span>{/each}
      <span class="who">{custom ? `Агенда «${custom.name}»` : 'Агенда'}</span>
    </div>
  </div>
</div>

<style>
  .agenda { height: 100%; display: flex; min-width: 0; background: var(--bg); }
  .edit:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }

  .view { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; container-type: inline-size; }
  header { display: flex; align-items: flex-end; gap: 12px; padding: 18px 24px 14px; border-bottom: 1px solid var(--line); }
  header > div { flex: 1; min-width: 0; }
  .h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: var(--fg2); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .edit { flex: 0 0 auto; height: 26px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--field); font-size: 12.5px; }
  .scroll { flex: 1; overflow: auto; padding: 6px 14px 20px; }
  .gh { display: flex; align-items: baseline; gap: 10px; padding: 16px 10px 6px; }
  .gh.l2 { padding: 8px 10px 4px 28px; }
  .gh.l2 .gt { font-weight: 600; font-size: 12.5px; }
  .bdot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 4px; align-self: center; }
  .gt { font-weight: 700; }
  .gs { font-size: 12px; color: var(--fg2); }
  .rule { flex: 1; height: 1px; background: var(--line); align-self: center; }
  .none { padding: 4px 10px 6px 28px; font-size: 12.5px; color: var(--fg2); }
  .item { display: flex; align-items: center; gap: 12px; min-height: 46px; padding: 6px 10px; border-radius: 7px; }
  .item:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
  /* the chosen task (ТЗ 34): the list in focus — the selection's colour and a ring of the accent; else grey only */
  .item.sel { background: color-mix(in srgb, var(--fg) 9%, transparent); }
  .scroll:focus-within .item.sel { background: var(--sel); box-shadow: inset 0 0 0 1.5px var(--acc); }
  .scroll:focus { outline: none; }
  /* changed from the list and no longer fitting it: dimmed until a refresh; done: struck through too */
  .item.stale { opacity: 0.55; }
  .item.done .ttl { text-decoration: line-through; }
  .go { flex: 0 0 13px; color: var(--acc); opacity: 0; }
  .scroll:focus-within .item.sel .go { opacity: 1; }
  .view { position: relative; }
  .foot { flex: 0 0 24px; display: flex; align-items: center; gap: 16px; padding: 0 14px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; }
  .hk { display: inline-flex; align-items: center; gap: 5px; }
  .kk { font-family: var(--mono); color: var(--fg); }
  .who { margin-left: auto; overflow: hidden; text-overflow: ellipsis; }
  .time { flex: 0 0 42px; font-size: 12px; color: var(--fg2); font-family: var(--mono); }
  /* as wide as the status needs (MEETING, IN-PROGRESS…), at least the column of the short ones */
  .kw { flex: 0 0 auto; min-width: 52px; box-sizing: border-box; text-align: center; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; }
  .kw.ev { color: var(--fg2); background: var(--field); }
  .main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .ttl { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* the priority as on the board (ТЗ 33): a capsule in its colour, apart from the title */
  .prio { display: inline-block; margin-right: 6px; padding: 0 4px; border-radius: 4px; vertical-align: 1px; font-size: 10.5px; font-weight: 700; line-height: 16px; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
  .src { font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { font-size: 11.5px; color: var(--tagfg); background: var(--tagbg); padding: 1px 8px; border-radius: 9px; }
  .mark { flex: 0 0 170px; text-align: right; font-size: 12px; color: var(--fg2); }
  .mark.late { color: var(--todo); }
  /* in a pane next to a file: the compact rows of the design, one line each, no big header */
  @container (max-width: 760px) {
    header:not(.custom) { display: none; }
    /* a custom agenda keeps a slim header: its name and «Редактировать…» */
    header.custom { align-items: center; padding: 8px 12px 8px 18px; }
    header.custom .h1 { font-size: 14px; }
    header.custom .sub { display: none; }
    header.custom .edit { height: 22px; padding: 0 10px; font-size: 12px; }
    .scroll { padding: 4px 10px 12px; }
    .gh { padding: 12px 8px 5px; gap: 8px; }
    .gt { font-size: 12.5px; }
    .gs { font-size: 11.5px; }
    .item { min-height: 36px; padding: 4px 8px; gap: 10px; }
    .time { flex-basis: 38px; font-size: 11.5px; }
    .kw { min-width: 40px; }
    .main { flex-direction: row; align-items: baseline; gap: 10px; }
    .ttl { flex: 1 1 auto; min-width: 0; font-size: 13px; }
    .src { flex: 0 1 auto; max-width: 45%; }
    .mark, .tag { display: none; }
  }

</style>
