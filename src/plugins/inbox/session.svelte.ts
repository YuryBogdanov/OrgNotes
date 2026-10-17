// «Разбор Inbox» (ТЗ 18) on the core's review by cards (`ui.review`, ТЗ 28): the queue of cards, its order (a skipped
// task waits for the next pass, «Назад» passes over the deleted ones), the actions written as steps of ⌘Z, the summary.
// The card's parts — the header, the quick buttons, the bar, the summary — are the plugin's components.

import { mount, unmount, type Component } from 'svelte';
import type { CardRender, HeadingInfo, HeadingRef, ReviewMark } from '@panopticon/api';
import { data } from './state.svelte';
import { ageShort, deferDates, nextOpen, short, withDay, type Result, type ReviewItem } from './review';
import Head from './Head.svelte';
import Quick from './Quick.svelte';
import Bar from './Bar.svelte';
import More from './More.svelte';
import Summary from './Summary.svelte';

export interface Run {
  items: ReviewItem[];
  /** The card shown; -1: the summary. */
  cur: number;
  /** The tasks there were when it started (those put in meanwhile wait for the next review). */
  known: string[];
}

/** A part of the card: a component of ours in the core's element. */
const part = (comp: Component<any>): CardRender => (el, card) => {
  const app = mount(comp, { target: el, props: { card } });
  return () => void unmount(app);
};
const keyOf = (x: { created: string | null; title: string }) => x.created ?? x.title;

class Session {
  run = $state<Run | null>(null);
  /** «Показать календарь» under the card (ТЗ 24, part 3): folded at every new review, kept from card to card. */
  cal = $state(false);
  /** «Отложить до…» open over the bar; the dialog of «Удалить…». */
  defer = $state<{ sel: number } | null>(null);
  confirmDel = $state(false);
  /** An action is being written: the review does not take the task's absence for a change on disk. */
  private busy = false;
  /** The card's widget of the month (under it). */
  private month: { set(v: unknown): void } | null = null;
  /** The caret at the end of a task once per card. */
  private revealed = { key: '', n: 0 };

  get item(): ReviewItem | undefined {
    const r = this.run;
    return r && r.cur >= 0 ? r.items[r.cur] : undefined;
  }
  /** What the review's cards are now: each task where it is (moved, its line changed). */
  private refs(): HeadingRef[] {
    return this.run!.items.map((it) => {
      const r = data.find(it);
      return r ? { path: it.path, line: r.h.line, title: r.h.title } : { path: it.path, line: it.line, title: it.title };
    });
  }
  private get handle() {
    return data.ctx.ui.currentReview();
  }
  /** The review is a mode of the file's tab (the new interface): the core draws the card; no bar of ours. */
  get inFile() {
    return this.handle?.place === 'file';
  }
  /** The tasks gone through again, as new (the summary's «Разобрать пропущенные»). */
  again(list: ReviewItem[]) {
    this.start(list.map((x) => ({ ...x, result: null, note: undefined })));
  }
  /** «Отложить…» in the file: «Отложить до…» as a menu left of the card, by its button (ТЗ 46 §3); «Выбрать дату…» —
   *  the core's date picker. */
  private deferMenu() {
    const at = this.handle?.anchor('defer');
    const it = this.item;
    if (!it) return;
    const items = [
      ...deferDates().map((d) => ({ label: d.label, shortcut: withDay(d.date), run: () => void this.act(() => (this.item === it ? this.deferNow(d.date) : undefined)) })),
      'sep' as const,
      { label: 'Выбрать дату…', run: () => void this.act(() => this.pickDefer()) },
    ];
    data.ctx.ui.menu(items, at ? { x: Math.max(8, at.x - 292), y: at.y - 6 } : { x: window.innerWidth / 2 - 130, y: 200 });
  }
  /** The core's date picker, then the same write as «Отложить до». */
  private async pickDefer() {
    const it = this.item;
    if (!it) return;
    const d = await data.ctx.ui.pickDate({ title: 'Отложить до…', kind: 'SCHEDULED' });
    if (d && this.item === it) await this.deferNow(d);
  }

