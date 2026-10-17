// A plugin's review (ТЗ 26 §5.2, `ui.review`; tech sprint 3.2, from the host): the run — its cards, the one shown,
// the actions on it, the steps, the end. PluginReview.svelte draws it; the host owns one and forwards to it.

import { store } from '../store.svelte';
import type { HeadingRef, ReviewMark, ReviewResult, ReviewSpec } from './index';
import { fileOf, findHeading, infoOf } from './refs';

/** The core's tab of a plugin's review. */
export const REVIEW_KIND = 'plugin.review';
export interface ReviewRun {
  plugin: string;
  spec: ReviewSpec;
  refs: HeadingRef[];
  /** The card shown; -1: the summary. */
  cur: number;
  done: number;
  /** The cards an action moved on from (a card gone back to counts once). */
  doneAt: Set<number>;
  /** The queue set anew by the plugin with another heading at the card shown: the card is drawn anew. */
  gen: number;
  resolved: boolean;
  resolve: (r: ReviewResult) => void;
  /** In the file (ТЗ 41 §1): a mode of a file's tab in the new interface, not the review's tab. */
  inFile?: boolean;
  /** What became of each card an action with a `mark` moved on from. */
  marks?: Record<number, ReviewMark>;
}
/** The core's side of a review in the file (next/fileReview): its tab to the front, the narrowing taken off. */
export interface FileReviewHooks {
  front(): void;
  end(): void;
}
/** What the host gives: the guard around a plugin's code, its failure. */
export interface ReviewHost {
  guard<T>(id: string, fn: () => T, fallback: T): T;
  fail(id: string, err: unknown): void;
  failed(id: string): boolean;
}

