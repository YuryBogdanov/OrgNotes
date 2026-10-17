// «Обход долгих дел» (ТЗ 41 §2–§4): the matters of «Пора проверить», one by one, on the core's review in the file
// (`ui.review`, `place: 'file'`): the editor narrowed to the matter, the files in turn. On each — what is with it now
// (the field of the card: ↩ writes a note into its :LOGBOOK:) and a decision: «Продолжаем», «Ждём…», «Осмотрено»,
// «В архив», «Закрыть»; the status typed and not written yet goes in the same step as the decision (one ⌘Z).

import { mount, unmount } from 'svelte';
import type { HeadingInfo, HeadingRef, ReviewMark, Tx } from '@panopticon/api';
import { long } from './state.svelte';
import { addDays, ageWords, shortDay, shown, stampOf, type Matter } from './long';
import { namesOf, statusAfterWaiting, wait, write } from './actions';
import WalkCard from './WalkCard.svelte';

/** «Проверить снова через» (§3.5): a week, two, a month, a day chosen. */
export const AGAIN = [
  { id: 'w1', label: 'неделя', days: 7 },
  { id: 'w2', label: '2 нед.', days: 14 },
  { id: 'm1', label: 'месяц', days: 30 },
] as const;
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const dayWords = (d: Date) => `${WD[d.getDay()]}, ${shortDay(d)}`;
const today = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

interface Run {
  items: Matter[];
  /** What became of each matter. */
  marks: (ReviewMark | null)[];
}

class Walk {
  run = $state<Run | null>(null);
  /** The status typed in the card and not written yet. */
  draft = $state('');
  /** «Проверить снова через»: the days, or a day; kept till the walk ends (the norm by default). */
  again = $state<{ days: number } | { day: Date }>({ days: 14 });

  /** The days «Продолжаем» and «Ждём…» without a date look again in. */
  get days() {
    const a = this.again;
    return 'days' in a ? a.days : Math.max(1, Math.round((+a.day - +today()) / 86_400_000));
  }
  /** «2 нед.», «пт, 23 окт»: the choice in words, for the queue. */
  get againWords() {
    const a = this.again;
    if ('day' in a) return dayWords(a.day);
    return AGAIN.find((x) => x.days === a.days)?.label ?? `${a.days} дн.`;
  }
  /** The next look of the matters not due now: «Ближайшая проверка — пт, 23 окт». */
  nearest(): string {
    const all = [...long.groups.waiting, ...long.groups.ok].map((r) => r.s.due).filter((d): d is Date => !!d);
    const d = all.sort((a, b) => +a - +b)[0];
    return d ? `Ближайшая проверка — ${dayWords(d)}` : '';
  }

  /** ⌃⌘O, the buttons: a walk of «Пора проверить» in the list's order; none — said, and no walk. */
  start() {
    const ctx = long.ctx;
    const due = long.groups.due.map((r) => r.m);
    if (!due.length) {
      const near = this.nearest();
      return ctx.ui.notify(`Проверять нечего.${near ? ' ' + near : ''}`);
    }
    this.run = { items: due, marks: due.map(() => null) };
    const run = this.run;
    this.draft = '';
    this.again = { days: long.settings.norm };
    void ctx.ui.review({
      place: 'file',
      title: 'Обход долгих дел',
      items: due.map((m) => long.refOf(m)),
      backCommand: 'long-matters.walk.back',
      noSkip: true,
      mark: (i) => run.marks[i] ?? null,
      header: (h) => this.ageOf(h),
      queueNote: (h) => ({ text: this.ageOf(h), late: true }),
      below: (el, ref) => {
        const app = mount(WalkCard, { target: el, props: { at: ref } });
        return () => void unmount(app);
      },
      endNote: () => `Пора проверить: ${long.groups.due.length}.${this.nearest() ? ' ' + this.nearest() : ''}`,
      onClose: () => {
        if (this.run === run) this.run = null;
      },
      actions: [
        { id: 'continue', label: 'Продолжаем', kind: 'primary', subOf: (h) => this.unwaitWords(h), command: 'long-matters.walk.continue', run: (h) => this.decide(h, (m) => this.goOn(m)) },
        { id: 'wait', label: 'Ждём…', command: 'long-matters.walk.wait', run: (h) => this.decide(h, (m) => this.waitFor(m)) },
        { id: 'seen', label: 'Осмотрено', sub: 'всё ок', command: 'long-matters.walk.seen', run: (h) => this.decide(h, (m) => this.seen(m)) },
        { id: 'archive', label: 'В архив', command: 'long-matters.walk.archive', run: (h) => this.decide(h, (m) => this.archive(m)) },
        { id: 'close', label: 'Закрыть', sub: 'DONE', subOf: (h) => this.closingOf(h), kind: 'ok', command: 'long-matters.walk.close', run: (h) => this.decide(h, (m) => this.close(m)) },
        { id: 'next', label: 'Дальше', hidden: true, command: 'long-matters.walk.next', run: (h) => this.decide(h, (m) => this.pass(m)) },
      ],
    });
  }
  /** «WAIT → NEXT» on «Продолжаем» for a matter that waits (its status back). */
  private unwaitWords(h: HeadingInfo): string | null {
    const m = this.matterOf(h.ref);
    if (!m?.waiting || m.keyword !== long.settings.wait) return null;
    const back = statusAfterWaiting(m);
    return back ? `${m.keyword} → ${back}` : null;
  }
  /** The status «Закрыть» writes: the first done one of the matter's set. */
  private closingOf(h: HeadingInfo): string | null {
    const m = this.matterOf(h.ref);
    const f = m && long.files.get(m.path);
    const set = f?.info.sets.find((s) => s.states.some((x) => x.name === m!.keyword));
    return set?.states.find((x) => x.done)?.name ?? f?.info.done[0] ?? null;
  }
  /** «23 дн.»: how long untouched, for the queue. */
  private ageOf(h: HeadingInfo) {
    const m = this.matterOf(h.ref);
    return m ? ageWords(shown(m, long.today, long.settings.norm), m) : '';
  }
  /** The matter of a card: by its place, else by its title in its file (lines move as it is written). */
  matterOf(ref: HeadingRef): Matter | undefined {
    const r = this.run;
    return long.at(ref) ?? long.matters.find((m) => m.path === ref.path && m.title === ref.title) ?? r?.items.find((m) => m.path === ref.path && m.title === ref.title);
  }
  /** The matter as it is now, with a decision: its mark, then the next card; none (cancelled) — this one again. */
  private async decide(h: HeadingInfo, fn: (m: Matter) => Promise<ReviewMark | null>): Promise<'next' | 'stay'> {
    const r = this.run;
    const m = this.matterOf(h.ref);
    if (!r || !m) return 'stay';
    const i = r.items.findIndex((x) => x.key === m.key || (x.path === m.path && x.title === m.title));
    const mark = await fn({ ...m, line: h.ref.line, title: h.ref.title });
    if (!mark) return 'stay';
    if (i >= 0) r.marks[i] = mark;
    this.draft = '';
    return 'next';
  }
  /** The status typed, as a note in the same step (§3: before the decision). */
  private note(m: Matter) {
    const t = this.draft.trim();
    return t ? (tx: Tx) => tx.addNote(long.refOf(m), t) : null;
  }
  /** ↩ in the field: the note now, the focus stays (§3.3). */
  async writeNote(ref: HeadingRef) {
    const m = this.matterOf(ref);
    const t = this.draft.trim();
    if (!m || !t) return false;
    const ok = await write('Заметка', (tx) => tx.addNote({ ...long.refOf(m), line: ref.line, title: ref.title }, t));
    if (ok) this.draft = '';
    return ok;
  }

