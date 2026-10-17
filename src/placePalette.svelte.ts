// The palette look of the choice of a place (roadmap 0.5, ТЗ 16), apart from how it looks: step 1 a file (recent ones
// first), step 2 a heading of it in a tree or the file's 1st level; the keys. The old PlacePicker and the new
// interface's next/PlacePalette.svelte (ТЗ 44 §2.1) draw the same state.

import { tick } from 'svelte';
import { store } from './store.svelte';
import { displayName } from './names';
import type { Heading } from './org';
import { fileRows, initialOpen, keyOf, treeRows, type FileRow, type TreeRow } from './refile';

// what is open in each file's tree, kept until the app quits
const openMemo = new Map<string, Set<string>>();

export type Pick = { path: string; heading: Heading | null };
export interface PlaceOpts {
  kind: 'file' | 'heading'; // the file alone, or a heading of it
  self?: string; // its own file: marked «этот файл»
  exclude?: string; // a file not offered
  recent: string[]; // paths offered first («НЕДАВНИЕ»)
  top: string | null; // the row «на 1-й уровень» at step 2 (none: a heading must be chosen)
  blocked: { path: string; line: number; end: number } | null; // the subtree being moved, in its own file
  lastKey?: (path: string) => string | undefined; // the branch to open at step 2
  onback?: () => void; // ⌫ in the empty field at step 1
  onpick?: (p: Pick) => Promise<string | void> | string | void; // a text: why it did not go (the window stays)
  onclose?: () => void;
}

export class PlacePaletteCtl {
  step = $state<1 | 2>(1);
  q = $state('');
  path = $state(''); // the file of step 2
  sel = $state(''); // 'f:<path>' | 'top' | 'h:<index>'
  err = $state('');
  busy = $state(false);
  openSet = $state<Set<string>>(new Set());
  rootName = $derived(store.dir ? store.dir.split('/').pop()! : 'заметки');
  files = $derived.by<FileRow[]>(() => {
    const o = this.o();
    return this.step === 1 ? fileRows(store.files, { q: this.q, root: this.rootName, recent: o.recent, self: o.self, exclude: o.exclude }) : [];
  });
  target = $derived(store.files.find((f) => f.path === this.path));
  tree = $derived.by(() => {
    const b = this.o().blocked;
    return this.step === 2 && this.target
      ? treeRows(this.target.headings, this.openSet, this.q, b && this.target.path === b.path ? { line: b.line, end: b.end } : undefined)
      : { rows: [] as TreeRow[], matches: 0 };
  });
  fileName = $derived(this.target ? displayName(this.target.name) : '');
  pickable = $derived.by(() => (this.step === 1 ? this.files.map((f) => 'f:' + f.path) : [...(this.o().top ? ['top'] : []), ...this.tree.rows.filter((r) => !r.blocked).map((r) => 'h:' + r.i)]));
  /** The component's: the chosen row scrolled into view, the field focused again (an error shown). */
  onscroll: () => void = () => {};
  onfocus: () => void = () => {};

