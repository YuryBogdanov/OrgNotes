<script lang="ts">
  import { store } from './store.svelte';
  import { dayDiff, fmtDay, fmtLong, occurrences, repeaterLabel, toJs, toneFor, weekdayName, type OrgDate } from './org';
  import { toneOf, toneStyle } from './colors';
  import { displayName } from './names';
  import { runAgenda, tasksCount } from './agendas';

  // the pane the agenda lives in: a task opens in the neighbour pane (↩, click) or here (⌥↩)
  let { pane = 0 }: { pane?: number } = $props();

  type Item = {
    day: number; // days from today
    time: string; kw: string | null; tone: string; ev: boolean; pr: boolean;
    title: string; src: string; tags: string; mark: string; late: boolean; file: number; line: number; order: number;
    key: string;
  };
  /** A heading above rows: a day of the built-in agenda, a block of a custom one, a group inside a block. */
  type Section = {
    key: string; title: string; sub: string; tone: string; dot?: string; level: 1 | 2;
    items: Item[]; empty?: boolean; more?: number;
  };

  // each agenda tab shows its own agenda
  const tab = $derived.by(() => {
    const p = store.layout.panes[pane];
    return p?.tabs[p.active];
  });
  const custom = $derived(store.agendaOf(tab));
  const midnight = $derived(new Date(store.today.getFullYear(), store.today.getMonth(), store.today.getDate()));

  // ---- the built-in agenda: open tasks and events of the next 30 days, by day ----------------------------------
  const builtinItems = $derived.by(() => {
    const from = midnight;
    const horizon = new Date(from); horizon.setDate(horizon.getDate() + 30);
    const out: Item[] = [];
    store.agendaFiles.forEach((f, fi) => {
      for (const h of f.headings) {
        const isOpen = !!h.keyword && f.wf.open.includes(h.keyword);
        const isEvent = !h.keyword && !!h.event;
        if (!isOpen && !isEvent) continue;
        const base = {
          kw: h.keyword, tone: h.keyword ? toneStyle(toneFor(h.keyword, f.wf)) : '', ev: isEvent, pr: h.priority === 'A',
          title: h.title, src: [displayName(f.name), ...h.path].join(' › '), tags: h.tags.join(' '),
          file: fi, line: h.line,
        };
        const push = (d: Date, time: string, mark: string, order: number) => {
          const day = dayDiff(d, from);
          out.push({ ...base, day, time, mark, order, late: day < 0, key: `${fi}:${h.line}:${day}:${order}` });
        };
        if (h.event) {
          const rep = repeaterLabel(h.event.repeater);
          for (const d of occurrences(h.event, from, horizon)) push(d, h.event.time ?? '', rep || 'Событие', 1);
        }
        if (h.scheduled) {
          const base0 = toJs(h.scheduled);
          const overdue = dayDiff(base0, from);
          if (overdue < 0) push(base0, h.scheduled.time ?? '', `Запланировано ${fmtDay(base0)}`, 0);
          else if (base0 <= horizon) push(base0, h.scheduled.time ?? '', h.scheduled.repeater ? repeaterLabel(h.scheduled.repeater) : 'Запланировано', 1);
        }
        if (h.deadline) {
          const d = toJs(h.deadline);
          const n = dayDiff(d, from);
          if (n < 0) push(d, '', `Дедлайн ${fmtDay(d)}`, 0);
          else if (d <= horizon) push(d, '', `Дедлайн ${fmtDay(d)} · ${n === 0 ? 'сегодня' : `через ${n} дн.`}`, 2);
        }
      }
    });
    return out.sort((a, b) => a.day - b.day || a.order - b.order || a.time.localeCompare(b.time));
  });
  const builtinSections = $derived.by(() => {
    const map = new Map<string, Section>();
    for (const it of builtinItems) {
      const d = new Date(midnight); d.setDate(d.getDate() + it.day);
      let key: string, title: string, sub: string, tone = '--fg';
      if (it.day < 0) { key = 'over'; title = 'Просрочено'; sub = ''; tone = '--todo'; }
      else if (it.day === 0) { key = 'today'; title = 'Сегодня'; sub = fmtLong(d); }
      else if (it.day === 1) { key = 'd' + it.day; title = 'Завтра'; sub = fmtDay(d); }
      else if (it.day <= 7) { key = 'd' + it.day; title = weekdayName(d); sub = fmtDay(d); }
      else { key = 'later'; title = 'Позже'; sub = 'ближайшие 30 дней'; }
      if (!map.has(key)) map.set(key, { key, title, sub, tone, level: 1, items: [] });
      map.get(key)!.items.push(it);
    }
    return [...map.values()].map((s) => ({ ...s, sub: s.sub, count: s.items.length }));
  });

  // ---- a custom agenda: its blocks in order, each with its own heading -------------------------------------------
  const customRun = $derived(custom ? runAgenda(custom, store.agendaFiles, midnight) : []);
  const mark = (d: OrgDate | undefined, word: string) => (d ? `${word} ${fmtDay(toJs(d))}` : '');
  const customSections = $derived.by(() => {
    const out: Section[] = [];
    customRun.forEach((r, bi) => {
      const dot = toneStyle(toneOf(r.block.color) ?? toneOf('blue')!);
      const rows = (tasks: (typeof r.groups)[number]['tasks']) =>
        tasks.map((t): Item => {
          const f = store.files[t.file];
          const d = t.scheduled ?? t.deadline;
          return {
            day: d ? dayDiff(toJs(d), midnight) : 0, time: t.scheduled?.time ?? '', kw: t.kw, tone: toneStyle(toneFor(t.kw, f.wf)), ev: false,
            pr: t.prio === 'A', title: t.title, src: t.src, tags: t.tags.filter((x) => !f.filetags.includes(x)).join(' '),
            mark: t.scheduled ? mark(t.scheduled, 'Запланировано') : mark(t.deadline, 'Дедлайн'),
            late: !!d && !t.done && dayDiff(toJs(d), midnight) < 0, file: t.file, line: t.line, order: t.order, key: `${bi}:${t.file}:${t.line}`,
          };
        });
      const grouped = r.groups.length && r.groups[0].title !== '';
      out.push({
        key: r.block.id, title: r.block.name, sub: tasksCount(r.total), tone: '', dot, level: 1,
        items: grouped ? [] : rows(r.groups[0]?.tasks ?? []), empty: r.total === 0, more: grouped ? 0 : r.more,
      });
      if (grouped) {
        r.groups.forEach((g, gi) =>
          out.push({ key: `${r.block.id}:${g.key}`, title: g.title, sub: String(g.tasks.length), tone: '--fg2', level: 2, items: rows(g.tasks), more: gi === r.groups.length - 1 ? r.more : 0 }),
        );
      }
    });
    return out;
  });

  const sections = $derived<Section[]>(custom ? customSections : builtinSections);
  const items = $derived(sections.flatMap((s) => s.items));
  const total = $derived(custom ? customRun.reduce((n, r) => n + r.total, 0) : items.length);
  const sourcesWord = $derived(custom ? (custom.sources.length ? custom.sources.map((s) => displayName(s)).join(', ') : 'все файлы') : '');

  // ---- choosing a task -----------------------------------------------------------------------
  // `items` is in display order, so an index into it is the row order
  let sel = $state(-1);
  let list: HTMLDivElement | undefined = $state();
  let selKey = $state('');
  // the selection follows its task when the list is recomputed (a status change, a save)
  $effect(() => {
    const i = items.findIndex((it) => it.key === selKey);
    if (selKey && i >= 0 && i !== sel) sel = i;
  });
  function choose(i: number) {
    sel = Math.max(0, Math.min(items.length - 1, i));
    selKey = items[sel]?.key ?? '';
    queueMicrotask(() => list?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }));
  }
  function openItem(i: number, mode: 'neighbor' | 'neighbor-focus' | 'here') {
    const it = items[i];
    if (!it) return;
    choose(i);
    store.openFromAgenda(pane, it.file, it.line, mode);
    if (mode === 'neighbor') queueMicrotask(() => list?.focus()); // the focus stays in the agenda
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      choose(sel + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      choose(sel < 0 ? 0 : sel - 1);
    } else if (e.key === 'Enter' && sel >= 0) {
      e.preventDefault();
      openItem(sel, e.altKey ? 'here' : 'neighbor');
    }
  }
  // another agenda picked in the list: the selection starts over
  $effect(() => {
    void custom?.id;
    sel = -1;
    selKey = '';
  });

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
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="scroll" bind:this={list} role="listbox" tabindex="0" aria-label="Задачи агенды" aria-activedescendant={sel >= 0 ? `ag-${pane}-${sel}` : undefined}
      onkeydown={keydown}>
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
          <div class="item" class:sel={i === sel} id="ag-{pane}-{i}" data-i={i} role="option" aria-selected={i === sel}
            onclick={() => openItem(i, 'neighbor')} ondblclick={() => openItem(i, 'neighbor-focus')}>
            <span class="time">{it.time}</span>
            {#if it.kw}
              <span class="kw tone-chip" style={it.tone}>{it.kw}</span>
            {:else}
              <span class="kw ev">СОБ.</span>
            {/if}
            <div class="main">
              <span class="ttl">{#if it.pr}<b class="pr">[#A] </b>{/if}{it.title}</span>
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
    <div class="foot"><span>↩ открыть в соседней панели</span><span>⌥↩ открыть здесь</span></div>
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
  .item.sel { background: var(--sel); }
  .scroll:focus { outline: none; }
  .scroll:focus-visible .item.sel { box-shadow: inset 0 0 0 1.5px var(--acc); }
  .go { flex: 0 0 13px; color: var(--acc); opacity: 0; }
  .item.sel .go { opacity: 1; }
  .foot { flex: 0 0 26px; display: flex; align-items: center; gap: 14px; padding: 0 12px; background: var(--side); border-top: 1px solid var(--line); font-size: 11.5px; color: var(--fg2); }
  .time { flex: 0 0 42px; font-size: 12px; color: var(--fg2); font-family: var(--mono); }
  /* as wide as the status needs (MEETING, IN-PROGRESS…), at least the column of the short ones */
  .kw { flex: 0 0 auto; min-width: 52px; box-sizing: border-box; text-align: center; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; }
  .kw.ev { color: var(--fg2); background: var(--field); }
  .main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .ttl { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pr { color: var(--wait); }
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
