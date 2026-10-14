// The goals of the quarter (ТЗ 23) as the plugin «quarter-goals» (ТЗ 27): the sources, the views' data, the goal
// form, the 1-1 review, the report and the carry-over — on the public API only. The files are read through `core`
// (core.svelte.ts); every change of a file is a transaction of Org-level operations (ops.ts, ТЗ 30), one step of ⌘Z.

import { mount, unmount, type Component } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { Ctx, HeadingRef, Tx } from '@panopticon/api';
import { weekdayNames } from '@panopticon/api/org';
import { core, type PFile } from './core.svelte';
import {
  readGoals, readGoalSettings, sourcesJson, avatarColor, initials, quarterOf, readSource, sourceKey, findSource, cmpQuarter,
  shiftQuarter, goalsIn, reviewQueue as goalQueue, shortDay, GOAL_STATES, quarterLabel, isSilent, deadlineSoon,
  isDone, type GoalSettings, type Goal, type GoalSource, type NewGoal, type Quarter, type SourceGoals,
} from './goals';
import { addGoal, addMark, carryOver, moveGoal } from './ops';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A source of goals as the views use it. */
export interface GoalPerson {
  src: GoalSource;
  key: string;
  file: PFile | undefined;
  data: SourceGoals;
  found: boolean; // the file and its heading are there
  ini: string;
  color: string;
  name: string; // «Мои цели» for mine
}
/** The 1-1 review: what it did, the mark being written (its day). */
export interface GoalReviewState {
  key: string;
  /** «Отметки» unfolded on the left (a mark double-clicked), and the line shown there. */
  showMarks: boolean;
  rev: { line: number; n: number } | null;
  marks: number;
  closed: number;
  moved: number;
  draft: string;
  date: Date | null; // the day of the mark; null = today
}

export const OVERVIEW = 'quarter-goals.overview';

class Goals {
  ctx!: Ctx;
  // ---- where the goals are (the notes folder: `.orgnotes/plugins/quarter-goals.json`) and the thresholds (this Mac)
  goalSources = $state<GoalSource[]>([]);
  private saveSources(list: GoalSource[]) {
    this.goalSources = readGoals(sourcesJson(list));
    return this.ctx.storage.folder.set({ sources: sourcesJson(list) }).then(() => true);
  }
  goalSettings = $state<GoalSettings>(readGoalSettings(undefined));
  readStored() {
    this.goalSources = readGoals((this.ctx.storage.folder.get<{ sources?: unknown }>() ?? {}).sources);
    this.goalSettings = readGoalSettings(this.ctx.settings.values());
  }
  goalSilent = (g: Goal) => isSilent(g, new Date(), this.goalSettings.silent);
  goalSoon = (g: Goal, done: string[]) => deadlineSoon(g, done, new Date(), this.goalSettings.soon);

  /** The quarter the goals views show (the same in the navigator, the overview and a person's view). */
  goalsQuarter = $state<Quarter>(quarterOf(new Date()));
  /** Each source with its file and what is under its heading now; «Мои цели» first. */
  goalPeople = $derived.by((): GoalPerson[] =>
    this.goalSources
      .map((src) => {
        const file = core.files.find((f) => f.name === src.file);
        const data: SourceGoals = file ? readSource(file.text, file.headings, src.heading) : { head: -1, quarters: [] };
        return { src, key: sourceKey(src), file, data, found: !!file && data.head >= 0, ini: initials(src.title, src.me), color: avatarColor(src.file), name: src.me ? 'Мои цели' : src.title };
      })
      .sort((a, b) => Number(!!b.src.me) - Number(!!a.src.me) || a.name.localeCompare(b.name, 'ru')),
  );
  /** «Мои цели» in work this quarter, for the other plugins (`exports`: «Неделя» shows them in its plan). */
  myActiveGoals(): { title: string; ref: HeadingRef; deadline: string | null }[] {
    const me = this.goalPeople.find((p) => p.src.me && p.found);
    if (!me) return [];
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return goalsIn(me.data, quarterOf(new Date()))
      .filter((g) => g.keyword === GOAL_STATES.active)
      .map((g) => ({ title: g.title, ref: { path: me.src.file, line: g.line, title: g.title }, deadline: g.deadline ? iso(g.deadline) : null }));
  }
  /** The open goals of the shown quarter: what «Перенести незакрытые» offers. */
  openGoalsOf(p: GoalPerson): Goal[] {
    const done = p.file?.wf.done ?? [];
    return goalsIn(p.data, this.goalsQuarter).filter((g) => !isDone(g, done));
  }

