// «Перенести» (tech sprint 2.4, from the store): a heading with its subtree into a file, under a heading there or at
// its 1st level. The store owns one: it gives its files, the writes and the place of the caret after the move.

import { bareTitle, keyOf, moveTo, moveWithin } from './refile';
import { displayName } from './names';
import { notify } from './notify.svelte';
import { lsGet, lsSet } from './storage';
import type { Heading } from './org';
import type { Step } from './journal';
import type { NoteFile, RefileHooks, RefileReq } from './store.svelte';

/** What the store gives. */
export interface RefileHost {
  files(): NoteFile[];
  dir(): string | null;
  /** The heading under the cursor of the active tab. */
  current(): { f: NoteFile; h: Heading } | null;
  /** The files of the tabs, then of the history, the active one last. */
  opened(): string[];
  /** Write a file's unsaved edits now (not over a conflict); null, or why it failed. */
  saveNow(path: string): Promise<string | null>;
  reload(): Promise<void>;
  writeAll(label: string, texts: { path: string; text: string }[]): Promise<Step | null>;
  undo(step: Step): Promise<boolean>;
  open(fileIdx: number, line: number): void;
  caretAfter(path: string, h: Heading, movedAt: number | null): void;
}

export class RefileStore {
  private host: RefileHost;
  constructor(host: RefileHost) {
    this.host = host;
  }
  /** What is being moved: the heading under the cursor (the palette's command), or one a feature hands over. */
  req = $state<RefileReq | null>(null);
  /** «Перенести…» of the palette: the heading under the cursor; its own file is a place too, the caret follows. */
  start() {
    const c = this.host.current();
    if (c) this.req = { path: c.f.path, line: c.h.line, title: c.h.title, self: true, n: Date.now() };
  }
  /** A feature moves a heading of its own (an Inbox task, a review card) with its hooks around the write. */
  heading(f: NoteFile, h: Heading, hooks: RefileHooks) {
    this.req = { path: f.path, line: h.line, title: h.title, self: false, hooks, n: Date.now() };
  }
  /** The heading being moved, as it is now. */
  source(): { f: NoteFile; h: Heading } | null {
    const r = this.req;
    if (!r) return null;
    const f = this.host.files().find((x) => x.path === r.path);
    const h = f?.headings.find((x) => x.line === r.line && x.title === r.title);
    return f && h ? { f, h } : null;
  }
  private key() {
    return 'refile:recent:' + (this.host.dir() ?? '');
  }
  /** The last places moved to, newest first, one per file: its path and the heading's key ('' = the 1st level). */
  recent(): { path: string; key: string }[] {
    try {
      const v = JSON.parse(lsGet(this.key()) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => x && typeof x.path === 'string' && typeof x.key === 'string') : [];
    } catch {
      return [];
    }
  }
  /** «НЕДАВНИЕ» of step 1: the last places moved to, then recently opened files (the own file only as a place
   *  moved to before). */
  recentFiles(self: string): string[] {
    const opened = this.host.opened();
    return [...new Set([...this.recent().map((x) => x.path), ...opened.filter((p) => p && p !== self)])];
  }
  /**
   * Move it. The target is saved first (its unsaved edits go along) and re-read from disk; a heading chosen there
   * that is gone now gives 'gone' and the dialog stays. Then the target is written, and only then the source.
   */
  async move(dstPath: string, under: { key: string; line: number } | null): Promise<'ok' | 'gone' | 'error'> {
    const hooks = this.req?.hooks;
    hooks?.busy?.(true);
    try {
      return await this.moveNow(dstPath, under);
    } finally {
      hooks?.busy?.(false);
    }
  }
  private async moveNow(dstPath: string, under: { key: string; line: number } | null): Promise<'ok' | 'gone' | 'error'> {
    const req = this.req;
    if (!req) return 'error';
    const d0 = this.host.files().find((x) => x.path === dstPath);
    if (d0 && d0.text !== d0.disk) {
      const err = await this.host.saveNow(dstPath);
      if (err) {
        notify.say('Не удалось записать «' + displayName(d0.name) + '»: ' + err);
        return 'error';
      }
    }
    await this.host.reload();
    const src = this.source();
    const dst = this.host.files().find((x) => x.path === dstPath);
    if (!src || !dst) {
      this.req = null;
      notify.say('Не удалось перенести: файл изменился');
      return 'error';
    }
    const same = dst.path === src.f.path;
    let uh: Heading | null = null;
    if (under) {
      const inside = (x: Heading) => same && x.line >= src.h.line && x.line < src.h.end;
      const found = dst.headings.filter((x) => keyOf(x) === under.key && !inside(x));
      uh = found.sort((a, b) => Math.abs(a.line - under.line) - Math.abs(b.line - under.line))[0] ?? null;
      if (!uh) return 'gone';
    }
    this.req = null;
    await req.hooks?.before?.(src.h);
    let steps: { path: string; text: string }[];
    let line: number;
    if (same) {
      const r = moveWithin(src.f.text, src.h, uh);
      steps = [{ path: dst.path, text: r.text }];
      line = r.line;
    } else {
      const r = moveTo(src.f.text, src.h, dst.text, uh);
      steps = [{ path: dst.path, text: r.dst }, { path: src.f.path, text: r.src }]; // the target first: nothing is lost
      line = r.line;
    }
    const done = await this.host.writeAll(`Перенесено: ${bareTitle(src.h.title)}`, steps);
    if (!done) return 'error';
    const rec = [{ path: dst.path, key: uh ? keyOf(uh) : '' }, ...this.recent().filter((x) => x.path !== dst.path)].slice(0, 20);
    lsSet(this.key(), JSON.stringify(rec));
    if (req.self) this.host.caretAfter(src.f.path, src.h, same ? line : null);
    const name = displayName(dst.name);
    if (req.hooks?.done?.({ path: dst.path, line, label: `${name}${uh ? ' › ' + bareTitle(uh.title) : ''}`, step: done })) return 'ok';
    notify.note(`Перенесено в ${name}${uh ? ' › ' + bareTitle(uh.title) : ''}`, [
      { label: 'Открыть', run: () => { const i = this.host.files().findIndex((x) => x.path === dst.path); if (i >= 0) this.host.open(i, line); } },
      { label: 'Отменить', run: () => void this.host.undo(done) },
    ], 3000);
    return 'ok';
  }
}