  // ---- start, show, end ---------------------------------------------------------------------------------------
  /** «Разобрать»: a review of `items` (by default what is in the Inbox now) in the tab «Разбор Inbox». */
  start(items: ReviewItem[] = data.pending) {
    // one review in the window: a second start in the file goes to the one going on (ТЗ 46 §1); from its summary
    // ⇧⌘R is «Разобрать пропущенные» (§5)
    if (this.run && this.inFile && items === data.pending) {
      const skipped = this.run.items.filter((x) => x.result === 'skip');
      if (this.run.cur >= 0) return this.show(this.run.cur);
      if (skipped.length) return this.again(skipped);
    }
    if (!items.length) return;
    this.run = { items, cur: 0, known: data.pending.map(keyOf) };
    const run = this.run; // the state's own (its changes are seen), not the object it was made of
    this.cal = false;
    this.defer = null;
    this.confirmDel = false;
    const ctx = data.ctx;
    const first = items[0];
    void ctx.ui.review({
      title: 'Разбор Inbox',
      // the new interface: a mode of the inbox file's tab (ТЗ 46), the core's card and queue; the old one: the tab
      place: 'file',
      mark: (i) => markOf(run.items[i]),
      calendar: { command: 'inbox.calendar', defer: (_h, day) => void this.act(() => this.deferNow(day)) },
      endActions: [
        { label: 'Разобрать пропущенные', command: 'inbox.review', kind: 'primary', when: () => run.items.some((x) => x.result === 'skip'), run: () => this.again(run.items.filter((x) => x.result === 'skip')) },
        { label: 'Разобрать и новые', when: () => this.added.length > 0, run: () => this.start(this.added) },
      ],
      header: (h) => {
        const it = run.items.find((x) => x.path === h.ref.path && x.title === h.ref.title);
        return it ? createdShort(it.created) : '';
      },
      cls: 'review',
      width: 820,
      items: items.map((it) => ({ path: it.path, line: it.line, title: it.title })),
      drawers: true,
      noSkip: true,
      backCommand: 'inbox.back',
      head: (el, card) => {
        this.sync(card.heading);
        return part(Head)(el, card);
      },
      quick: part(Quick),
      bar: part(Bar),
      barEnd: part(More),
      below: (el) => this.below(el),
      summary: (el) => {
        const app = mount(Summary, { target: el });
        return () => void unmount(app);
      },
      narrow: (h) => this.narrow(h),
      next: (cur, d) => (d > 0 ? (run.cur = nextOpen(run.items, cur)) : this.before(run, cur)),
      onClose: () => {
        if (this.run === run) this.run = null;
      },
      actions: [
        { id: 'done', label: 'Выполнено', sub: data.closingOf(first, 'done') ?? undefined, kind: 'ok', command: 'inbox.done', run: () => this.act(() => this.close('done')) },
        { id: 'cancel', label: 'Отменить', sub: data.closingOf(first, 'cancel') ?? undefined, command: 'inbox.cancel', run: () => this.act(() => this.close('cancel')) },
        { id: 'move', label: 'Перенести…', kind: 'primary', command: 'inbox.move', run: () => this.act(() => this.move()) },
        { id: 'defer', label: 'Отложить…', command: 'inbox.defer', run: () => this.act(() => (this.inFile ? this.deferMenu() : void (this.defer = this.defer ? null : { sel: 0 }))) },
        { id: 'skip', label: 'Пропустить', command: 'inbox.skip', run: () => this.act(() => this.skip()) },
        { id: 'next', label: 'Далее', hidden: true, command: 'inbox.next', run: () => this.act(() => this.pass()) },
        { id: 'calendar', label: 'Календарь', hidden: true, command: 'inbox.calendar', run: () => this.act(() => this.toggleCal()) },
      ],
    });
  }
  /** The card shown in the core's frame and ours. */
  show(i: number) {
    const r = this.run;
    if (!r) return;
    r.cur = i;
    this.defer = null;
    this.handle?.show(i);
  }
  /** «Закончить»: the tab goes; everything is on disk already. */
  end() {
    this.handle?.end();
    this.run = null;
  }
  /** The card «Назад» shows: the one before (a deleted task passed over), from the summary the last one. */
  private before(r: Run, cur: number) {
    let i = cur < 0 ? r.items.length - 1 : cur - 1;
    while (i >= 0 && r.items[i].result === 'delete') i--;
    if (i < 0) return cur;
    r.cur = i;
    this.defer = null;
    return i;
  }
  private next() {
    const r = this.run;
    if (r) this.show(nextOpen(r.items, r.cur));
  }

