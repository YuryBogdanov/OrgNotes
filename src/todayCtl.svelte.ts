import { untrack } from 'svelte';
import { store } from './store.svelte';
import { openFile } from './layout';
import { actionOf } from './views';
import { entriesIn } from './calIndex';
import { runAgenda } from './agendas';
import { firstOpen, sequenceFor, titleIndex, toneFor } from './org';
import { toneStyle } from './colors';
import { weekdayNames } from './edits';
import { today } from './todayState.svelte';
import { allTodayBlocks, arrange, todayBlockOf } from './todayBlocks';
import { oneOnOnes } from './oneOnOne';
import { lists, type DateKind, type ListTask } from './taskLists.svelte';
import { agendaRows, doneStatus, focusRows, journalDays, lastDay, overdue, taskGroups, type OverdueRow, type TaskRow } from './today';

// The workings of «Сегодня» (ТЗ 32 §2), out of Today.svelte so the old screen and the new one (ТЗ 45 §2) are one:
// the journal's note and choice, the agenda of the day, the tasks by file, the overdue ones, the 1-1s; the rows as one
// list of tasks (ТЗ 34) — the one chosen, the keys, the rows kept as drawn until a refresh; the blocks laid out; the
// actions. The component gives its pane and its element and calls `effects()` once.

/** A row as the screen draws it: its task, and the name it keeps whatever its line. */
export type Row = { path: string; line: number; title: string; kw: string | null; slot: string; n: number; stale?: boolean; gone?: boolean };
export const LATE_CAP = 6;

export class TodayCtl {
  /** `list`: the name of its list of tasks — the screen's «today», the sidebar's panel its own (ТЗ 50 §4.1). */
  constructor(private pane: () => number, private el: () => HTMLElement | undefined, private list = 'today') {}

  readonly cfg = $derived(today.folder);
  readonly day = $derived(today.day);
  readonly now = $derived(today.now);
  readonly files = $derived(store.agendaFiles);
  tone = (kw: string, path: string) => {
    const f = this.files.find((x) => x.path === path);
    return f && kw ? toneStyle(toneFor(kw, f.wf)) : '';
  };

