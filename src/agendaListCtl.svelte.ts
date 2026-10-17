import { untrack } from 'svelte';
import { builtinItemsOf, builtinSectionsOf, type AgendaItem as Item, type AgendaSection } from './builtinAgenda';
import { store } from './store.svelte';
import { dayDiff, fmtDay, titleIndex, toJs, toneFor, type OrgDate } from './org';
import { toneOf, toneStyle } from './colors';
import { displayName } from './names';
import { query, runAgenda, tasksCount } from './agendas';
import { lists } from './taskLists.svelte';

// The workings of an agenda's tab (ТЗ 05, 34), out of Agenda.svelte so the old screen and the new one (ТЗ 45 §3.3)
// are one: the built-in list of the next 30 days, or a custom agenda's blocks run on the notes; the rows kept as drawn
// until a refresh; the chosen one, the keys, the screen a list of tasks. The component gives its pane and its list's
// element and calls `effects()` once.

/** A section with what the new look shows of a block: its conditions as a line («статус WAIT», ТЗ 45 §3.3). */
export type Section = AgendaSection & { cond?: string; total?: number };
export type { Item };

export class AgendaListCtl {
  constructor(private pane: () => number, private el: () => HTMLElement | undefined) {}

  readonly tab = $derived.by(() => {
    const p = store.layout.panes[this.pane()];
    return p?.tabs[p.active];
  });
  readonly custom = $derived.by(() => store.agendaOf(this.tab));
  readonly midnight = $derived(new Date(store.today.getFullYear(), store.today.getMonth(), store.today.getDate()));

  // ---- the built-in agenda: open tasks and events of the next 30 days, by day (builtinAgenda.ts) ----
  private readonly builtinItems = $derived.by(() => builtinItemsOf(store.agendaFiles, this.midnight));
  private readonly builtinSections = $derived.by(() => builtinSectionsOf(this.builtinItems, this.midnight));