  // ---- the actions --------------------------------------------------------------------------------------------
  /** The actions run one after another: keys pressed fast wait for the write before them; none while a dialog of
   *  ours is open («Отложить до…» takes its own keys). The core's frame draws the card again after it ('stay': we move on ourselves). */
  private chain: Promise<unknown> = Promise.resolve();
  act(fn: () => Promise<void> | void): Promise<'stay'> {
    const run = () => (this.confirmDel || this.defer ? undefined : fn());
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p.then(() => 'stay' as const);
  }
  /** The heading of a task to write to, as it is now. */
  private refNow(it: ReviewItem): HeadingRef | null {
    const r = data.find(it);
    return r ? { path: it.path, line: r.h.line, title: r.h.title } : null;
  }
  /** Write an action, mark the task, go on; the toast takes it back. */
  private async write(it: ReviewItem, label: string, build: (ref: HeadingRef) => (tx: import('@panopticon/api').Tx) => void, mark: Partial<ReviewItem> & { result: Result }) {
    const ref = this.refNow(it);
    const r = this.run;
    if (!ref || !r) return;
    const before = { result: it.result, note: it.note, keyword: it.keyword };
    const at = r.items.indexOf(it);
    this.busy = true;
    const res = await data.ctx.edit!.transaction(label, build(ref), { onUndo: () => this.undone(r, it, before, at) });
    this.busy = false;
    if (res !== 'ok') return;
    Object.assign(it, mark);
    if (this.run === r) this.next();
    data.ctx.ui.notify(label, [{ label: 'Отменить', run: () => void data.ctx.edit!.undo() }]);
  }
  /** A step taken back: the task as it was, its card again (the tab where it is: ⌘Z may come from elsewhere). */
  private undone(r: Run, it: ReviewItem, before: Partial<ReviewItem>, at: number) {
    Object.assign(it, before);
    if (this.run !== r || at < 0) return;
    r.cur = at;
    this.handle?.setItems(this.refs(), at);
  }
  close(which: 'done' | 'cancel') {
    const it = this.item;
    const kw = it && data.closing(it, which);
    if (!it || !kw) return;
    const word = which === 'done' ? 'Выполнено' : 'Отменено';
    return this.write(it, `${word}: ${it.title}`, (ref) => (tx) => tx.setStatus(ref, kw), { result: which, keyword: kw, note: `${word} · ${kw}` });
  }
  deferTo(date: Date) {
    this.defer = null;
    return this.act(() => this.deferNow(date));
  }
  private deferNow(date: Date) {
    const it = this.item;
    if (it) return this.write(it, `Отложена до ${short(date)}: ${it.title}`, (ref) => (tx) => tx.setPlanning(ref, 'SCHEDULED', date), { result: 'defer', note: `Отложена до ${short(date)} · в Inbox` });
  }
  remove() {
    this.confirmDel = false;
    return this.act(() => {
      const it = this.item;
      if (it) return this.write(it, `Удалено: ${it.title}`, (ref) => (tx) => tx.remove(ref), { result: 'delete', note: 'Удалена' });
    });
  }
  skip() {
    const it = this.item;
    if (!it) return;
    it.result = 'skip';
    this.next();
  }
  /** «Далее» (fix to ТЗ 18): done with the task as it is — nothing is written (the card's edits are in the file
   *  already); it stays in the Inbox and does not come back in this review. «Отменить» puts it back in the queue. */
  pass() {
    const r = this.run;
    const it = this.item;
    if (!r || !it) return;
    const before = { result: it.result, note: it.note };
    const at = r.cur;
    const now = data.find(it);
    const d = now?.h.scheduled ?? now?.h.deadline;
    const when = d ? `${short(new Date(d.y, d.m - 1, d.d))}${d.time ? ' ' + d.time : ''}` : '';
    it.result = 'next';
    it.note = ['Разобрана', now?.h.keyword ?? it.keyword, when].filter(Boolean).join(' · ');
    this.next();
    data.ctx.ui.notify(`Разобрана: ${it.title}`, [{
      label: 'Отменить',
      run: () => {
        if (this.run !== r) return;
        Object.assign(it, before);
        this.show(at);
      },
    }]);
  }
  /** The card's task as it was shown first: «Далее» is the main action once it was edited there. */
  private seen = $state<{ id: string; text: string } | null>(null);
  private subtree(it: ReviewItem): string | null {
    const r = data.find(it);
    return r ? r.f.text.split('\n').slice(r.h.line, r.h.end).join('\n') : null;
  }
  get edited(): boolean {
    const it = this.item;
    const s = this.seen;
    return !!it && !!s && s.id === it.id && this.subtree(it) !== s.text;
  }
  /** «Перенести…»: the core's move over the tab; ⎋ comes back to the same card. */
  async move() {
    const r = this.run;
    const it = this.item;
    const ref = it && this.refNow(it);
    if (!r || !it || !ref) return;
    const before = { result: it.result, note: it.note, path: it.path, line: it.line, title: it.title };
    const at = r.cur;
    this.busy = true; // the task leaves the Inbox: not a change on disk for the review
    const to = await data.ctx.ui.refile(ref, { quiet: true, onUndo: () => this.undone(r, it, before, at) });
    if (to) await data.refresh(to.path); // its card shows it there («Назад»)
    this.busy = false;
    if (!to || this.run !== r) return;
    Object.assign(it, { result: 'move' as Result, note: '→ ' + to.label, path: to.path, line: to.line, title: to.title });
    this.handle?.setItems(this.refs());
    this.next();
    data.ctx.ui.notify(`Перенесено в ${to.label}`, [{ label: 'Отменить', run: () => void data.ctx.edit!.undo() }]);
  }
  /** «Открыть в файле»: the task's file at its heading, beside; the review stays in front. */
  openInFile() {
    const it = this.item;
    const ref = it && this.refNow(it);
    if (ref) void data.ctx.commands.run('file.open', { path: ref.path, line: ref.line, beside: true, focus: false });
  }

