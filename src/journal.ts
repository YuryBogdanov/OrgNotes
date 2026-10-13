// The journal of edits (roadmap 0.1): every change a feature makes to files is a transaction — Org-level operations
// on headings found by reference — and a step of one journal, so one ⌘Z takes back the last of them wherever it was
// made (the Inbox list, a review card, the calendar, goals). Pure: the store reads the files and writes the result.

import { parseHeadings, setKeyword, type Heading, type Workflow } from './org';
import { setPlanning, setTags } from './edits';
import { remove } from './inbox';
import { bodyOf, insertHeadingAt, replaceBody, setProperty } from './orgOps';
import { moveTo, moveWithin } from './refile';

/** A heading as a feature knows it: lines move with every edit, so the title is checked too. */
export interface HeadingRef {
  path: string;
  line: number;
  title: string;
}
/** The reference of a heading as it is now. */
export const refOf = (f: { path: string }, h: { line: number; title: string }): HeadingRef => ({ path: f.path, line: h.line, title: h.title });
export interface Change {
  path: string;
  before: string;
  after: string;
}
export interface Step {
  id: number;
  label: string;
  changes: Change[];
  /** What the feature puts back on its side (a review card, counters) when the step is taken back. */
  onUndo?: () => void;
}

/** The steps written in this session, the last one on top. */
export class Journal {
  private steps: Step[] = [];
  private n = 0;
  record(label: string, changes: Change[], onUndo?: () => void): Step {
    const s: Step = { id: ++this.n, label, changes, onUndo };
    this.steps.push(s);
    if (this.steps.length > 200) this.steps.shift();
    return s;
  }
  last(): Step | undefined {
    return this.steps[this.steps.length - 1];
  }
  has(s: Step) {
    return this.steps.includes(s);
  }
  drop(s: Step) {
    this.steps = this.steps.filter((x) => x !== s);
  }
  get size() {
    return this.steps.length;
  }
}

/** A step can be taken back while every file it changed is still as the step left it. */
export const canUndo = (s: Step, textOf: (path: string) => string | undefined) => s.changes.every((c) => textOf(c.path) === c.after);

export interface TxFile {
  path: string;
  text: string;
  wf: Workflow;
}

/**
 * A transaction being built: the operations change the files' texts in memory, in order; nothing is written until
 * the store applies it. A reference not found (the heading moved or changed meanwhile) makes it a conflict.
 */
export class Tx {
  private texts = new Map<string, string>();
  conflict = false;
  constructor(private read: (path: string) => TxFile | undefined) {}