export class ReviewController {
  private host: ReviewHost;
  constructor(host: ReviewHost) {
    this.host = host;
  }
  /** The review running (one at a time). */
  run = $state<ReviewRun | null>(null);
  /** Set by the new interface: a review in the file is shown there. */
  file: FileReviewHooks | null = null;
  /** What became of a card: the plugin's word, else the action's that moved on from it. */
  markOf(i: number): ReviewMark | null {
    const r = this.run;
    if (!r) return null;
    void this.redraw;
    void r.done;
    if (r.spec.mark) {
      const m = this.host.guard(r.plugin, () => r.spec.mark!(i), null);
      if (m && typeof m === 'object' && typeof m.tone === 'string') return { tone: m.tone, ...(typeof m.text === 'string' ? { text: m.text } : {}) };
      if (m === null) return r.marks?.[i] ?? null;
    }
    return r.marks?.[i] ?? null;
  }
  /** The card's heading now: found by its title near its line (an action may have moved it). */
  heading() {
    const r = this.run;
    const ref = r && r.cur >= 0 ? r.refs[r.cur] : null;
    const f = ref ? fileOf(ref.path) : undefined;
    // by its title; else the heading at its line (its title edited in the card, ТЗ 28)
    const h = f && ref ? (findHeading(f.headings, ref) ?? f.headings.find((x) => x.line === ref.line)) : undefined;
    return f && h ? { file: f, heading: h, info: infoOf(f, h) } : null;
  }
  async act(actionId: string) {
    const r = this.run;
    const c = this.heading();
    const a = r?.spec.actions.find((x) => x.id === actionId);
    if (!r || !c || !a || this.host.failed(r.plugin)) return;
    if (a.disabled && this.host.guard(r.plugin, () => a.disabled!(c.info), false)) return;
    let res: 'next' | 'stay';
    this.acting++;
    try {
      res = await a.run(c.info);
    } catch (err) {
      this.host.fail(r.plugin, err);
      return;
    } finally {
      this.acting--;
    }
    if (this.run !== r) return;
    const now = this.heading();
    if (now) r.refs[r.cur] = now.info.ref; // it may have moved: the card keeps it
    if (res === 'next') {
      if (a.mark) {
        const text = a.mark.text ? this.host.guard(r.plugin, () => a.mark!.text!(now?.info ?? c.info), '') : '';
        r.marks = { ...r.marks, [r.cur]: { tone: a.mark.tone, ...(text ? { text: String(text) } : {}) } };
      }
      r.doneAt.add(r.cur);
      r.done = r.doneAt.size;
      await this.step(1);
    } else this.redraw++;
  }
  /** The card's heading was edited in it, by the user (its line moved, its title changed): the card keeps it (ТЗ 28).
   *  A change from outside is not: the heading at its line may be another one then. */
  edited(line: number) {
    const r = this.run;
    const ref = r && r.cur >= 0 ? r.refs[r.cur] : null;
    const f = ref ? fileOf(ref.path) : undefined;
    const h = f?.headings.find((x) => x.line === line);
    // only the same heading: moved by an edit above it (its title) or retitled in place (its line); a rewrite of the
    // file (a goal moved to another quarter) leaves the narrowed range pointing elsewhere — the title finds it then
    if (r && ref && h && (h.title === ref.title || h.line === ref.line) && (ref.line !== h.line || ref.title !== h.title)) r.refs[r.cur] = { path: ref.path, line: h.line, title: h.title };
  }
  /** An action is running: its card may be gone for a moment (archived, moved) — not «нет в файле» yet. */
  acting = $state(0);
  /** The card's heading is gone from its file (removed, moved outside): in the file it is passed over, «нет в файле»
   *  (ТЗ 41 §5). */
  gone() {
    const r = this.run;
    if (!r || r.cur < 0 || this.acting) return;
    r.marks = { ...r.marks, [r.cur]: { tone: 'skip', text: 'нет в файле' } };
    void this.step(1);
  }
  /** The card drawn again (the plugin's parts read the file anew). */
  redraw = $state(0);
  /** The bar read again (the actions' `disabled`). */
  bar = $state(0);
  /** Another card; what the plugin is writing is saved first (`beforeStep`). */
  async step(d: number) {
    const r = this.run;
    if (!r) return;
    const c = this.heading();
    if (c && r.spec.beforeStep) {
      try {
        await r.spec.beforeStep(c.info);
      } catch (err) {
        this.host.fail(r.plugin, err);
        return;
      }
    }
    if (this.run !== r) return;
    if (r.spec.next) {
      const n = this.host.guard(r.plugin, () => r.spec.next!(r.cur, d < 0 ? -1 : 1), r.cur);
      if (this.run !== r || n === r.cur || n < -1 || n >= r.refs.length) return;
      r.cur = n;
      if (n < 0) this.end(true, false, true);
      return;
    }
    if (r.cur < 0) {
      if (d < 0) r.cur = r.refs.length - 1; // «Назад» from the summary
      return;
    }
    const n = r.cur + d;
    if (n < 0) return;
    r.cur = n < r.refs.length ? n : -1;
    if (r.cur < 0) this.end(true, false, true);
  }
  /** The plugin shows a card (-1: the summary): the review's tab in front. */
  show(r: ReviewRun, i: number) {
    if (this.run !== r || i < -1 || i >= r.refs.length) return;
    if (r.inFile) this.file?.front();
    else for (const [pi, p] of store.layout.panes.entries()) {
      const ti = p.tabs.findIndex((t) => t.kind === REVIEW_KIND);
      if (ti >= 0 && (store.layout.active !== pi || p.active !== ti)) store.activateTab(pi, ti);
    }
    r.cur = i;
    if (i < 0) this.end(true, false, true);
  }
  /** The review answers its plugin: through, or left; `keep`: its summary stays shown. */
  end(finished: boolean, gone = false, keep = false) {
    const r = this.run;
    if (!r) return;
    if (!r.resolved) {
      r.resolved = true;
      r.resolve({ total: r.refs.length, done: r.done, finished });
    }
    if (r.inFile && (!keep || r.cur < 0)) this.file?.end(); // the narrowing goes; the summary shows the whole file
    if (!keep) {
      this.run = null;
      if (r.spec.onClose) this.host.guard(r.plugin, () => r.spec.onClose!(), undefined);
    }
    if (!gone && !keep && !r.inFile) for (const [pi, p] of store.layout.panes.entries()) {
      const ti = p.tabs.findIndex((t) => t.kind === REVIEW_KIND);
      if (ti >= 0) store.closeTab(pi, ti);
    }
  }
}