  // ---- a custom agenda: its blocks in order, each with its own heading ----
  readonly customRun = $derived.by(() => (this.custom ? runAgenda(this.custom, store.agendaFiles, this.midnight) : []));
  private mark = (d: OrgDate | undefined, word: string) => (d ? `${word} ${fmtDay(toJs(d))}` : '');
  private readonly customSections = $derived.by(() => {
    const out: Section[] = [];
    const midnight = this.midnight;
    this.customRun.forEach((r) => {
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
            mark: t.scheduled ? this.mark(t.scheduled, 'Запланировано') : this.mark(t.deadline, 'Дедлайн'),
            late: !!d && !t.done && dayDiff(toJs(d), midnight) < 0, file: t.file, line: t.line, order: t.order,
            path: f.path, n, dk: t.scheduled ? 'SCHEDULED' : t.deadline ? 'DEADLINE' : null, key: `${at}|${f.path}|${t.title}|${n}`,
          };
        });
      const grouped = r.groups.length && r.groups[0].title !== '';
      out.push({
        key: r.block.id, title: r.block.name, sub: tasksCount(r.total), tone: '', dot, level: 1, cond: query(r.block), total: r.total,
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
  private readonly live = $derived.by<Section[]>(() => (this.custom ? this.customSections : this.builtinSections));

  // ---- rows changed from the list stay where they were until it is refreshed (ТЗ 34) ----
  // `frozen`: the rows as they were before the first change; drawn with the values of now, a row that no longer fits
  // dimmed; new rows wait. ⌘R, another agenda or day, a change of a file not made from the lists, a new tab: refresh.
  private frozen = $state.raw<{ sections: Section[]; texts: Map<string, string> } | null>(null);
  private freeze() {
    if (!this.frozen) this.frozen = { sections: this.live, texts: new Map(store.files.map((f) => [f.path, f.text])) };
  }
  private refresh() {
    this.frozen = null;
  }
  /** A row whose task no longer fits: its values now, or null when the task is gone. */
  private staleOf(it: Item): Item | null {
    const fi = store.files.findIndex((f) => f.path === it.path);
    const f = store.files[fi];
    const h = f?.headings.filter((x) => x.title === it.title)[it.n];
    if (!f || !h) return null;
    const midnight = this.midnight;
    const done = !!h.keyword && f.wf.done.includes(h.keyword);
    const date = it.dk === 'event' ? h.event : it.dk === 'DEADLINE' ? h.deadline : h.scheduled;
    const word = it.dk === 'event' ? 'Событие' : it.dk === 'DEADLINE' ? 'Дедлайн' : 'Запланировано';
    const closed = h.closed && dayDiff(toJs(h.closed), midnight) === 0 ? `Закрыто сегодня${h.closed.time ? ' ' + h.closed.time : ''}` : h.closed ? `Закрыто ${fmtDay(toJs(h.closed))}` : 'Выполнено';
    return {
      ...it, kw: h.keyword, tone: h.keyword ? toneStyle(toneFor(h.keyword, f.wf)) : '', ev: !h.keyword && !!h.event, prio: h.priority,
      tags: (this.custom ? h.tags.filter((x) => !f.filetags.includes(x)) : h.tags).join(' '), file: fi, line: h.line, late: false,
      mark: done ? closed : date ? `${word} ${fmtDay(toJs(date))}` : 'Без даты', stale: true, done,
    };
  }
  readonly sections = $derived.by<Section[]>(() => {
    if (!this.frozen) return this.live;
    const now = new Map(this.live.flatMap((s) => s.items.map((it) => [it.key, it] as const)));
    return this.frozen.sections.map((s) => ({ ...s, items: s.items.flatMap((it) => now.get(it.key) ?? this.staleOf(it) ?? []) }));
  });
  readonly items = $derived.by(() => this.sections.flatMap((s) => s.items));
  readonly total = $derived.by(() => (this.custom ? this.customRun.reduce((n, r) => n + r.total, 0) : this.items.length));
  readonly sourcesWord = $derived.by(() => (this.custom ? (this.custom.sources.length ? this.custom.sources.map((s) => displayName(s)).join(', ') : 'все файлы') : ''));

  // ---- choosing a task: a click chooses, a double click or ↩ opens (ТЗ 34) ----
  /** `items` is in display order, so an index into it is the row order. */
  sel = $state(-1);
  private selKey = $state('');
  choose(i: number) {
    if (!this.items.length) return;
    this.sel = Math.max(0, Math.min(this.items.length - 1, i));
    this.selKey = this.items[this.sel]?.key ?? '';
    queueMicrotask(() => this.el()?.querySelector<HTMLElement>(`[data-i="${this.sel}"]`)?.scrollIntoView({ block: 'nearest' }));
  }
  clear() {
    this.sel = -1;
    this.selKey = '';
  }
  openItem(i: number, mode: 'neighbor' | 'neighbor-focus' | 'here') {
    const it = this.items[i];
    if (!it) return;
    this.choose(i);
    store.openFromAgenda(this.pane(), it.file, it.line, mode);
    if (mode === 'neighbor') queueMicrotask(() => this.el()?.focus()); // the focus stays in the agenda
  }
  keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      this.choose(this.sel + 1);
    } else if (e.key === 'ArrowUp' && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      this.choose(this.sel < 0 ? 0 : this.sel - 1);
    } else if (e.code === 'KeyZ' && e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && lists.canUndo) {
      // ⌘Z: the lists' own steps first (the window's ⌘Z takes the rest)
      e.preventDefault();
      void lists.undo();
    }
  }
  /** A click on no row takes the selection away. */
  clickEmpty(e: MouseEvent, row = '.item') {
    if (!(e.target as HTMLElement).closest(row)) this.clear();
  }
  readonly listId = $derived.by(() => 'agenda:' + this.pane());
  menu(e: MouseEvent, i: number) {
    this.choose(i);
    this.el()?.focus({ preventScroll: true });
    const sp = lists.spec(this.listId);
    if (sp) lists.openMenu(e, sp);
  }
  /** The hint bar: the keys as set now. */
  readonly hints = $derived.by(() => {
    const pair = (a: string, b: string) => (a && b && a.slice(0, -1) === b.slice(0, -1) ? `${a} ${b.slice(-1)}` : [a, b].filter(Boolean).join(' '));
    return [
      [store.keyHint('taskOpen'), 'открыть'],
      [pair(store.keyHint('taskStatusPrev'), store.keyHint('taskStatusNext')), 'статус'],
      [pair(store.keyHint('taskDatePrev'), store.keyHint('taskDateNext')), 'дата ±1 день'],
      [pair(store.keyHint('taskPrioUp'), store.keyHint('taskPrioDown')), 'приоритет'],
      [store.keyHint('taskSchedule'), 'запланировать'],
    ].filter(([k]) => k);
  });

  effects() {
    // a change not made from the lists (typed in the editor, from disk): the list is computed again, as before
    $effect(() => {
      const fz = this.frozen;
      if (!fz) return;
      if (lists.changedOutside(store.files, fz.texts)) untrack(() => this.refresh());
    });
    // another agenda, another day
    $effect(() => {
      void this.custom?.id;
      void this.midnight.getTime();
      untrack(() => this.refresh());
    });
    // the selection follows its row when the list is computed again; a task gone takes it away
    $effect(() => {
      if (!this.selKey) return;
      const i = this.items.findIndex((it) => it.key === this.selKey);
      if (i < 0) untrack(() => this.clear());
      else if (i !== untrack(() => this.sel)) this.sel = i;
    });
    // another agenda picked in the list: the selection starts over
    $effect(() => {
      void this.custom?.id;
      untrack(() => this.clear());
    });
    // the lists' part: the keys, the menu, the palette and the inspector act on the chosen task
    $effect(() => {
      const id = 'agenda:' + this.pane();
      return untrack(() =>
        lists.register({
          id,
          el: () => this.el(),
          tab: () => this.tab,
          selected: () => {
            const it = this.items[this.sel];
            return it ? { path: it.path, line: it.line, title: it.title, dk: it.dk } : null;
          },
          open: (other) => this.openItem(this.sel, other ? 'here' : 'neighbor'),
          otherLabel: 'Открыть здесь',
          clear: () => this.clear(),
          refresh: () => this.refresh(),
          freeze: () => this.freeze(),
        }),
      );
    });
  }
}
