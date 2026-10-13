// What «Канбан» sees of the notes, through the API only (ТЗ 33): the files shown as boards (their text, headings and
// sets of statuses), read again when they change; the tab shown; the settings; the columns folded per file.

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Ctx, Named } from '@panopticon/api';
import { parseHeadings, workflow, type Heading } from '@panopticon/api/org';
import { withBoard, type StatusSet } from './board';

export const VIEW = 'kanban.board';

export interface BFile {
  path: string;
  text: string;
  headings: Heading[];
  sets: StatusSet[];
  done: string[];
}
interface Folded {
  [path: string]: { [keyword: string]: boolean };
}

class Kanban {
  ctx!: Ctx;
  /** The files read: those shown as boards, or asked about. */
  files = new SvelteMap<string, BFile>();
  /** The tab shown: its file and its view. */
  active = $state<{ path: string | null; view: string | null }>({ path: null, view: null });
  /** «Показывать завершённые за» (0: all), «Сворачивать колонки отмены». */
  doneDays = $state(14);
  collapseCancel = $state(true);
  /** The columns folded or unfolded by hand, per file (this Mac). */
  folded = $state<Folded>({});
  /** «Ещё N старых ›» opened, this session: `path␟keyword`. */
  showOld = new SvelteSet<string>();

  readSettings() {
    const v = this.ctx.settings.values();
    this.doneDays = [0, 7, 14, 30].includes(Number(v.doneDays)) ? Number(v.doneDays) : 14;
    this.collapseCancel = v.collapseCancel !== false;
    this.folded = (this.ctx.storage.local.get<Folded>() as Folded | undefined) ?? {};
  }
  async read(path: string): Promise<BFile | null> {
    try {
      const [text, wf] = await Promise.all([this.ctx.files!.read(path), this.ctx.index!.workflow(path)]);
      const f: BFile = { path, text, headings: parseHeadings(text, workflow(wf)), sets: wf.sets.map((s) => ({ name: s.name, states: s.states.map((x) => ({ name: x.name, done: x.done })) })), done: wf.done };
      this.files.set(path, f);
      return f;
    } catch {
      this.files.delete(path);
      return null;
    }
  }
  /** A file changed: read again if we have it. */
  refresh(path: string) {
    if (this.files.has(path)) void this.read(path);
  }

  // ---- folding the columns ----
  isFolded(path: string, kw: string, firstDone: boolean, done: boolean): boolean {
    const own = this.folded[path]?.[kw];
    if (own !== undefined) return own;
    return done && !firstDone && this.collapseCancel;
  }
  setFolded(path: string, kw: string, on: boolean) {
    this.folded = { ...this.folded, [path]: { ...(this.folded[path] ?? {}), [kw]: on } };
    void this.ctx.storage.local.set(this.folded as never);
  }

  // ---- the colour of a status, as the core's chips draw it ----
  private tones = new SvelteMap<string, Named | null>();
  private asked = new Set<string>();
  tone(kw: string, path: string): string {
    const k = path + '\u0000' + kw;
    if (!this.tones.has(k) && !this.asked.has(k)) {
      // asked while drawing: the state changes after it
      this.asked.add(k);
      void this.ctx.index!.statusTone(kw, path).then((t) => this.tones.set(k, t));
    }
    const t = this.tones.get(k);
    return t ? `var(--p-${t})` : 'var(--fg2)';
  }

  // ---- the workflow of a file ----
  /** «#+BOARD: …» written (null: taken away), one step of ⌘Z. */
  async setBoard(path: string, name: string | null) {
    const r = await this.ctx.edit!.transaction(name ? `Доска: ${name}` : 'Убрать доску', (tx) => tx.update(path, (t) => withBoard(t, name)));
    if (r === 'ok') await this.read(path);
    return r === 'ok';
  }
}

export const kanban = new Kanban();