  /** The colour of a status of another set (the core's tone of it), as the core's chips draw it. */
  private tones = new SvelteMap<string, string | null>();
  toneStyle(kw: string, path: string): string {
    const k = path + '\u0000' + kw;
    if (!this.tones.has(k)) {
      this.tones.set(k, null);
      void this.ctx.index!.statusTone(kw, path).then((t) => this.tones.set(k, t));
    }
    const t = this.tones.get(k);
    return t ? `--tl:var(--p-${t});--td:var(--p-${t})` : '';
  }

  /** «Новая цель…», «Разобрать цели…» only with a goal file found; «Цели: обзор квартала» with any source. */
  watchAvailable() {
    $effect.root(() => {
      $effect(() => {
        const found = this.goalPeople.some((p) => p.found);
        const any = this.goalSources.length > 0;
        this.ctx.commands.setAvailable('quarter-goals.new', found);
        this.ctx.commands.setAvailable('quarter-goals.review', found);
        this.ctx.commands.setAvailable('quarter-goals.overview', any);
      });
    });
  }

  // ---- the views -----------------------------------------------------------------------------------------------
  /** «Цели»: the overview (`*`) or one person, in the goals tab of the active pane. */
  openGoals(key = '*') {
    void this.ctx.ui.open(OVERVIEW, key);
  }
  /** The tab of ours shown: its person (the navigator marks it). */
  get shownKey(): string | null {
    return core.active.kind === OVERVIEW ? ((core.active.state as string | undefined) ?? '*') : null;
  }
  /** Open the file of a source at its heading (a double click in the navigator), or at a line. */
  openGoalFile(key: string, line?: number) {
    const p = this.goalPeople.find((x) => x.key === key);
    if (!p?.file) return;
    void this.ctx.commands.run('file.open', { path: p.file.path, line: line ?? (p.data.head >= 0 ? p.file.headings[p.data.head].line : 0) });
  }
  /** The source whose file is in the editor (the goal form picks this person), if any. */
  goalKeyOfFile(): string | null {
    const name = core.active.kind === 'file' ? core.active.path : null;
    return (name && this.goalPeople.find((p) => p.src.file === name)?.key) || null;
  }

  // ---- writing: Org-level operations (ops.ts), one step of ⌘Z --------------------------------------------------------
  /** A transaction on a file; `build` gives false when there is nothing to do. */
  private async write(label: string, path: string, build: (tx: Tx, names: string[]) => boolean | void, onUndo?: () => void): Promise<boolean> {
    const f = core.files.find((x) => x.path === path);
    if (!f) return false;
    const names = weekdayNames(f.text);
    let none = false;
    const r = await this.ctx.edit!.transaction(label, (tx) => void (none = build(tx, names) === false), onUndo ? { onUndo } : undefined);
    if (r === 'ok' && !none) await core.refresh(path); // the views follow at once
    return r === 'ok' && !none;
  }
  /** The source heading of a person (by its title, as the file has it now). */
  private srcRef(p: GoalPerson): HeadingRef | null {
    const f = p.file;
    const i = f ? findSource(f.headings, p.src.heading) : -1;
    return f && i >= 0 ? { path: f.path, line: f.headings[i].line, title: f.headings[i].title } : null;
  }

  // ---- the sources ------------------------------------------------------------------------------------------------
  /** «Добавить цели»: a source (made in the file first if asked); «мои» moves to it; `replace`: «Сменить заголовок…». */
  async addGoalSource(src: GoalSource, opts: { create?: boolean; replace?: string } = {}): Promise<boolean> {
    if (opts.create && !(await this.write(`Заголовок «${src.heading}»`, src.file, (tx) => void tx.insertHeading({ file: src.file, position: 'end' }, `* ${src.heading}`)))) return false;
    const list = this.goalSources
      .filter((x) => sourceKey(x) !== sourceKey(src) && sourceKey(x) !== opts.replace)
      .map((x) => (src.me ? { ...x, me: undefined } : x));
    list.push(src);
    return this.saveSources(list);
  }
  async removeGoalSource(key: string) {
    return this.saveSources(this.goalSources.filter((x) => sourceKey(x) !== key));
  }
  async renameGoalSource(key: string, title: string) {
    const t = title.trim();
    if (!t) return false;
    return this.saveSources(this.goalSources.map((x) => (sourceKey(x) === key ? { ...x, title: t } : x)));
  }