  /** The file's text as the transaction has it now. */
  text(path: string): string | undefined {
    return this.texts.get(path) ?? this.read(path)?.text;
  }
  /** The file's headings as the transaction has it now. */
  headings(path: string): Heading[] | undefined {
    const f = this.read(path);
    const t = this.text(path);
    return f && t !== undefined ? parseHeadings(t, f.wf) : undefined;
  }
  /** The heading now: at its line with its title, else the nearest one with that title. */
  heading(ref: HeadingRef, hs = this.headings(ref.path)): Heading | undefined {
    if (!hs) return undefined;
    return hs.find((h) => h.line === ref.line && h.title === ref.title) ?? hs.filter((h) => h.title === ref.title).sort((a, b) => Math.abs(a.line - ref.line) - Math.abs(b.line - ref.line))[0];
  }
  /** The direct subheadings of a heading now. */
  children(ref: HeadingRef): Heading[] {
    const hs = this.headings(ref.path);
    const h = this.heading(ref, hs);
    if (!hs || !h) return [];
    const i = hs.indexOf(h);
    return hs.filter((x) => x.parent === i);
  }
  /** The text under a heading now (as `replaceBody` changes it); null — not found. */
  body(ref: HeadingRef): string | null {
    const h = this.heading(ref);
    const t = this.text(ref.path);
    return h && t !== undefined ? bodyOf(t, h) : null;
  }
  /** The reference of the heading at a line now. */
  private refAt(path: string, line: number): HeadingRef | null {
    const h = this.headings(path)?.find((x) => x.line === line);
    return h ? { path, line, title: h.title } : null;
  }
  /** Any change of a file's text (the feature's own pure function). null leaves the file as it is. */
  update(path: string, fn: (text: string, wf: Workflow) => string | null) {
    const f = this.read(path);
    const t = this.text(path);
    if (!f || t === undefined) {
      this.conflict = true;
      return;
    }
    const next = fn(t, f.wf);
    if (next !== null && next !== t) this.texts.set(path, next);
  }
  private on(ref: HeadingRef, fn: (text: string, h: Heading, wf: Workflow) => string) {
    const h = this.heading(ref);
    if (!h) {
      this.conflict = true;
      return;
    }
    this.update(ref.path, (t, wf) => fn(t, h, wf));
  }
  setStatus(ref: HeadingRef, kw: string | null) {
    this.on(ref, (t, h, wf) => setKeyword(t, h, kw, wf));
  }
  setPlanning(ref: HeadingRef, kind: 'SCHEDULED' | 'DEADLINE', date: Date | null) {
    this.on(ref, (t, h) => setPlanning(t, h, kind, date));
  }
  setTags(ref: HeadingRef, tags: string[]) {
    this.on(ref, (t, h) => setTags(t, h, tags));
  }
  remove(ref: HeadingRef) {
    this.on(ref, (t, h) => remove(t, h));
  }
  /** What the plugins' API adds (ТЗ 26): a property, a new heading, a body, a move. A wrong org text: `error`. */
  error: string | null = null;
  private orFail(fn: () => string | null, what: string): string | null {
    try {
      const r = fn();
      if (r === null) this.error = what;
      return r;
    } catch {
      this.error = what;
      return null;
    }
  }
  setProperty(ref: HeadingRef, key: string, value: string | null) {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) this.error = 'имя свойства — латиница, цифры, _ и -';
    else this.on(ref, (t, h) => setProperty(t, h, key, value));
  }
  /** A new heading; its reference (null: not made — a conflict or a wrong org text). */
  insertHeading(at: { under: HeadingRef; position: 'first' | 'last' } | { under: HeadingRef; before: HeadingRef } | { file: string; position: 'top' | 'end' }, org: string): HeadingRef | null {
    const bad = 'нужен один заголовок с подзаголовками';
    const path = 'under' in at ? at.under.path : at.file;
    let line = -1;
    const put = (fn: (t: string) => { text: string; line: number } | null) =>
      this.update(path, (t) =>
        this.orFail(() => {
          const r = fn(t);
          if (r) line = r.line;
          return r?.text ?? null;
        }, bad),
      );
    if ('under' in at) {
      const h = this.heading(at.under);
      const b = 'before' in at ? this.heading(at.before) : undefined;
      if (!h || ('before' in at && (!b || b.line <= h.line || b.line >= h.end))) {
        this.conflict = true;
        return null;
      }
      put((t) => insertHeadingAt(t, b ? { under: h, before: b } : { under: h, position: (at as { position: 'first' | 'last' }).position }, org));
    } else put((t) => insertHeadingAt(t, { position: at.position }, org));
    return line >= 0 ? this.refAt(path, line) : null;
  }
  /** The direct subheading of that title (case and the spaces around it aside), made when there is none — last, or
   *  before a subheading. */
  ensureChild(under: HeadingRef, title: string, at: { before?: HeadingRef } = {}): HeadingRef | null {
    const h = this.heading(under);
    if (!h) {
      this.conflict = true;
      return null;
    }
    const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
    const have = this.children(under).find((x) => norm(x.title) === norm(title));
    if (have) return { path: under.path, line: have.line, title: have.title };
    const org = '* ' + title.trim();
    return this.insertHeading(at.before ? { under, before: at.before } : { under, position: 'last' }, org);
  }
  replaceBody(ref: HeadingRef, org: string) {
    const h = this.heading(ref);
    if (!h) this.conflict = true;
    else this.update(ref.path, (t) => this.orFail(() => replaceBody(t, h, org), 'в тексте под заголовком не может быть заголовков'));
  }
  move(ref: HeadingRef, to: { under: HeadingRef } | { file: string }) {
    const h = this.heading(ref);
    const under = 'under' in to ? (this.heading(to.under) ?? null) : null;
    const dst = 'under' in to ? to.under.path : to.file;
    if (!h || ('under' in to && !under) || this.text(dst) === undefined) {
      this.conflict = true;
      return;
    }
    if (dst === ref.path) {
      this.update(dst, (t) => this.orFail(() => moveWithin(t, h, under).text, 'заголовок нельзя перенести внутрь него самого'));
      return;
    }
    const src = this.text(ref.path)!;
    const r = moveTo(src, h, this.text(dst)!, under);
    this.update(dst, () => r.dst); // the target first: a failed write loses nothing
    this.update(ref.path, () => r.src);
  }
  /** The files the transaction changes, in the order they were first touched (a move writes its target first). */
  result(): { path: string; text: string }[] {
    return [...this.texts].map(([path, text]) => ({ path, text }));
  }
}