  // ---- the rows as one list of tasks (ТЗ 34) ----
  /** Which of the headings with its title in its file a row's task is: its name whatever its line. */
  private nOf(path: string, line: number, title: string) {
    return titleIndex(this.files.find((x) => x.path === path)?.headings ?? [], line, title);
  }
  /** Rows changed from the list stay as they were until a refresh (`frozen`): drawn with the task's values now. */
  // the rows of three kinds, as they were drawn
  private frozen = $state.raw<{ agenda: any[]; groups: { file: string; rows: any[] }[]; late: any[]; texts: Map<string, string> } | null>(null);
  private shownRows<T extends { path: string; line: number; title: string; kw: string | null }>(block: string, live: T[], was: (T & Row)[] | undefined): (T & Row)[] {
    const rows = live.map((r) => {
      const n = this.nOf(r.path, r.line, r.title);
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
  readonly journal = $derived.by(() => this.files.find((f) => f.name === this.cfg.journal));
  readonly jd = $derived.by(() => (this.journal ? lastDay(journalDays(this.journal), this.day) : null));
  readonly focus = $derived.by(() => (this.jd ? focusRows(this.jd.focus, this.files, this.day) : []));
  readonly focusRows = $derived.by(() =>
    this.focus.map((f) => ({ ...f, task: f.task ? { ...f.task, slot: `f|${f.task.path}|${f.task.title}|${this.nOf(f.task.path, f.task.line, f.task.title)}`, n: 0 } : null })),
  );

  // ---- the agenda of the day ----
  readonly agendaId = $derived.by(() => (store.agendas.some((a) => a.id === this.cfg.agenda) ? this.cfg.agenda : ''));
  private readonly agendaLive = $derived.by(() => {
    let list = entriesIn(this.files, this.day, this.day);
    const a = store.agendas.find((x) => x.id === this.agendaId);
    if (a) {
      const keys = new Set(runAgenda(a, this.files, this.day).flatMap((r) => r.groups.flatMap((g) => g.tasks.map((t) => t.path + '#' + t.line))));
      list = list.filter((e) => keys.has(e.file + '#' + e.line));
    }
    return agendaRows(list, this.files, this.day, this.now, this.cfg.tag);
  });
  readonly agenda = $derived.by(() => this.shownRows('a', this.agendaLive, this.frozen?.agenda));

  // ---- the tasks, the overdue ones ----
  private readonly groupsLive = $derived.by(() => taskGroups(this.files, this.cfg.statuses, today.taskFiles));
  readonly groups = $derived.by(() =>
    this.groupsLive.map((g, gi) => ({ ...g, rows: this.shownRows('t' + g.file, g.rows, this.frozen?.groups[gi]?.file === g.file ? this.frozen.groups[gi].rows : undefined) })),
  );
  readonly tasksTotal = $derived.by(() => this.groups.reduce((n, g) => n + g.total, 0));
  private readonly lateLive = $derived.by(() => overdue(this.cfg.overdueAll ? this.files : this.files.filter((f) => today.taskFiles.includes(f.name)), this.day));
  readonly late = $derived.by(() => this.shownRows('o', this.lateLive, this.frozen?.late));

  private freeze() {
    if (!this.frozen) this.frozen = { agenda: this.agenda, groups: this.groups.map((g) => ({ file: g.file, rows: g.rows })), late: this.late, texts: new Map(store.files.map((f) => [f.path, f.text])) };
  }
  private refresh() {
    this.frozen = null;
  }

  // ---- the chosen row: its slot; the task and the date it stands by come from the row ----
  selKey = $state('');
  readonly chosen = $derived.by((): (ListTask & { slot: string }) | null => {
    const k = this.selKey;
    if (!k) return null;
    const pick = (r: Row, dk: DateKind | null) => ({ path: r.path, line: r.line, title: r.title, dk, slot: r.slot });
    for (const f of this.focusRows) if (f.task?.slot === k) return pick(f.task, null);
    for (const a of this.agenda) if (a.slot === k) return pick(a, a.kind === 'event' ? 'event' : a.kind === 'deadline' ? 'DEADLINE' : 'SCHEDULED');
    for (const g of this.groups) for (const r of g.rows) if (r.slot === k) return pick(r, null);
    for (const r of this.late) if (r.slot === k) return pick(r, r.kind);
    return null;
  });
  private rowsOnScreen = () => [...(this.el()?.querySelectorAll<HTMLElement>('[data-k]') ?? [])];
  choose(k: string) {
    this.selKey = k;
    queueMicrotask(() => {
      const b = this.rowsOnScreen().find((x) => x.dataset.k === k);
      b?.focus({ preventScroll: true });
      b?.scrollIntoView({ block: 'nearest' });
    });
  }
  readonly listId = $derived.by(() => this.list + ':' + this.pane());
  keydown(e: KeyboardEvent) {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) {
      if (e.code === 'KeyZ' && e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && lists.canUndo) {
        e.preventDefault();
        void lists.undo();
      }
      return;
    }
    const rows = this.rowsOnScreen();
    if (!rows.length) return;
    e.preventDefault();
    const i = rows.findIndex((x) => x.dataset.k === this.selKey);
    const j = i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    this.choose(rows[j].dataset.k!);
  }
  clickEmpty(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('[data-k], button, a, input')) this.selKey = '';
  }
  private openChosen(other: boolean) {
    const t = this.chosen;
    if (!t) return;
    const fi = store.files.findIndex((f) => f.path === t.path);
    if (other) store.openFromAgenda(this.pane(), fi, t.line, 'neighbor-focus');
    else this.open(t.path, t.line);
  }
  menu(e: MouseEvent, k: string) {
    this.choose(k);
    const sp = lists.spec(this.listId);
    if (sp) queueMicrotask(() => lists.openMenu(e, sp));
    e.preventDefault();
  }

  // ---- 1-1: the meetings of the day ----
  readonly meetings = $derived.by(() => oneOnOnes(this.files, this.day, this.cfg.tag));

  // ---- the blocks laid out ----
  private shown = (id: string) => {
    const b = todayBlockOf(id);
    const empty: Record<string, () => boolean> = { overdue: () => !this.late.length, oneOnOne: () => !this.meetings.length };
    if (!b || (b.empty?.() ?? empty[id]?.() ?? false)) return undefined;
    return b;
  };
  /** A plugin's block left out stays drawn out of sight: it can come back by itself. */
  readonly resting = $derived.by(() => today.blocks.filter((o) => o.on && todayBlockOf(o.id)?.component && !this.shown(o.id)).map((o) => o.id));
  readonly layout = $derived.by(() => {
    void allTodayBlocks();
    return arrange(today.blocks, this.shown);
  });

  // ---- actions ----
  open(path: string, line: number) {
    openFile(store.layout, this.pane(), path, line, { focus: true });
    store.layout.active = this.pane();
  }
  private ref = (r: TaskRow) => ({ path: r.path, line: r.line, title: r.title });
  async tick(r: TaskRow) {
    const f = this.files.find((x) => x.path === r.path);
    if (!f) return;
    const to = r.done ? firstOpen(sequenceFor(f.wf, r.kw)) : doneStatus(r.kw, f.wf);
    if (to) await store.transaction(r.done ? 'Вернуть задачу' : 'Задача выполнена', (tx) => tx.setStatus(this.ref(r), to));
  }
  async move(r: OverdueRow, d: Date) {
    await store.transaction('Перенести задачу', (tx) => r.kinds.forEach((k) => tx.setPlanning(this.ref(r), k, d)));
  }
  shift(n: number) {
    const d = new Date(this.day);
    d.setDate(d.getDate() + n);
    return d;
  }
  pick(r: OverdueRow) {
    const f = this.files.find((x) => x.path === r.path);
    store.openCalendar({ kind: r.kind, initial: this.day, current: r.date, names: weekdayNames(f?.text ?? ''), pick: (d) => void this.move(r, d) });
  }
  openAgenda() {
    if (this.agendaId) store.openAgendaHere(this.agendaId);
    else store.showAgendaHere();
  }
  isInbox = (p: string) => p === (store.inboxCfg.file || 'inbox.org');
  readonly review = $derived(actionOf('inbox.review'));
  readonly key = $derived(store.keyHint('today'));

  /** The screen's effects: a change not made from the lists computed again; the chosen row's task gone — no
   *  selection; the focus kept on the chosen row redrawn; the screen a list of tasks. */
  effects() {
    $effect(() => {
      const fz = this.frozen;
      if (!fz) return;
      if (lists.changedOutside(store.files, fz.texts)) untrack(() => this.refresh());
    });
    $effect(() => {
      void this.day.getTime();
      untrack(() => this.refresh());
    });
    $effect(() => {
      if (this.selKey && !this.chosen) untrack(() => (this.selKey = ''));
    });
    // The chosen row had the focus and was drawn anew (a block came or went with the folder read, a plugin's block
    // came): the focus left with the old button — it goes to the new one, so the list's keys keep working.
    let rowFocus = false;
    $effect(() => {
      const node = this.el();
      if (!node) return;
      const into = (e: FocusEvent) => (rowFocus = !!(e.target as HTMLElement).closest?.('[data-k]') && node.contains(e.target as Node));
      document.addEventListener('focusin', into);
      const watch = new MutationObserver(() => {
        if (!rowFocus || !this.selKey || (document.activeElement && document.activeElement !== document.body)) return;
        this.rowsOnScreen().find((x) => x.dataset.k === this.selKey)?.focus({ preventScroll: true });
      });
      watch.observe(node, { childList: true, subtree: true });
      return () => {
        document.removeEventListener('focusin', into);
        watch.disconnect();
      };
    });
    $effect(() => {
      const id = this.listId;
      return untrack(() =>
        lists.register({
          id,
          el: () => this.el(),
          tab: () => store.layout.panes[this.pane()]?.tabs[store.layout.panes[this.pane()].active],
          selected: () => {
            const t = this.chosen;
            return t ? { path: t.path, line: t.line, title: t.title, dk: t.dk } : null;
          },
          open: (other) => this.openChosen(other),
          clear: () => (this.selKey = ''),
          refresh: () => this.refresh(),
          freeze: () => this.freeze(),
        }),
      );
    });
  }
}
