// The index of touches (ТЗ 40 §2): the last change of every heading of the folder, its subtree included. The store
// tells it what was written and what came from disk; it matches the files against its records (touch.ts) and keeps
// them in `.orgnotes/touch.json` (with the folder, not in the org files).

import { parseHeadings, type Workflow } from './org';
import { reconcileFile, type TouchMode, type TouchRecord, type TouchRecords } from './touch';
import { invoke, isTauri } from './tauri';

/** A file as the index reads it: its name in the folder, its text as on disk, its statuses (to know the headings). */
export interface TouchFile {
  name: string;
  disk: string;
  wf: Workflow;
}

const VERSION = 1;
/** A heading gone from a file waits this long for the file it moved to (a refile writes one, then the other). */
const MOVE_WAIT = 60_000;

class TouchIndex {
  records = $state.raw<TouchRecords>({});
  /** The folder's files have been matched once (till then a heading has no touch). */
  ready = $state(false);
  /** Headings gone from where they were, for a while: one that shows up elsewhere unchanged keeps its touch. */
  private moved = new Map<string, TouchRecord & { goneAt: number }>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private gen = 0;

  /** The folder opened: the records read, then every file matched (what changed while the app was closed gets the
   *  file's modification time; a heading without history, a date from the file). */
  async open(files: TouchFile[], mtimeOf: (name: string) => number) {
    const gen = ++this.gen;
    this.ready = false;
    this.moved.clear();
    let stored: TouchRecords = {};
    try {
      const raw = isTauri ? await invoke<string | null>('read_touch_file') : null;
      const v = raw ? JSON.parse(raw) : null;
      if (v && v.version === VERSION && v.records && typeof v.records === 'object') stored = v.records;
    } catch {
      /* unreadable: built anew from the files */
    }
    if (gen !== this.gen) return;
    let next: TouchRecords = {};
    for (const f of files) next = { ...next, ...this.match(f, stored, mtimeOf(f.name), 'open').records };
    this.records = next;
    this.ready = true;
    this.persist();
  }
  /** A file written by the app (`at`: now) or read from disk changed (`at`: its modification time). */
  change(f: TouchFile, at: number) {
    if (!this.ready) return;
    const { records, gone } = this.match(f, this.records, at, 'change');
    const now = Date.now();
    for (const k of gone) this.moved.set(k, { ...this.records[k], goneAt: now });
    const rest = Object.fromEntries(Object.entries(this.records).filter(([k, r]) => r.file !== f.name && !(k in records)));
    this.records = { ...rest, ...records };
    this.persist();
  }
  /** A file gone from the folder (deleted, or renamed: the new name comes as a new file and takes the history). */
  removeFile(name: string) {
    if (!this.ready) return;
    const now = Date.now();
    const keep: TouchRecords = {};
    for (const [k, r] of Object.entries(this.records)) {
      if (r.file === name) this.moved.set(k, { ...r, goneAt: now });
      else keep[k] = r;
    }
    this.records = keep;
    this.persist();
  }
  /** The touch of the heading at `line` of a file (by its name in the folder). */
  at(file: string, line: number): TouchRecord | undefined {
    for (const r of Object.values(this.records)) if (r.file === file && r.line === line) return r;
    return undefined;
  }

  private match(f: TouchFile, prev: TouchRecords, at: number, mode: TouchMode) {
    const now = Date.now();
    const moved: TouchRecords = {};
    for (const [k, r] of this.moved) {
      if (now - r.goneAt > MOVE_WAIT) this.moved.delete(k);
      else moved[k] = r;
    }
    const res = reconcileFile(f.name, f.disk.split('\n'), parseHeadings(f.disk, f.wf), prev, moved, at, mode);
    for (const [k, r] of this.moved) if (Object.values(res.records).some((x) => x.hash === r.hash && x.at === r.at)) this.moved.delete(k);
    return res;
  }
  /** Written a moment after the last change. */
  private persist() {
    if (!isTauri) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void invoke('write_touch_file', { text: JSON.stringify({ version: VERSION, records: this.records }) }).catch(() => {});
    }, 1000);
  }
}

export const touches = new TouchIndex();
