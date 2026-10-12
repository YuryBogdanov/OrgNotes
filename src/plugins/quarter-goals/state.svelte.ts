// The goals of the quarter (ТЗ 23) as the plugin «quarter-goals» (ТЗ 27): the sources, the views' data, the goal
// form, the 1-1 review, the report and the carry-over — on the public API only. The files are read through `core`
// (core.svelte.ts); every change of a file is a transaction of the plugin's own function (`tx.update`), one step of ⌘Z.

import { mount, unmount, type Component } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { Ctx, HeadingRef } from '@panopticon/api';
import { parseHeadings, setKeyword, setPlanning, weekdayNames, workflow, type Heading } from '@panopticon/api/org';
import { core, type PFile } from './core.svelte';
import {
  readGoals, readGoalSettings, sourcesJson, addSourceHeading, avatarColor, initials, insertGoal, quarterOf, readSource, sourceKey, addMark,
  shiftQuarter, goalsIn, moveGoal, reviewQueue as goalQueue, shortDay, GOAL_STATES, quarterLabel, carryOver, isSilent, deadlineSoon,
  isDone, type GoalSettings, type Goal, type GoalSource, type NewGoal, type Quarter, type SourceGoals,
} from './goals';

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

  // ---- writing: the plugin's function on the file's text now, one step of ⌘Z ----------------------------------------
  private async write(label: string, path: string, make: (text: string, hs: Heading[], names: string[]) => string | null, onUndo?: () => void): Promise<boolean> {
    const f = core.files.find((x) => x.path === path);
    if (!f) return false;
    const wf = workflow(f.wf);
    const r = await this.ctx.edit!.transaction(label, (tx) => tx.update(path, (t) => make(t, parseHeadings(t, wf), weekdayNames(t))), onUndo ? { onUndo } : undefined);
    if (r === 'ok') await core.refresh(path); // the views follow at once
    return r === 'ok';
  }

  // ---- the sources ------------------------------------------------------------------------------------------------
  /** «Добавить цели»: a source (made in the file first if asked); «мои» moves to it; `replace`: «Сменить заголовок…». */
  async addGoalSource(src: GoalSource, opts: { create?: boolean; replace?: string } = {}): Promise<boolean> {
    if (opts.create && !(await this.write(`Заголовок «${src.heading}»`, src.file, (t) => addSourceHeading(t, src.heading)))) return false;
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
    const ok = await this.write(`Новая цель: ${g.title.trim()}`, p.file.path, (t, hs, names) => {
      const r = insertGoal(t, hs, p.src.heading, q, g, names);
      if (r) line = r.line;
      return r?.text ?? null;
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
      return p?.file && titles.length ? [{ p, titles, wf: workflow(p.file.wf) }] : [];
    });
    if (!jobs.length) return 0;
    const r = await this.ctx.edit!.transaction(`Перенос целей в ${quarterLabel(to)}`, (tx) => {
      for (const j of jobs)
        tx.update(j.p.file!.path, (t) => {
          const res = carryOver(t, j.p.src.heading, from, to, j.titles, weekdayNames(t), (x) => parseHeadings(x, j.wf));
          n += res.moved.length;
          return res.moved.length ? res.text : null;
        });
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
  /** Write a step of the review to the person's file; `onUndo` puts the review's counters back. */
  async reviewWrite(ref: HeadingRef, label: string, make: (text: string, hs: Heading[], names: string[], c: NonNullable<ReturnType<Goals['cardOf']>>) => string | null, onUndo?: () => void) {
    const c = this.cardOf(ref);
    if (!c?.goal) return false;
    return this.write(`${label}: ${c.goal.title}`, c.file.path, (t, hs, names) => make(t, hs, names, c), onUndo);
  }
  /** «Добавить отметку»: the text of the field under the chosen day (today by default), in date order. */
  async goalAddMark(ref: HeadingRef): Promise<boolean> {
    const r = this.goalReview;
    if (!r || !r.draft.trim()) return false;
    const date = r.date ?? new Date();
    const text = r.draft;
    const ok = await this.reviewWrite(ref, 'Отметка', (t, hs, names, c) => addMark(t, hs, c.p.src.heading, c.q!, c.goal!.title, date, text, names), () => {
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
    const line = c.goal.line;
    const wf = workflow(c.file.wf);
    const ok = await this.reviewWrite(ref, 'Цель достигнута', (t, hs) => {
      const h = hs.find((x) => x.line === line);
      return h ? setKeyword(t, h, done, wf) : null;
    }, () => {
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
    const line = c.goal.line;
    const mark = from ? `Срок перенесён: ${shortDay(from)} → ${shortDay(to)}` : `Срок: ${shortDay(to)}`;
    const wf = workflow(c.file.wf);
    const ok = await this.reviewWrite(ref, 'Срок перенесён', (t, hs, names, cc) => {
      const h = hs.find((x) => x.line === line);
      if (!h) return null;
      const t1 = setPlanning(t, h, 'DEADLINE', to);
      return addMark(t1, parseHeadings(t1, wf), cc.p.src.heading, cc.q!, cc.goal!.title, new Date(), mark, names);
    }, () => {
      if (this.goalReview === r) r.moved = Math.max(0, r.moved - 1);
    });
    if (ok) r.moved++;
    return ok;
  }
  /** «Квартал»: the goal goes under another quarter; the card follows it (the core finds it by its title). */
  async goalMoveQuarter(ref: HeadingRef, to: Quarter): Promise<boolean> {
    const c = this.cardOf(ref);
    if (!c?.goal || !c.q) return false;
    const wf = workflow(c.file.wf);
    const from = c.q;
    return this.reviewWrite(ref, 'Квартал', (t, hs, _n, cc) => moveGoal(t, hs, cc.p.src.heading, from, cc.goal!.title, to, (x) => parseHeadings(x, wf))?.text ?? null);
  }
}

export const goals = new Goals();
