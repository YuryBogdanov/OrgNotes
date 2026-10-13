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

  // ---- the cards: where they go (ТЗ 33 §4) ----
  /** What the board shown is asked by a command: a new card in the chosen card's column, the filter. */
  ask: ((a: { kind: 'new' | 'filter'; path: string }) => void) | null = null;
  /** The card chosen on the board of a file (its key: «line:title»). */
  selected = $state<{ path: string; key: string } | null>(null);
  /** The board of each file shown now: its columns of cards in order (all of them, the filter aside) — what the
   *  keys and the drops are counted against. */
  shown = new SvelteMap<string, { set: StatusSet; columns: { keyword: string; cards: { key: string; line: number; title: string }[] }[] }>();

  private ref(path: string, c: { line: number; title: string }) {
    const h = this.files.get(path)?.headings.find((x) => x.line === c.line && x.title === c.title);
    return { path, line: c.line, title: h?.title ?? c.title };
  }
  /** The heading's repeated date (SCHEDULED or DEADLINE with «+1w»), if it has one. */
  private repeats(path: string, line: number) {
    const h = this.files.get(path)?.headings.find((x) => x.line === line);
    return !!(h?.scheduled?.repeater || h?.deadline?.repeater);
  }
  /**
   * A card goes to a column at a place among its cards (the card itself not counted): the column's status (as ⇧→ in
   * the text: CLOSED for a finished one, the log if set), and it moves in the file right after the card above it there,
   * else right before the card below; an empty column keeps its place. A repeated task finished goes back to the
   * first status with its date moved (as in Org): it does not move, and the window says the next date.
   */
  async moveCard(path: string, card: { key: string; line: number; title: string; keyword: string }, to: string, index: number) {
    const col = this.shown.get(path)?.columns.find((c) => c.keyword === to);
    const set = this.shown.get(path)?.set;
    if (!col || !set) return;
    const others = col.cards.filter((c) => c.key !== card.key);
    const above = others[index - 1];
    const below = others[index];
    const ref = this.ref(path, card);
    const doneTo = set.states.some((s) => s.name === to && s.done);
    const repeat = doneTo && to !== card.keyword && this.repeats(path, card.line);
    const sameSpot = to === card.keyword && (col.cards.findIndex((c) => c.key === card.key) === index);
    if (sameSpot) return;
    const r = await this.ctx.edit!.transaction(to === card.keyword ? 'Переставить карточку' : `${to}: ${card.title}`, (tx) => {
      if (to !== card.keyword) tx.setStatus(ref, to);
      if (repeat) return;
      if (above) tx.move(ref, { after: this.ref(path, above) });
      else if (below) tx.move(ref, { before: this.ref(path, below) });
    });
    if (r !== 'ok') return;
    const f = await this.read(path);
    if (repeat && f) this.sayRepeat(path, card.title);
    if (f) this.follow(path, card.title);
  }
  /** «Повторяющаяся задача: следующая дата — 21 октября». */
  private sayRepeat(path: string, title: string) {
    const h = this.files.get(path)?.headings.find((x) => x.title === title && x.level === 1);
    const d = h?.scheduled ?? h?.deadline;
    const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    this.ctx.ui.notify(d ? `Повторяющаяся задача: следующая дата — ${d.d} ${MON[d.m - 1]}` : 'Повторяющаяся задача: дата сдвинута');
  }
  /** The chosen card after a write: found again by its title (its line moved). */
  private follow(path: string, title: string) {
    const h = this.files.get(path)?.headings.find((x) => x.level === 1 && x.title === title);
    if (h && this.selected?.path === path) this.selected = { path, key: `${h.line}:${h.title}` };
  }
  /** ⇧← / ⇧→: the status before / after in the set (the next column); the place in the file stays (a repeated task
   *  finished: its date moves, as by a drop). */
  async stepStatus(path: string, d: -1 | 1) {
    const card = this.card(path);
    const set = this.shown.get(path)?.set;
    if (!card || !set) return;
    const i = set.states.findIndex((s) => s.name === card.keyword);
    const to = set.states[i + d]?.name;
    if (!to) return;
    const doneTo = set.states.some((s) => s.name === to && s.done);
    const repeat = doneTo && this.repeats(path, card.line);
    const r = await this.ctx.edit!.transaction(`${to}: ${card.title}`, (tx) => tx.setStatus(this.ref(path, card), to));
    if (r !== 'ok') return;
    await this.read(path);
    if (repeat) this.sayRepeat(path, card.title);
    this.follow(path, card.title);
  }
  /** ⌥↑ / ⌥↓: one place up / down in its column. */
  async stepPlace(path: string, d: -1 | 1) {
    const card = this.card(path);
    if (!card) return;
    const col = this.shown.get(path)?.columns.find((c) => c.keyword === card.keyword);
    if (!col) return;
    const i = col.cards.findIndex((c) => c.key === card.key);
    const j = i + d;
    if (i < 0 || j < 0 || j >= col.cards.length) return;
    await this.moveCard(path, card, card.keyword, j);
  }
  /** The chosen card of a file, with its column's status. */
  card(path: string): { key: string; line: number; title: string; keyword: string } | null {
    const s = this.selected;
    if (!s || s.path !== path) return null;
    for (const col of this.shown.get(path)?.columns ?? []) {
      const c = col.cards.find((x) => x.key === s.key);
      if (c) return { ...c, keyword: col.keyword };
    }
    return null;
  }
  /** «+ Карточка»: «* STATUS text» right after the last heading of that column in the file (an empty one: the end of
   *  the file). Its key, null — not made. */
  async newCard(path: string, keyword: string, text: string): Promise<string | null> {
    const title = text.replace(/\s+/g, ' ').trim();
    if (!title) return null;
    const col = this.shown.get(path)?.columns.find((c) => c.keyword === keyword);
    const last = col?.cards.reduce<{ line: number; title: string } | null>((a, c) => (!a || c.line > a.line ? c : a), null);
    let made: { line: number; title: string } | null = null;
    const r = await this.ctx.edit!.transaction(`Новая карточка: ${title}`, (tx) => {
      const org = `* ${keyword} ${title}`;
      made = last ? tx.insertHeading({ after: this.ref(path, last) }, org) : tx.insertHeading({ file: path, position: 'end' }, org);
    });
    if (r !== 'ok' || !made) return null;
    await this.read(path);
    const m = made as { line: number; title: string };
    return `${m.line}:${m.title}`;
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