  // ---- the calendar under the card ----------------------------------------------------------------------------
  private monthValue() {
    const it = this.item;
    const r = it && data.find(it);
    const o = r?.h.scheduled ?? r?.h.deadline;
    const iso = o ? `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}` : null;
    return { path: it?.path ?? '', line: r?.h.line ?? it?.line ?? 0, date: iso, open: this.cal };
  }
  private below(el: HTMLElement) {
    if (this.inFile) return; // the calendar's own card there (ТЗ 46 §6)
    const w = data.ctx.ui.widget(el, { type: 'month', key: 'cal', label: 'Календарь', keyId: 'inbox.calendar' }, this.monthValue(), (v) => {
      const open = !!(v as { open?: boolean }).open;
      if (open !== this.cal) this.toggleCal();
    });
    this.month = w;
    return () => {
      if (this.month === w) this.month = null;
      w.dispose();
    };
  }
  toggleCal() {
    this.cal = !this.cal;
    this.month?.set(this.monthValue());
  }
  /** The task's date changed (a quick button, an edit): the month follows. */
  follow() {
    this.month?.set(this.monthValue());
  }

  // ---- the editor of the card -----------------------------------------------------------------------------------
  /** The caret at the end of the task's text when its card comes (trailing blank lines left out). */
  private narrow(h: HeadingInfo) {
    const it = this.item;
    const r = it && data.find(it);
    if (!it || !r) return {};
    const key = it.id + '|' + it.path;
    if (key !== this.revealed.key) this.revealed = { key, n: this.revealed.n + 1 };
    if (this.inFile) this.sync(h); // no header of ours there to do it
    else void h; // the card's heading: ours is found by its :CREATED: (its line may be behind the core's for a moment)
    return { reveal: { line: lastLine(r.f.text, r.h), n: this.revealed.n, col: 1e9 } };
  }
  /** The card's task edited in it: its line and title follow — found by its :CREATED:, or (none) retitled in place.
   *  Another heading at its line (the task removed outside) is not it. */
  sync(h: HeadingInfo) {
    const it = this.item;
    if (!it || it.path !== h.ref.path) return;
    if (this.seen?.id !== it.id) this.seen = { id: it.id, text: this.subtree(it) ?? '' };
    const r = data.find(it);
    const now = r ? { line: r.h.line, title: r.h.title } : !it.created && h.ref.line === it.line ? h.ref : null;
    if (now && (it.line !== now.line || it.title !== now.title)) {
      it.line = now.line;
      it.title = now.title;
    }
  }

