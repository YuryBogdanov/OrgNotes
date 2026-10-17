// A review in the file (ТЗ 41 §1, ТЗ 46): `ui.review` with `place: 'file'` in the new interface is a mode of a file's
// tab — the tab shows the file of the card's heading, narrowed to it (the next card in another file: the same tab
// goes there, or the tab that has it open already); the strip, the core's card and the queue are drawn by EditorArea
// (SessionCard, ReviewQueue). Leaving the tab does not end it; closing it does. The workings of the review (its
// cards, actions, steps) are the host's (api/review.svelte.ts); here only where it is shown.

import { untrack } from 'svelte';
import { store, type ScopeKeys } from '../store.svelte';
import { plugins } from '../api/host.svelte';
import { reviewScope } from '../api/declare';
import { openFile, type Tab } from '../layout';

class FileReview {
  /** The tab the review is in. */
  tabId = $state<string | null>(null);
  /** The card's file is another than the last one's: the strip says «другой файл» for 2 s (ТЗ 41 §1.1). */
  otherFile = $state(false);
  private lastPath = $state<string | null>(null);
  /** The calendar's card in the review folds and unfolds (its key, ⌘K): set by ReviewCalendar while shown. */
  calToggle: (() => void) | null = null;
  private otherTimer: ReturnType<typeof setTimeout> | undefined;
  /** The run, when it is in the file. */
  get run() {
    const r = plugins.review;
    return r?.inFile ? r : null;
  }
  /** The tab the review is in, in the first pane. */
  get tab(): Tab | undefined {
    const id = this.tabId;
    return id ? store.layout.panes[0]?.tabs.find((t) => t.id === id) : undefined;
  }
  /** The heading of the card, as the review finds it now. */
  get card() {
    return this.run && this.run.cur >= 0 ? plugins.reviewHeading() : null;
  }
  /** Its tab is the one shown: the strip, the card, the queue, the keys. */
  get on() {
    const p = store.layout.panes[0];
    const t = p?.tabs[p.active];
    return !!this.run && !!this.tabId && store.layout.active === 0 && t?.id === this.tabId && !!t && t.kind === 'file' && t.path === this.shownPath;
  }
  /** The file the review is on: the card's, the summary — the last card's. */
  get shownPath() {
    return this.card?.file.path ?? this.lastPath ?? null;
  }
  /** The tab on the card's file, narrowed to its heading; in front. */
  front() {
    const c = untrack(() => this.card);
    const r = untrack(() => this.run);
    if (!r) return;
    if (!c) {
      // the summary: the tab in front, the whole file
      const t = this.tab;
      const p = store.layout.panes[0];
      const i = t ? p.tabs.indexOf(t) : -1;
      if (i >= 0 && (store.layout.active !== 0 || p.active !== i)) store.activateTab(0, i);
      return;
    }
    // the file's tab (this one, or one that has it open already), else the active file tab, else a new one
    const p = store.layout.panes[0];
    const nr = r.spec.narrow ? plugins.guard(r.plugin, () => r.spec.narrow!(c.info), {}) : {};
    const at = nr?.reveal ?? { line: c.heading.line, col: 0 };
    if (this.lastPath && this.lastPath !== c.file.path) {
      this.otherFile = true;
      clearTimeout(this.otherTimer);
      this.otherTimer = setTimeout(() => (this.otherFile = false), 2000);
    }
    this.lastPath = c.file.path;
    const same = this.tab?.path === c.file.path && this.tab.narrow?.title === c.heading.title;
    const t = openFile(store.layout, 0, c.file.path, at.line, { replace: p.tabs[p.active]?.kind === 'file' });
    if (at.col) t.cursor.col = at.col;
    if (t.reveal && at.col) t.reveal.col = at.col;
    store.layout.active = 0;
    this.tabId = t.id;
    if (!same || t.narrow?.line !== c.heading.line) store.narrowTab(t, c.heading.line);
    store.persistLayout();
  }
  /** The review ended (or went to its summary): the narrowing off, the tab stays on the file. */
  end() {
    const t = this.tab;
    if (t) store.widenTab(t);
  }

  /** The keys of the review (its commands of «"scope": "review"») while its tab is shown. */
  private keys: ScopeKeys = {
    active: () => this.on && !store.sheetOpen && !!this.card,
    run: (id: string) => {
      const r = plugins.review;
      if (!r) return false;
      if (id && id === r.spec.backCommand) {
        if (r.cur !== 0) void plugins.reviewStep(-1);
        return true;
      }
      if (id && id === r.spec.calendar?.command && this.calToggle) {
        this.calToggle();
        return true;
      }
      const a = r.spec.actions.find((x) => x.command === id);
      if (!a || !plugins.reviewHeading()) return false;
      void plugins.reviewAct(a.id);
      return true;
    },
  };
  /** «Назад» on a card past the first. */
  back() {
    const r = this.run;
    if (r && r.cur !== 0) void plugins.reviewStep(-1);
  }
  /** «Закончить» / ⎋. */
  finish() {
    if (this.run) plugins.endReview(this.run.cur < 0);
  }

  effects() {
    plugins.reviewFile = { front: () => this.front(), end: () => this.end() };
    // another card (an action, «Назад», the plugin's `show`, its queue set anew): the tab follows it
    $effect(() => {
      const r = this.run;
      if (!r) return;
      void `${r.cur}|${r.gen}|${r.refs[r.cur]?.path}|${r.refs[r.cur]?.title}`;
      // away from its tab (another tab, another file in it): it follows when the tab is on the file again
      const p = store.layout.panes[0];
      const t = p?.tabs[p.active];
      if (!this.tabId || t?.id !== this.tabId || t.path !== this.shownPath) return;
      untrack(() => {
        const c = this.card;
        const t = this.tab;
        if (c && t && t.path === c.file.path && t.narrow?.title === c.heading.title && t.narrow.line === c.heading.line) return;
        this.front();
      });
    });
    // the review over: its tab is no one's
    $effect(() => {
      if (this.run || !this.tabId) return;
      this.tabId = null;
      this.lastPath = null;
      this.otherFile = false;
    });
    // its tab closed: the review ends (all it did is in the files)
    $effect(() => {
      if (this.run && this.tabId && !this.tab) untrack(() => plugins.endReview(false, true));
    });
    // the review's keys
    $effect(() => {
      const s = this.run ? reviewScope(this.run.plugin) : null;
      if (!s) return;
      store.setScopeKeys(s, this.keys);
      return () => {
        if (store.scopeKeys.get(s) === this.keys) store.setScopeKeys(s, null);
      };
    });
    // ⎋ ends it, when nothing else took the press (a popover, a field's own, the find panel)
    $effect(() => {
      const esc = (e: KeyboardEvent) => {
        if (e.key !== 'Escape' || e.defaultPrevented || !this.on || store.sheetOpen) return;
        const el = e.target as Element | null;
        if (el?.closest?.('input, textarea, select, [role=dialog], [role=menu], .find')) return;
        e.preventDefault();
        this.finish();
      };
      window.addEventListener('keydown', esc);
      return () => window.removeEventListener('keydown', esc);
    });
  }
}

export const fileReview = new FileReview();
