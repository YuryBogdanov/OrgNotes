// The goals of the quarter (ТЗ 23) as a module of its own (roadmap 0.2): the sources, the views' data, the goal form,
// the 1-1 review, the report and the carry-over. It uses the core (`store`) only through what the core offers to
// every feature; the core knows nothing of it.

import { store, type NoteFile } from '../store.svelte';
import { closeTab, newTab, openGoals } from '../layout';
import { setPlanning, weekdayNames } from '../edits';
import { readGoals, readGoalSettings, GOALS_WORKFLOW, addSourceHeading, avatarColor, initials, insertGoal, quarterOf, readSource, sourceKey, withGoals, addMark, findGoal, shiftQuarter, goalsIn, moveGoal, reviewQueue as goalQueue, shortDay, GOAL_STATES, quarterLabel, carryOver, withGoalSettings, isSilent, deadlineSoon, isDone, DEFAULT_GOAL_SETTINGS, type GoalSettings, type Goal, type GoalSource, type NewGoal, type Quarter, type SourceGoals } from '../goals';
import { DEFAULT_SEQUENCE, parseHeadings, setKeyword, type Heading } from '../org';

export interface GoalReviewState {
  key: string;
  items: { title: string; q: Quarter }[];
  cur: number; // −1: «Разбор закончен»
  marks: number;
  closed: number;
  moved: number;
  draft: string; // the new mark
  date: Date | null; // its day; null = today
}
/** A source of goals as the views use it. */
export interface GoalPerson {
  src: GoalSource;
  key: string;
  file: NoteFile | undefined;
  data: SourceGoals;
  found: boolean; // the file and its heading are there
  ini: string;
  color: string;
  name: string; // «Мои цели» for mine
}

