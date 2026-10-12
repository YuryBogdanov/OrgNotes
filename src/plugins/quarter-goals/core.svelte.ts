// What the goals see of the notes, through the API only (ТЗ 27): every file's text, its headings (parsed by the Org
// library with the file's statuses) — read once and again when a file changes; and the tab shown.

import type { Ctx } from '@panopticon/api';
import { parseHeadings, workflow, type Heading } from '@panopticon/api/org';

export interface PFile {
  /** The path in the notes folder (the API's): the name and the path are one here. */
  name: string;
  path: string;
  text: string;
  headings: Heading[];
  wf: { open: string[]; done: string[] };
}

class Core {
  ctx!: Ctx;
  files = $state.raw<PFile[]>([]);
  /** The tab shown: its kind, its file, the state of a tab of ours. */
  active = $state<{ kind: string | null; path: string | null; state: unknown }>({ kind: null, path: null, state: undefined });
  private reading = 0;

  async read(path: string): Promise<PFile | null> {
    try {
      const [text, wf] = await Promise.all([this.ctx.files!.read(path), this.ctx.index!.workflow(path)]);
      return { name: path, path, text, wf, headings: parseHeadings(text, workflow(wf)) };
    } catch {
      return null; // gone meanwhile
    }
  }
  /** Every file again (the folder changed, the statuses changed). */
  async load() {
    const n = ++this.reading;
    const list = await this.ctx.index!.files();
    const files = (await Promise.all(list.map((f) => this.read(f.path)))).filter((f): f is PFile => !!f);
    if (n === this.reading) this.files = files;
  }
  /** One file again (an edit, a change on disk). */
  async refresh(path: string) {
    const f = await this.read(path);
    const rest = this.files.filter((x) => x.path !== path);
    this.files = f ? [...rest, f].sort((a, b) => a.name.localeCompare(b.name)) : rest;
  }
}

export const core = new Core();