  constructor(private o: () => PlaceOpts) {}
  start() {
    this.sel = this.pickable[0] ?? '';
  }
  close = () => this.o().onclose?.();
  private async scroll() {
    await tick();
    this.onscroll();
  }
  typed = () => {
    this.err = '';
    if (this.step === 1) this.sel = this.pickable[0] ?? '';
    else {
      const first = this.q.trim() ? this.tree.rows.find((r) => !r.dim && !r.blocked) : undefined;
      this.sel = first ? 'h:' + first.i : (this.pickable[0] ?? '');
    }
  };
  async toStep2(p: string) {
    const f = store.files.find((x) => x.path === p);
    if (!f) {
      this.err = `Не удалось прочитать ${displayName(p.split('/').pop() ?? p)}`;
      return;
    }
    this.openSet = openMemo.get(p) ?? initialOpen(f.headings, this.o().lastKey?.(p));
    this.path = p;
    this.step = 2;
    this.q = '';
    this.err = '';
    await tick();
    this.sel = this.pickable[0] ?? '';
    void this.scroll();
  }
  toStep1() {
    this.step = 1;
    this.q = '';
    this.err = '';
    this.sel = 'f:' + this.path;
    void this.scroll();
  }
  async choose(p: string, underIdx: number | null) {
    if (this.busy) return;
    const f = store.files.find((x) => x.path === p);
    const h = underIdx === null ? null : f?.headings[underIdx];
    if (!f || (underIdx !== null && !h)) return;
    this.busy = true;
    const r = await this.o().onpick?.({ path: p, heading: h ?? null });
    this.busy = false;
    if (typeof r === 'string') {
      this.err = r;
      if (this.o().kind === 'heading' && this.step !== 2) await this.toStep2(p);
      this.onfocus();
    }
  }
  act(id: string, meta = false) {
    const { kind, top } = this.o();
    if (this.step === 1) {
      if (!id.startsWith('f:')) return;
      const p = id.slice(2);
      if (kind === 'file' || (meta && top)) void this.choose(p, null);
      else void this.toStep2(p);
    } else if ((meta && top) || id === 'top') void this.choose(this.path, null);
    else if (id.startsWith('h:')) void this.choose(this.path, +id.slice(2));
  }
  setOpen(key: string, on: boolean) {
    const next = new Set(this.openSet);
    if (on) next.add(key);
    else next.delete(key);
    this.openSet = next;
    openMemo.set(this.path, next);
  }
  toggle(r: TreeRow) {
    if (this.target && r.hasKids && !this.q.trim()) this.setOpen(keyOf(this.target.headings[r.i]), !r.open);
  }
  /** → opens a branch, or goes into an open one; ← closes it, or goes to the parent. */
  side(right: boolean) {
    const t = this.target;
    if (!t || !this.sel.startsWith('h:')) return;
    const i = +this.sel.slice(2);
    const rows = this.tree.rows;
    const at = rows.findIndex((r) => r.i === i);
    const r = rows[at];
    if (!r) return;
    if (right) {
      if (r.hasKids && !r.open) this.setOpen(keyOf(t.headings[i]), true);
      else if (r.open) {
        const child = rows[at + 1];
        if (child && !child.blocked) this.sel = 'h:' + child.i;
      }
    } else if (r.open) this.setOpen(keyOf(t.headings[i]), false);
    else {
      const up = t.headings[i].parent;
      if (up >= 0 && !rows.find((x) => x.i === up)?.blocked) this.sel = 'h:' + up;
    }
    void this.scroll();
  }
  key = (e: KeyboardEvent) => {
    const { top, onback } = this.o();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const p = this.pickable;
      if (!p.length) return;
      const k = p.indexOf(this.sel);
      const d = e.key === 'ArrowDown' ? 1 : -1;
      this.sel = p[k < 0 ? 0 : (k + d + p.length) % p.length];
      void this.scroll();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.step === 2 && e.metaKey && top) this.act('top', true);
      else if (this.sel) this.act(this.sel, e.metaKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    } else if (e.key === 'Backspace' && !this.q) {
      e.preventDefault();
      if (this.step === 2) this.toStep1();
      else onback?.();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && this.step === 2 && !this.q) {
      e.preventDefault();
      this.side(e.key === 'ArrowRight');
    } else if (e.key === 'Tab') e.preventDefault();
  };
  /** The foot of each step (ТЗ 16). */
  foot(): [string, string][] {
    const { kind, top, onback } = this.o();
    if (this.step === 1)
      return kind === 'file'
        ? [['↑ ↓', 'выбрать'], ['↩', 'выбрать файл'], ['⎋', 'закрыть']]
        : [['↑ ↓', 'выбрать'], ['↩', 'к заголовкам файла'], ...(top ? [['⌘↩', 'сразу на 1-й уровень'] as [string, string]] : []), ...(onback ? [['⌫', 'к командам'] as [string, string]] : []), ['⎋', 'закрыть']];
    return [['↑ ↓', 'выбрать'], ['← →', 'свернуть / развернуть'], ['↩', top ? 'перенести сюда' : 'выбрать'], ...(top ? [['⌘↩', 'на 1-й уровень'] as [string, string]] : []), ['⌫', 'к файлам'], ['⎋', 'закрыть']];
  }
}