class Goals {
  // ---- goals of the quarter (ТЗ 23) ----------------------------------------------------------------------------
  /** Where the goals are: a file and its level-1 heading (`goals` in config.json). */
  goalSources = $state.raw<GoalSource[]>([]);
  /** «Цели квартала» in «Настройки → Агенды»: when a goal «молчит», how early a deadline is lit. */
  goalSettings = $state.raw<GoalSettings>(DEFAULT_GOAL_SETTINGS);
  async setGoalSettings(c: Partial<GoalSettings>) {
    const next = { ...this.goalSettings, ...c };
    this.goalSettings = next;
    return store.updateConfig((raw) => withGoalSettings(raw, next));
  }
  goalSilent = (g: Goal) => isSilent(g, new Date(), this.goalSettings.silent);
  goalSoon = (g: Goal, done: string[]) => deadlineSoon(g, done, new Date(), this.goalSettings.soon);
  /** «Отчёт за квартал»: `key` the person shown first ('*' = everybody). */
  goalReport = $state<{ key: string; n: number } | null>(null);
  openGoalReport(key = '*') {
    if (store.sheetOpen) return;
    this.goalReport = { key, n: Date.now() };
  }
  /** «Перенести незакрытые»: the list to confirm, from `goalsQuarter` to the next one. */
  goalCarry = $state<{ key: string; n: number } | null>(null);
  openGoalCarry(key = '*') {
    if (store.sheetOpen && !this.goalReport) return;
    this.goalReport = null;
    this.goalCarry = { key, n: Date.now() };
  }
  /** The open goals of the shown quarter: what «Перенести незакрытые» offers. */
  openGoalsOf(p: GoalPerson): Goal[] {
    const done = p.file?.wf.done ?? [];
    return goalsIn(p.data, this.goalsQuarter).filter((g) => !isDone(g, done));
  }
  /** Move the chosen open goals (titles per source) under the next quarter, one write per file. */
  async carryGoals(chosen: Map<string, string[]>): Promise<number> {
    const from = this.goalsQuarter;
    const to = shiftQuarter(from, 1);
    const steps: { path: string; text: string }[] = [];
    let n = 0;
    for (const [key, titles] of chosen) {
      const p = this.goalPeople.find((x) => x.key === key);
      const f = p?.file && store.files.find((x) => x.path === p.file!.path);
      if (!p || !f || !titles.length) continue;
      const r = carryOver(f.text, p.src.heading, from, to, titles, weekdayNames(f.text), (t) => parseHeadings(t, f.wf));
      if (r.moved.length) {
        steps.push({ path: f.path, text: r.text });
        n += r.moved.length;
      }
    }
    if (steps.length && !(await store.writeAll(`Перенос целей в ${quarterLabel(to)}`, steps))) return 0;
    this.goalCarry = null;
    this.goalsQuarter = to;
    store.note(`Перенесено в ${quarterLabel(to)}: ${n}`);
    return n;
  }
  /** The quarter the goals views show (the same in the navigator, the overview and a person's view). */
  goalsQuarter = $state<Quarter>(quarterOf(new Date()));
  /** Each source with its file and what is under its heading now; «Мои цели» first. */
  goalPeople = $derived.by((): GoalPerson[] =>
    this.goalSources
      .map((src) => {
        const file = store.files.find((f) => f.name === src.file);
        const data: SourceGoals = file ? readSource(file.text, file.headings, src.heading) : { head: -1, quarters: [] };
        return { src, key: sourceKey(src), file, data, found: !!file && data.head >= 0, ini: initials(src.title, src.me), color: avatarColor(src.file), name: src.me ? 'Мои цели' : src.title };
      })
      .sort((a, b) => Number(!!b.src.me) - Number(!!a.src.me) || a.name.localeCompare(b.name, 'ru')),
  );
  /** «Цели»: the overview (`*`) or one person, in the goals tab of the active pane. */
  openGoals(key = '*') {
    openGoals(store.layout, store.layout.active, key);
  }
  /** Open the file of a source at its heading (a double click in the navigator). */
  openGoalFile(key: string, line?: number) {
    const p = this.goalPeople.find((x) => x.key === key);
    if (!p?.file) return;
    const i = store.files.indexOf(p.file);
    store.open(i, line ?? (p.data.head >= 0 ? p.file.headings[p.data.head].line : 0));
  }
  /** «Цели на квартал» in the project's statuses, if no set knows ACTIVE (with «Задачи» if there were none). */
  private withGoalsWorkflow(raw: string | null): string {
    let base: Record<string, any> = {};
    try {
      const p = raw ? JSON.parse(raw) : null;
      if (p && typeof p === 'object' && !Array.isArray(p)) base = p;
    } catch {
      /* replaced */
    }
    const wfs: any[] = Array.isArray(base.workflows) ? base.workflows : [];
    if (wfs.some((w) => Array.isArray(w?.states) && w.states.some((x: any) => x?.name === 'ACTIVE'))) return raw ?? JSON.stringify(base);
    const def = { name: DEFAULT_SEQUENCE.name, states: DEFAULT_SEQUENCE.states.map((x) => (x.done ? { name: x.name, done: true } : { name: x.name })) };
    return JSON.stringify({ version: base.version ?? 1, ...base, workflows: [...(wfs.length ? wfs : [def]), GOALS_WORKFLOW] }, null, 2) + '\n';
  }
  /** «Добавить цели»: a source (made in the file first if asked); «мои» moves to it; `replace`: «Сменить заголовок…». */
  async addGoalSource(src: GoalSource, opts: { create?: boolean; replace?: string } = {}): Promise<boolean> {
    if (opts.create) {
      const f = store.files.find((x) => x.name === src.file);
      if (!f || !(await store.transaction(`Заголовок «${src.heading}»`, (tx) => tx.update(f.path, (t) => addSourceHeading(t, src.heading))))) return false;
    }
    const list = this.goalSources
      .filter((x) => sourceKey(x) !== sourceKey(src) && sourceKey(x) !== opts.replace)
      .map((x) => (src.me ? { ...x, me: undefined } : x));
    list.push(src);
    return store.updateConfig((raw) => withGoals(this.withGoalsWorkflow(raw), list));
  }
  async removeGoalSource(key: string) {
    return store.updateConfig((raw) => withGoals(raw, this.goalSources.filter((x) => sourceKey(x) !== key)));
  }
  async renameGoalSource(key: string, title: string) {
    const t = title.trim();
    if (!t) return false;
    return store.updateConfig((raw) => withGoals(raw, this.goalSources.map((x) => (sourceKey(x) === key ? { ...x, title: t } : x))));
  }
  /** «Новая цель»: written at once, at the end of its quarter (made if needed); a toast with «Открыть». */
  async addGoal(key: string, q: Quarter, g: NewGoal): Promise<boolean> {
    const p = this.goalPeople.find((x) => x.key === key);
    if (!p?.file || !g.title.trim()) return false;
    if (!(await store.updateConfig((raw) => this.withGoalsWorkflow(raw)))) return false;
    const f = store.files.find((x) => x.path === p.file!.path)!; // read again: the statuses may have changed
    const r = insertGoal(f.text, f.headings, p.src.heading, q, g, weekdayNames(f.text));
    if (!r || !(await store.writeAll(`Новая цель: ${g.title.trim()}`, [{ path: f.path, text: r.text }]))) return false;
    const path = f.path;
    store.note(`Цель добавлена — ${p.name}`, [{ label: 'Открыть', run: () => store.open(store.files.findIndex((x) => x.path === path), r.line) }]);
    return true;
  }
  /** The source whose file is in the editor (the goal form picks this person), if any. */
  goalKeyOfFile(): string | null {
    const name = store.file?.name;
    return (name && this.goalPeople.find((p) => p.src.file === name)?.key) || null;
  }
  /** The goal form: open, with a person chosen beforehand (the «+» of a group, the file in the editor). */
  goalForm = $state<{ key: string | null; n: number } | null>(null);
  openGoalForm(key: string | null = null) {
    if (store.sheetOpen) return;
    this.goalForm = { key, n: Date.now() };
  }
  /** «Добавить цели» / «Сменить заголовок…»: the dialog of sources. */
  goalAdd = $state<{ me?: boolean; replace?: string; file?: string; n: number } | null>(null);
  openGoalAdd(o: { me?: boolean; replace?: string; file?: string } = {}) {
    if (store.sheetOpen) return;
    this.goalAdd = { ...o, n: Date.now() };
  }