  // ---- a change on disk -----------------------------------------------------------------------------------------
  /** Tasks gone from their file leave the queue quietly; the current one says so. */
  synced() {
    const r = this.run;
    if (!r || this.busy) return;
    this.follow();
    const cur = r.items[r.cur];
    const gone = r.items.filter((it) => (!it.result || it.result === 'skip') && data.files[it.path] && !data.find(it));
    if (!gone.length) return;
    const curGone = !!cur && gone.includes(cur);
    r.items = r.items.filter((it) => !gone.includes(it));
    // the card shown stays (the summary too); its task gone: the next one
    r.cur = !cur ? -1 : !curGone ? r.items.indexOf(cur) : nextOpen(r.items, Math.min(r.cur, r.items.length) - 1);
    this.handle?.setItems(this.refs(), r.cur);
    if (curGone) data.ctx.ui.notify('Задача изменена вне приложения и пропущена');
  }
  /** Tasks put into the Inbox since the review started (they wait for the next one). */
  get added(): ReviewItem[] {
    const r = this.run;
    return r ? data.pending.filter((x) => !r.known.includes(keyOf(x))) : [];
  }
}

/** The last line of a task's own text (trailing blank lines left out). */
export function lastLine(text: string, h: { line: number; end: number }) {
  const lines = text.split('\n');
  let last = Math.min(h.end, lines.length) - 1;
  while (last > h.line && !lines[last].trim()) last--;
  return last;
}

export const session = new Session();

/** A task's outcome for the core's progress and queue (a review in the file): its colour, its words — «DONE»,
 *  «→ home», «отложено до 19 окт», «пропущена»; null: not handled yet. */
export function markOf(it: ReviewItem | undefined): ReviewMark | null {
  if (!it?.result) return null;
  switch (it.result) {
    case 'done':
      return { tone: 'done', text: it.keyword ?? 'выполнено' };
    case 'cancel':
      return { tone: 'cancel', text: it.keyword ?? 'отменено' };
    case 'move':
      return { tone: 'moved', text: it.note?.split(' › ')[0] ?? 'перенесена' };
    case 'defer':
      return { tone: 'later', text: it.note?.replace(/^Отложена до (.+?) · .*$/, 'отложено до $1') ?? 'отложена' };
    case 'skip':
      return { tone: 'skip', text: 'пропущена' };
    case 'delete':
      return { tone: 'cancel', text: 'удалена' };
    case 'next':
      return { tone: 'seen', text: 'разобрана' };
  }
}
/** «15 окт»: the day a task was put in the Inbox («вчера», «4 ч» when lately), for the queue. */
export function createdShort(created: string | null, now = new Date()): string {
  const m = created && /(\d{4})-(\d{2})-(\d{2})/.exec(created);
  if (!m) return '';
  const age = ageShort(created, now);
  return age === 'вчера' || age.endsWith(' ч') || age === 'только что' || age === 'сегодня' ? age : short(new Date(+m[1], +m[2] - 1, +m[3]));
}
