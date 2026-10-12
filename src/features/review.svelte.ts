// «Разбор Inbox» (ТЗ 18) as a module of its own (roadmap 0.2): the queue of cards, the actions, the summary. It uses
// the core (`store`) only through what the core offers to every feature; the core knows nothing of it.

import { store, type NoteFile } from '../store.svelte';
import { closeTab, newTab, openFile } from '../layout';
import { setKeyword, type Heading } from '../org';
import { setPlanning } from '../edits';
import { remove } from '../inbox';
import { closingStatus, locate, nextOpen, reviewQueue, short, type Result, type ReviewItem } from '../review';
import type { Step } from '../journal';

class Review {
  // ---- «Разбор Inbox»: the tasks one by one, as cards, in a tab of their own ---------------------------------
  /** The review going on: its queue (fixed when it starts), the card shown (-1: the summary), the tasks there were. */
  review = $state<{ items: ReviewItem[]; cur: number; known: string[] } | null>(null);
  /** An action is being written: the review does not take the task's absence for a change on disk. */
  private reviewBusy = false;
  /** The queue a review would start with now. */
  get reviewPending(): ReviewItem[] {
    const f = store.inboxFile;
    return f ? reviewQueue(f.text, f.headings, f.wf, f.path, store.inboxCfg.reviewOrder) : [];
  }
  private taskKeys(): string[] {
    const f = store.inboxFile;
    return f ? reviewQueue(f.text, f.headings, f.wf, f.path, 'old').map((x) => x.created ?? x.title) : [];
  }
  /** «Разобрать»: a review of `items` (by default what is in the Inbox now) in the «Разбор Inbox» tab. */
  startReview(items: ReviewItem[] = this.reviewPending) {
    if (!items.length) return;
    this.reviewCal = false; // folded at every new review, kept from card to card
    this.review = { items, cur: 0, known: this.taskKeys() };
    const at = store.layout.panes.flatMap((p, pi) => p.tabs.map((t, ti) => ({ t, pi, ti }))).find((x) => x.t.kind === 'review');
    if (at) store.activateTab(at.pi, at.ti);
    else {
      const p = store.layout.panes[store.layout.active];
      p.tabs.splice(p.tabs.length ? p.active + 1 : 0, 0, newTab('review', items[0].path));
      p.active = p.tabs.length ? p.tabs.findIndex((t) => t.kind === 'review') : 0;
    }
    this.reviewShow(0);
  }
  /** «Закончить»: the tab goes; everything is on disk already. */
  endReview() {
    this.review = null;
    for (let pi = store.layout.panes.length - 1; pi >= 0; pi--) {
      const p = store.layout.panes[pi];
      for (let ti = p.tabs.length - 1; ti >= 0; ti--) if (p.tabs[ti].kind === 'review') closeTab(store.layout, pi, ti);
    }
    store.persistLayout();
  }
  get reviewItem(): ReviewItem | undefined {
    const r = this.review;
    return r && r.cur >= 0 ? r.items[r.cur] : undefined;
  }
  /** The file and the heading of a task, as they are now. */
  reviewHeading(it: ReviewItem): { f: NoteFile; h: Heading } | null {
    const f = store.files.find((x) => x.path === it.path);
    const h = f && locate(f.text, f.headings, it);
    return f && h ? { f, h } : null;
  }
  /** Show a card (or the summary, -1); the tab follows the card's file, so the palette and the inspector see it. */
  reviewShow(i: number) {
    const r = this.review;
    if (!r) return;
    r.cur = i;
    const it = r.items[i];
    const t = store.layout.panes.flatMap((p) => p.tabs).find((x) => x.kind === 'review');
    if (t) {
      t.path = it?.path;
      const h = it && this.reviewHeading(it);
      if (h) t.cursor = { line: h.h.line, col: 0 };
    }
  }
  /** The card's editor reports where the task is now (it moves with edits). */
  reviewAt(it: ReviewItem, line: number) {
    it.line = line;
    const h = this.reviewHeading(it);
    if (h) it.title = h.h.title;
  }
  private reviewNext() {
    const r = this.review;
    if (r) this.reviewShow(nextOpen(r.items, r.cur));
  }
  /** ⌥⌘[: the card before, as it is now (a moved task in its new file). */
  reviewBack() {
    const r = this.review;
    if (!r) return;
    let i = r.cur < 0 ? r.items.length - 1 : r.cur - 1;
    while (i >= 0 && r.items[i].result === 'delete') i--;
    if (i >= 0) this.reviewShow(i);
  }
  /** Write an action, mark the task, go on; the toast takes it back. */
  private async reviewWrite(it: ReviewItem, text: (f: NoteFile, h: Heading) => string | null, mark: Partial<ReviewItem> & { result: Result }, toast: string) {
    const r = this.reviewHeading(it);
    if (!r) return;
    const t = text(r.f, r.h);
    if (t === null) return;
    this.reviewBusy = true;
    const before = { result: it.result, note: it.note, keyword: it.keyword };
    const at = this.review?.items.indexOf(it) ?? -1;
    const step = await store.writeAll(toast, [{ path: r.f.path, text: t }], () => this.reviewUndone(it, before, at));
    this.reviewBusy = false;
    if (!step) return;
    Object.assign(it, mark);
    this.reviewNext();
    store.note(toast, [{ label: 'Отменить', run: () => void store.undo(step) }], 4000);
  }
  private reviewUndone(it: ReviewItem, before: Partial<ReviewItem>, at: number) {
    Object.assign(it, before);
    if (this.review && at >= 0) this.reviewShow(at);
  }
  /** The status «Выполнено» / «Отменить» writes for this task (null: its set has none). */
  reviewStatus(it: ReviewItem, which: 'done' | 'cancel'): string | null {
    const r = this.reviewHeading(it);
    const wf = r?.f.wf ?? store.inboxFile?.wf;
    return wf ? closingStatus(wf, r?.h.keyword ?? it.keyword, which, which === 'done' ? store.inboxCfg.reviewDone : store.inboxCfg.reviewCancel) : null;
  }
  /** The actions of the review run one after another: keys pressed fast wait for the write before them. */
  private reviewChain: Promise<unknown> = Promise.resolve();
  private inTurn(fn: () => Promise<void> | void): Promise<void> {
    const run = this.reviewChain.then(fn, fn);
    this.reviewChain = run.catch(() => {});
    return run;
  }
  reviewClose(which: 'done' | 'cancel') {
    return this.inTurn(() => this.reviewCloseNow(which));
  }
  private async reviewCloseNow(which: 'done' | 'cancel') {
    const it = this.reviewItem;
    const kw = it && this.reviewStatus(it, which);
    if (!it || !kw) return;
    const word = which === 'done' ? 'Выполнено' : 'Отменено';
    await this.reviewWrite(it, (f, h) => setKeyword(f.text, h, kw, f.wf), { result: which, keyword: kw, note: `${word} · ${kw}` }, `${word}: ${it.title}`);
  }
  reviewDefer(date: Date) {
    return this.inTurn(() => this.reviewDeferNow(date));
  }
  private async reviewDeferNow(date: Date) {
    const it = this.reviewItem;
    if (!it) return;
    await this.reviewWrite(it, (f, h) => setPlanning(f.text, h, 'SCHEDULED', date), { result: 'defer', note: `Отложена до ${short(date)} · в Inbox` }, `Отложена до ${short(date)}: ${it.title}`);
  }
  reviewDelete() {
    return this.inTurn(() => this.reviewDeleteNow());
  }
  private async reviewDeleteNow() {
    const it = this.reviewItem;
    if (!it) return;
    await this.reviewWrite(it, (f, h) => remove(f.text, h), { result: 'delete', note: 'Удалена' }, `Удалено: ${it.title}`);
  }
  reviewSkip() {
    return this.inTurn(() => {
      const it = this.reviewItem;
      if (!it) return;
      it.result = 'skip';
      this.reviewNext();
    });
  }
  /** «Перенести…»: the move of ТЗ 16 over the tab; Esc comes back to the same card. */
  reviewMove() {
    const it = this.reviewItem;
    const r = it && this.reviewHeading(it);
    if (!r) return;
    store.refileHeading(r.f, r.h, {
      busy: (on) => (this.reviewBusy = on), // the task leaves the Inbox: not a change on disk for the review
      done: (m) => {
        this.reviewMoved(m.path, m.line, m.label, m.step);
        return true;
      },
    });
  }
  private reviewMoved(path: string, line: number, label: string, step: Step) {
    const it = this.reviewItem;
    if (!it) return;
    const before = { result: it.result, note: it.note, path: it.path, line: it.line };
    const at = this.review!.cur;
    Object.assign(it, { result: 'move' as Result, note: '→ ' + label, path, line });
    this.reviewNext();
    step.onUndo = () => this.reviewUndone(it, before, at);
    store.note(`Перенесено в ${label}`, [{ label: 'Отменить', run: () => void store.undo(step) }], 4000);
  }
  /** «Открыть в файле»: the task's file at its heading, in the other pane (or a new tab), the review goes on. */
  reviewOpenInFile() {
    const it = this.reviewItem;
    const r = it && this.reviewHeading(it);
    if (!r) return;
    const here = store.layout.active;
    const p = store.layout.panes[here];
    const reviewTab = p.tabs[p.active];
    const other = store.layout.panes.length > 1 ? 1 - here : here;
    openFile(store.layout, other, r.f.path, r.h.line, { replace: false, focus: false });
    // one pane: a new tab next to the review, which stays in front
    store.layout.active = here;
    p.active = Math.max(0, p.tabs.indexOf(reviewTab));
    store.persistLayout();
  }
  /** A change on disk: tasks gone from their file leave the queue quietly; the current one says so. */
  reviewSync() {
    const r = this.review;
    if (!r || this.reviewBusy || store.refile) return;
    const cur = r.items[r.cur];
    const gone = r.items.filter((it) => (!it.result || it.result === 'skip') && !this.reviewHeading(it));
    if (!gone.length) return;
    const curGone = !!cur && gone.includes(cur);
    r.items = r.items.filter((it) => !gone.includes(it));
    const i = cur && !curGone ? r.items.indexOf(cur) : Math.min(r.cur, r.items.length) - 1;
    r.cur = i;
    if (curGone) {
      this.reviewShow(nextOpen(r.items, Math.max(-1, i)));
      store.note('Задача изменена вне приложения и пропущена');
    }
  }
  /** Tasks put into the Inbox since the review started (they wait for the next one). */
  get reviewAdded(): ReviewItem[] {
    const r = this.review;
    if (!r) return [];
    return this.reviewPending.filter((x) => !r.known.includes(x.created ?? x.title));
  }
  /** «Показать календарь» under the review's card (ТЗ 24, part 3). */
  reviewCal = $state(false);
}

export const inboxReview = new Review();