  /** «Новая цель»: written at once, at the end of its quarter (made if needed); a toast with «Открыть». */
  async addGoal(key: string, q: Quarter, g: NewGoal): Promise<boolean> {
    const p = this.goalPeople.find((x) => x.key === key);
    if (!p?.file || !g.title.trim()) return false;
    let line = 0;
    const src = this.srcRef(p);
    if (!src) return false;
    const ok = await this.write(`Новая цель: ${g.title.trim()}`, p.file.path, (tx, names) => {
      const r = addGoal(tx, src, q, g, names);
      if (r) line = r.line;
      return !!r;
    });
    if (!ok) return false;
    const path = p.file.path;
    this.ctx.ui.notify(`Цель добавлена — ${p.name}`, [{ label: 'Открыть', run: () => void this.ctx.commands.run('file.open', { path, line }) }]);
    return true;
  }
  /** Move the chosen open goals (titles per source) under the next quarter, one step for all the files. */
  async carryGoals(chosen: Map<string, string[]>): Promise<number> {
    const from = this.goalsQuarter;
    const to = shiftQuarter(from, 1);
    let n = 0;
    const jobs = [...chosen].flatMap(([key, titles]) => {
      const p = this.goalPeople.find((x) => x.key === key);
      const src = p && this.srcRef(p);
      return p?.file && src && titles.length ? [{ p, src, titles, names: weekdayNames(p.file.text) }] : [];
    });
    if (!jobs.length) return 0;
    const r = await this.ctx.edit!.transaction(`Перенос целей в ${quarterLabel(to)}`, (tx) => {
      for (const j of jobs) n += carryOver(tx, j.src, from, to, j.titles, j.names).length;
    });
    if (r !== 'ok') return 0;
    await Promise.all(jobs.map((j) => core.refresh(j.p.file!.path)));
    this.goalsQuarter = to;
    this.ctx.ui.notify(`Перенесено в ${quarterLabel(to)}: ${n}`);
    return n;
  }

  // ---- the sheets: drawn whole by the plugin, over the window (ui.sheet bare) ----------------------------------------
  sheetOpen = $state(false);
  async sheet<P extends Record<string, unknown>>(title: string, comp: Component<P & { close: () => void }>, props: P) {
    if (this.sheetOpen) return;
    this.sheetOpen = true;
    try {
      await this.ctx.ui.sheet({
        title, bare: true,
        render: (el, s) => {
          const app = mount(comp, { target: el, props: { ...props, close: () => s.close() } as P & { close: () => void } });
          return () => void unmount(app);
        },
      });
    } finally {
      this.sheetOpen = false;
    }
  }

