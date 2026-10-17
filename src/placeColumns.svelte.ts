import { store } from './store.svelte';
import { better, fuzzy } from './fuzzy';

// The choice of a place in two columns (a plugin's form, ТЗ 27 §2.4): the files found by the query, the headings of
// the file chosen at the levels asked, and which column ↑↓ move in. Out of PlacePicker.svelte, so the old columns and
// the new ones (ТЗ 44 §4) are one.

export interface ColumnsProps {
  levels?: number[];
  file: string | null; // the file chosen (relative)
  heading: string | null; // the heading chosen: its title, or `extra`'s id
  extra?: { id: string; label: string } | null;
  onfile?: (rel: string) => void;
  onhead?: (id: string) => void;
}

export const baseName = (n: string) => n.split('/').pop()!.replace(/\.org$/, '');

export class PlaceColumnsCtl {
  q = $state('');
  col = $state<'file' | 'head'>('file');
  constructor(private p: () => ColumnsProps) {}

  readonly files = $derived.by(() =>
    store.files
      .map((f) => ({ f, m: this.q.trim() ? fuzzy(this.q, f.name) : null }))
      .filter((x) => !this.q.trim() || x.m)
      .sort((a, b) => (a.m && b.m ? (better(a.m, b.m) ? -1 : better(b.m, a.m) ? 1 : 0) : a.f.name.localeCompare(b.f.name, 'ru')))
      .map((x) => x.f),
  );
  readonly cur = $derived.by(() => store.files.find((f) => f.name === this.p().file));
  readonly heads = $derived.by(() => {
    const lv = this.p().levels;
    return this.cur ? this.cur.headings.map((h, i) => ({ h, i })).filter((x) => !lv || lv.includes(x.h.level)) : [];
  });

  /** ↑↓ of the sheet: in the column in focus. */
  move(d: 1 | -1) {
    const p = this.p();
    if (this.col === 'file') {
      const i = this.files.findIndex((f) => f.name === p.file);
      const n = this.files[Math.max(0, Math.min(this.files.length - 1, i + d))];
      if (n) p.onfile?.(n.name);
    } else {
      const opts = [...this.heads.map((x) => x.h.title), ...(p.extra ? [p.extra.id] : [])];
      const i = opts.indexOf(p.heading ?? '');
      const n = opts[Math.max(0, Math.min(opts.length - 1, i + d))];
      if (n) p.onhead?.(n);
    }
  }
}
