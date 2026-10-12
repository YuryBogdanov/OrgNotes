// The journal of edits (roadmap 0.1): every change a feature makes to files is a transaction — Org-level operations
// on headings found by reference — and a step of one journal, so one ⌘Z takes back the last of them wherever it was
// made (the Inbox list, a review card, the calendar, goals). Pure: the store reads the files and writes the result.

import { parseHeadings, setKeyword, type Heading, type Workflow } from './org';
import { setPlanning, setTags } from './edits';
import { remove } from './inbox';

/** A heading as a feature knows it: lines move with every edit, so the title is checked too. */
export interface HeadingRef {
  path: string;
  line: number;
  title: string;
}
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
  /** The heading now: at its line with its title, else the nearest one with that title. */
  heading(ref: HeadingRef): Heading | undefined {
    const f = this.read(ref.path);
    const t = this.text(ref.path);
    if (!f || t === undefined) return undefined;
    const hs = parseHeadings(t, f.wf);
    return hs.find((h) => h.line === ref.line && h.title === ref.title) ?? hs.filter((h) => h.title === ref.title).sort((a, b) => Math.abs(a.line - ref.line) - Math.abs(b.line - ref.line))[0];
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
  /** The files the transaction changes, in the order they were first touched (a move writes its target first). */
  result(): { path: string; text: string }[] {
    return [...this.texts].map(([path, text]) => ({ path, text }));
  }
}