  // ---- the 1-1 review: its state; its card is the core's (`ui.review`, review.svelte.ts) ----------------------------
  goalReview = $state<GoalReviewState | null>(null);
  /** The key of «Добавить отметку» as set now (the hint under the field). */
  get markKey() {
    return this.ctx.commands.keyOf('quarter-goals.mark');
  }
  /** A mark double-clicked: «Отметки» unfold on the left, the caret on it. */
  showMark(line: number) {
    const r = this.goalReview;
    if (!r) return;
    r.showMarks = true;
    r.rev = { line, n: Date.now() };
    this.ctx.ui.currentReview()?.redraw();
  }
  /** The person and the goal of the card shown, read from the file now (by its title, the nearest to its line). */
  cardOf(ref: HeadingRef) {
    const r = this.goalReview;
    const p = r && this.goalPeople.find((x) => x.key === r.key);
    if (!r || !p?.file) return null;
    let best: { q: Quarter; goal: Goal } | null = null;
    for (const x of p.data.quarters)
      for (const g of x.goals)
        if (g.title === ref.title && (!best || Math.abs(g.line - ref.line) < Math.abs(best.goal.line - ref.line))) best = { q: x.q, goal: g };
    return { p, goal: best?.goal ?? null, q: best?.q ?? null, file: p.file };
  }
  /** Write a step of the review to the person's file, on the card's goal; `onUndo` puts the review's counters back. */
  async reviewWrite(ref: HeadingRef, label: string, build: (tx: Tx, goal: HeadingRef, names: string[], c: NonNullable<ReturnType<Goals['cardOf']>>) => boolean | void, onUndo?: () => void) {
    const c = this.cardOf(ref);
    if (!c?.goal) return false;
    const h = c.file.headings.find((x) => x.line === c.goal!.line);
    if (!h) return false;
    const goal = { path: c.file.path, line: h.line, title: h.title };
    return this.write(`${label}: ${c.goal.title}`, c.file.path, (tx, names) => build(tx, goal, names, c), onUndo);
  }
  /** «Добавить отметку»: the text of the field under the chosen day (today by default), in date order. */
  async goalAddMark(ref: HeadingRef): Promise<boolean> {
    const r = this.goalReview;
    if (!r || !r.draft.trim()) return false;
    const date = r.date ?? new Date();
    const text = r.draft;
    const ok = await this.reviewWrite(ref, 'Отметка', (tx, goal, names) => addMark(tx, goal, date, text, names), () => {
      if (this.goalReview === r) r.marks = Math.max(0, r.marks - 1);
    });
    if (ok) {
      r.marks++;
      r.draft = '';
      r.date = null;
    }
    return ok;
  }
  /** «Цель достигнута»: COMPLETED with CLOSED; the field is ready for «Итог:». */
  async goalComplete(ref: HeadingRef): Promise<boolean> {
    const r = this.goalReview;
    const c = this.cardOf(ref);
    if (!r || !c?.goal) return false;
    const done = c.file.wf.done.includes(GOAL_STATES.done) ? GOAL_STATES.done : c.file.wf.done[0];
    if (!done || c.goal.keyword === done) return false;
    const ok = await this.reviewWrite(ref, 'Цель достигнута', (tx, goal) => void tx.setStatus(goal, done), () => {
      if (this.goalReview === r) r.closed = Math.max(0, r.closed - 1);
    });
    if (ok) {
      r.closed++;
      if (!r.draft.trim()) r.draft = 'Итог: ';
    }
    return ok;
  }
  /** «Сдвинуть срок…»: the new DEADLINE and a mark «Срок перенесён: 30 ноя → 15 дек». */
  async goalShiftDeadline(ref: HeadingRef, to: Date): Promise<boolean> {
    const r = this.goalReview;
    const c = this.cardOf(ref);
    if (!r || !c?.goal) return false;
    const from = c.goal.deadline;
    const mark = from ? `Срок перенесён: ${shortDay(from)} → ${shortDay(to)}` : `Срок: ${shortDay(to)}`;
    const ok = await this.reviewWrite(ref, 'Срок перенесён', (tx, goal, names) => {
      tx.setPlanning(goal, 'DEADLINE', to);
      return addMark(tx, goal, new Date(), mark, names);
    }, () => {
      if (this.goalReview === r) r.moved = Math.max(0, r.moved - 1);
    });
    if (ok) r.moved++;
    return ok;
  }
  /** The goal at this heading, if it is one (by its title, the nearest to its line): its person and the goal. */
  goalAt(ref: HeadingRef) {
    const p = this.goalPeople.find((x) => x.found && x.file?.name === ref.path);
    let best: Goal | null = null;
    for (const q of p?.data.quarters ?? [])
      for (const g of q.goals) if (g.title === ref.title && (!best || Math.abs(g.line - ref.line) < Math.abs(best.line - ref.line))) best = g;
    return p && best ? { p, goal: best } : null;
  }
  /** «Добавить отметку…» of a task's menu in a list (ТЗ 34): the text and the day in the core's sheet, then the mark. */
  async markFromList(ref: HeadingRef): Promise<boolean> {
    const at = this.goalAt(ref);
    if (!at?.p.file) return false;
    const v = await this.ctx.ui.form({
      title: `Отметка: ${at.goal.title}`,
      groups: [{ fields: [
        { type: 'textarea', key: 'text', label: 'Отметка', placeholder: 'Что сделано, что мешает' },
        { type: 'date', key: 'day', label: 'День', look: 'chip' },
      ] }],
      submit: 'Добавить',
      initial: { text: '', day: iso(new Date()) },
      validate: (x) => (String(x.text ?? '').trim() ? null : 'Напишите отметку'),
    });
    if (!v) return false;
    const day = typeof v.day === 'string' ? new Date(+v.day.slice(0, 4), +v.day.slice(5, 7) - 1, +v.day.slice(8, 10)) : new Date();
    const f = at.p.file;
    const h = f.headings.find((x) => x.line === at.goal.line);
    if (!h) return false;
    const goal = { path: f.path, line: h.line, title: h.title };
    return this.write(`Отметка: ${at.goal.title}`, f.path, (tx, names) => addMark(tx, goal, day, String(v.text), names));
  }
  /** «Квартал»: the goal goes under another quarter; the card follows it (the core finds it by its title). */
  async goalMoveQuarter(ref: HeadingRef, to: Quarter): Promise<boolean> {
    const c = this.cardOf(ref);
    if (!c?.goal || !c.q) return false;
    if (cmpQuarter(c.q, to) === 0) return false;
    const src = this.srcRef(c.p);
    return !!src && this.reviewWrite(ref, 'Квартал', (tx, goal) => moveGoal(tx, src, goal, to));
  }
}

export const goals = new Goals();