  // ---- the decisions (§3.4) -------------------------------------------------------------------------------------
  /** «Продолжаем»: no more waiting (its status back), the next look in the days chosen. */
  private async goOn(m: Matter): Promise<ReviewMark | null> {
    const back = m.waiting && m.keyword === long.settings.wait ? statusAfterWaiting(m) : undefined;
    const day = 'day' in this.again ? this.again.day : addDays(today(), this.again.days);
    const note = this.note(m);
    const ok = await write('Обход: продолжаем', (tx) => {
      note?.(tx);
      if (m.waiting) tx.setProperty(long.refOf(m), 'WAITING_ON', null);
      if (back !== undefined) tx.setStatus(long.refOf(m), back);
      tx.setProperty(long.refOf(m), 'NEXT_REVIEW', stampOf(day, namesOf(m)));
    });
    return ok ? { tone: 'done', group: 'продолжаем', text: `${back ? `→ ${back}` : 'продолжаем'} · ${this.againWords}` } : null;
  }
  private async waitFor(m: Matter): Promise<ReviewMark | null> {
    const note = this.note(m);
    const who = await wait(m, { days: this.days, ...(note ? { also: note } : {}) });
    return who ? { tone: 'wait', group: 'ждём', text: `ждём ${who}` } : null;
  }
  /** «Осмотрено»: a touch, the file as it is (the status typed, if any, written first). */
  private async seen(m: Matter): Promise<ReviewMark | null> {
    const note = this.note(m);
    if (note && !(await write('Обход: осмотрено', note))) return null;
    await long.ctx.index!.markReviewed(long.refOf(m));
    long.soon(0);
    return { tone: 'seen', group: 'осмотрено', text: 'осмотрено' };
  }
  /** «В архив»: the core's «Архивировать поддерево», the status typed going along into the archive. */
  private async archive(m: Matter): Promise<ReviewMark | null> {
    try {
      await long.ctx.commands.run('heading.archive', { ref: long.refOf(m), ...(this.draft.trim() ? { note: this.draft.trim() } : {}) });
    } catch {
      return null;
    }
    long.soon(0);
    return { tone: 'arch', group: 'в архив', text: 'в архив' };
  }
  /** «Закрыть»: the first done status of its set (CLOSED as the file writes it). */
  private async close(m: Matter): Promise<ReviewMark | null> {
    const kw = this.closingOf({ ref: long.refOf(m) } as HeadingInfo);
    if (!kw) return null;
    const note = this.note(m);
    const ok = await write(`Обход: ${kw}`, (tx) => {
      note?.(tx);
      tx.setStatus(long.refOf(m), kw);
    });
    return ok ? { tone: 'done', group: 'закрыто', text: kw } : null;
  }
  /** ⌘↩: the next one with no decision — it stays in «Пора проверить» (a status typed is not lost: written). */
  private async pass(m: Matter): Promise<ReviewMark | null> {
    const note = this.note(m);
    if (note) await write('Заметка', note);
    return { tone: 'skip', group: 'пропущено', text: 'пропущено' };
  }
}

export const walk = new Walk();