  // ---- the review of goals on 1-1 (ТЗ 23, part 2) -------------------------------------------------------------
  /**
   * The cards (a goal is known by its quarter and title: lines move with every edit), the card shown (−1: the
   * summary), what was done, and the new mark being written (it is saved when the card changes).
   */
  goalReview = $state<GoalReviewState | null>(null);
  /** The person and the goal of the card shown, read from the file now. */
  get goalCard() {
    const r = this.goalReview;
    if (!r || r.cur < 0) return null;
    const p = this.goalPeople.find((x) => x.key === r.key);
    const it = r.items[r.cur];
    const goal = p && it ? findGoal(p.data, it.q, it.title) : null;
    return p && it ? { p, it, goal } : null;
  }
  /** «Разобрать цели»: the open goals of the quarter, the silent first; `title`: start at that goal (⌥-click). */
  startGoalReview(key: string, title?: string) {
    const p = this.goalPeople.find((x) => x.key === key);
    if (!p?.file) return;
    const q = this.goalsQuarter;
    const queue = goalQueue(goalsIn(p.data, q), p.file.wf.done, new Date(), this.goalSettings.silent);
    if (!queue.length) {
      store.note(`Открытых целей в ${quarterLabel(q)} нет`);
      return;
    }
    const at = title ? Math.max(0, queue.findIndex((g) => g.title === title)) : 0;
    this.goalReview = { key, items: queue.map((g) => ({ title: g.title, q })), cur: at, marks: 0, closed: 0, moved: 0, draft: '', date: null };
    // one tab of the review: shown in the active pane
    const found = store.layout.panes.flatMap((pn, pi) => pn.tabs.map((t, ti) => ({ t, pi, ti }))).find((x) => x.t.kind === 'goalReview');
    if (found) {
      found.t.path = p.file.path;
      found.t.goals = key;
      store.activateTab(found.pi, found.ti);
    } else {
      const pn = store.layout.panes[store.layout.active];
      const at = pn.tabs.length ? pn.active + 1 : 0;
      pn.tabs.splice(at, 0, { ...newTab('goalReview', p.file.path), goals: key });
      pn.active = at;
    }
  }
  endGoalReview() {
    this.goalReview = null;
    for (const [pi, p] of store.layout.panes.entries())
      for (let ti = p.tabs.length - 1; ti >= 0; ti--) if (p.tabs[ti].kind === 'goalReview') closeTab(store.layout, pi, ti);
  }
  /** Write a step of the review to the person's file; `onUndo` puts the review's counters back. */
  private async goalWrite(label: string, make: (text: string, hs: Heading[], names: string[]) => string | null, onUndo?: () => void): Promise<boolean> {
    const c = this.goalCard;
    const f = c?.p.file && store.files.find((x) => x.path === c.p.file!.path);
    if (!c || !f) return false;
    const next = make(f.text, f.headings, weekdayNames(f.text));
    return !!next && next !== f.text && !!(await store.writeAll(`${label}: ${c.it.title}`, [{ path: f.path, text: next }], onUndo));
  }
  /** «Добавить отметку»: the text of the field under the chosen day (today by default), in date order. */
  async goalAddMark(): Promise<boolean> {
    const r = this.goalReview;
    const c = this.goalCard;
    if (!r || !c || !r.draft.trim()) return false;
    const date = r.date ?? new Date();
    const ok = await this.goalWrite('Отметка', (t, hs, names) => addMark(t, hs, c.p.src.heading, c.it.q, c.it.title, date, r.draft, names), () => {
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
  async goalComplete(): Promise<boolean> {
    const r = this.goalReview;
    const c = this.goalCard;
    if (!r || !c?.goal) return false;
    const done = c.p.file!.wf.done.includes(GOAL_STATES.done) ? GOAL_STATES.done : c.p.file!.wf.done[0];
    if (!done || c.goal.keyword === done) return false;
    const g = c.goal;
    const ok = await this.goalWrite('Цель достигнута', (t, hs) => {
      const h = hs.find((x) => x.line === g.line);
      return h ? setKeyword(t, h, done, store.files.find((x) => x.path === c.p.file!.path)!.wf) : null;
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
  async goalShiftDeadline(to: Date): Promise<boolean> {
    const r = this.goalReview;
    const c = this.goalCard;
    if (!r || !c?.goal) return false;
    const g = c.goal;
    const from = g.deadline;
    const mark = from ? `Срок перенесён: ${shortDay(from)} → ${shortDay(to)}` : `Срок: ${shortDay(to)}`;
    const ok = await this.goalWrite('Срок перенесён', (t, hs, names) => {
      const h = hs.find((x) => x.line === g.line);
      if (!h) return null;
      const t1 = setPlanning(t, h, 'DEADLINE', to);
      const f = store.files.find((x) => x.path === c.p.file!.path)!;
      return addMark(t1, parseHeadings(t1, f.wf), c.p.src.heading, c.it.q, c.it.title, new Date(), mark, names);
    }, () => {
      if (this.goalReview === r) r.moved = Math.max(0, r.moved - 1);
    });
    if (ok) r.moved++;
    return ok;
  }
  /** «Квартал»: the goal goes under another quarter; the card follows it. */
  async goalMoveQuarter(to: Quarter): Promise<boolean> {
    const r = this.goalReview;
    const c = this.goalCard;
    if (!r || !c?.goal) return false;
    const f = store.files.find((x) => x.path === c.p.file!.path)!;
    const at = r.cur;
    const ok = await this.goalWrite('Квартал', (t, hs) => moveGoal(t, hs, c.p.src.heading, c.it.q, c.it.title, to, (x) => parseHeadings(x, f.wf))?.text ?? null, () => {
      if (this.goalReview === r && r.items[at]) r.items[at] = { ...r.items[at], q: c.it.q }; // the card follows the goal back
    });
    if (ok) r.items[r.cur] = { ...c.it, q: to };
    return ok;
  }
  /** «Следующая» / «Назад»: a mark being written is saved first, without asking. */
  async goalStep(d: 1 | -1) {
    const r = this.goalReview;
    if (!r) return;
    if (r.draft.trim() && r.cur >= 0) await this.goalAddMark();
    r.draft = '';
    r.date = null;
    if (r.cur < 0) r.cur = d < 0 ? r.items.length - 1 : -1;
    else r.cur = r.cur + d >= r.items.length ? -1 : Math.max(0, r.cur + d);
  }

}

export const goals = new Goals();
store.onConfig((parsed) => {
  goals.goalSources = readGoals(parsed?.goals);
  goals.goalSettings = readGoalSettings(parsed?.goalSettings);
});
// its sheets: while one is open, the window's other sheets and keys wait
store.addSheet(() => !!(goals.goalForm || goals.goalAdd || goals.goalReport || goals.goalCarry));
