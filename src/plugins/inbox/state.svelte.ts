// What the Inbox sees of the notes, through the API only (ТЗ 28): the Inbox file — its text, its headings parsed by the
// Org library with its statuses — and the files the review's tasks were moved to; the plugin's settings. Read once and
// again when a file, the Inbox file or the folder changes.

import type { Ctx, HeadingRef } from '@panopticon/api';
import { parseHeadings, sequenceFor, workflow, type Heading, type Workflow } from '@panopticon/api/org';
import { DEFAULT_SETTINGS, inboxItems, readSettings, type InboxItem, type ListSettings } from './list';
import { closingStatus, locate, reviewQueue, type ReviewItem } from './review';

export interface PFile {
  path: string;
  text: string;
  headings: Heading[];
  wf: Workflow;
}

class Data {
  ctx!: Ctx;
  /** The Inbox file (null: not chosen, or not there); `chosen`: the setting (a file gone shows its name). */
  path = $state<string | null>(null);
  chosen = $state<string | null>(null);
  /** The files read: the Inbox's, and those a task was moved to. */
  files = $state.raw<Record<string, PFile>>({});
  settings = $state.raw<ListSettings>(DEFAULT_SETTINGS);
  /** The done statuses of the Inbox file's sets, for the settings' «Выполнено» and «Отменить». */
  doneStates = $state.raw<string[]>([]);
  private reading = 0;

  get file(): PFile | null {
    return this.path ? (this.files[this.path] ?? null) : null;
  }
  /** The unsorted tasks of the Inbox file. */
  get list(): InboxItem[] {
    const f = this.file;
    return f ? inboxItems(f.text, f.headings, f.wf, this.settings.order) : [];
  }
  /** The queue a review would start with now. */
  get pending(): ReviewItem[] {
    const f = this.file;
    return f ? reviewQueue(f.text, f.headings, f.wf, f.path, this.settings.reviewOrder) : [];
  }

  async read(path: string): Promise<PFile | null> {
    try {
      const [text, w] = await Promise.all([this.ctx.files!.read(path), this.ctx.index!.workflow(path)]);
      const wf = workflow(w) as Workflow;
      return { path, text, wf, headings: parseHeadings(text, wf) };
    } catch {
      return null; // gone meanwhile
    }
  }
  /** One file again (an edit, a change on disk, a task moved there). */
  async refresh(path: string) {
    const f = await this.read(path);
    const rest = { ...this.files };
    if (f) rest[path] = f;
    else delete rest[path];
    this.files = rest;
  }
  /** The Inbox file again (chosen anew, the folder or the statuses changed); the other files read again too. */
  async load() {
    const n = ++this.reading;
    const { path, chosen } = await this.ctx.index!.inbox();
    const keep = Object.keys(this.files).filter((p) => p !== path);
    const read = await Promise.all([path, ...keep].map((p) => (p ? this.read(p) : null)));
    if (n !== this.reading) return;
    this.files = Object.fromEntries(read.filter((f): f is PFile => !!f).map((f) => [f.path, f]));
    this.path = path;
    this.chosen = chosen;
    const sets = this.file?.wf.sequences ?? [];
    this.doneStates = [...new Set(sets.flatMap((s) => s.states.filter((x) => x.done).map((x) => x.name)))];
  }
  readSettings() {
    this.settings = readSettings(this.ctx.settings.values());
  }

  // ---- a task in its file now ---------------------------------------------------------------------------------
  /** A heading of the list as the API knows it. */
  refOf(it: { line: number; title: string }, path = this.path ?? ''): HeadingRef {
    return { path, line: it.line, title: it.title };
  }
  /** The file and the heading of a review's task, as they are now. */
  find(it: ReviewItem): { f: PFile; h: Heading } | null {
    const f = this.files[it.path];
    const h = f && locate(f.text, f.headings, it);
    return f && h ? { f, h } : null;
  }
  /** The heading of the list's done status for a task: its set's first done one. */
  doneOf(keyword: string): string | null {
    const f = this.file;
    if (!f) return null;
    return sequenceFor(f.wf, keyword).states.find((s) => s.done)?.name ?? f.wf.done[0] ?? null;
  }
  /** The status «Выполнено» / «Отменить» writes for this task (null: its set has none). */
  closing(it: ReviewItem, which: 'done' | 'cancel'): string | null {
    const kw = this.closingOf(it, which);
    return kw && kw !== this.keywordOf(it) ? kw : null; // already so: nothing to do (#105)
  }
  /** The status «Выполнено» / «Отменить» writes, whether or not the task has it already. */
  closingOf(it: ReviewItem, which: 'done' | 'cancel'): string | null {
    const r = this.find(it);
    const wf = r?.f.wf ?? this.file?.wf;
    return wf ? closingStatus(wf, this.keywordOf(it), which, which === 'done' ? this.settings.reviewDone : this.settings.reviewCancel) : null;
  }
  /** The task's status now. */
  keywordOf(it: ReviewItem): string | null {
    return this.find(it)?.h.keyword ?? it.keyword;
  }
}

export const data = new Data();
