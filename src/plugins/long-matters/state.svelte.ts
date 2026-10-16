// «Долгие дела» (ТЗ 40): the long matters of the notes, read through the public API — every file's headings (own
// tags, statuses) by `readOrg`, then for each long matter its properties and touch (`index.heading`) and its last
// note (`index.lastNote`). Read again, a moment after a file, a touch or the folder changes.

import type { Ctx, HeadingRef } from '@panopticon/api';
import { readOrg, toneVars } from '@panopticon/api/org';
import { grouped, longIn, readDay, readSettings, shown, DEFAULTS, type Matter, type Settings, type Shown } from './long';

export const VIEW = 'long-matters.list';
export type Filter = 'all' | 'due' | 'waiting' | 'nostatus';
export interface Row {
  m: Matter & { tone: string };
  s: Shown;
}

const startOfDay = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

class LongMatters {
  ctx!: Ctx;
  settings = $state<Settings>(DEFAULTS);
  matters = $state.raw<(Matter & { tone: string })[]>([]);
  /** The first reading: files read of all (null once done). */
  progress = $state<{ done: number; total: number } | null>({ done: 0, total: 0 });
  today = $state(startOfDay());
  /** The matter chosen (the list's row, the one the navigator's ⌥-click shows). */
  sel = $state<string | null>(null);
  /** The tab of ours shown (the navigator marks its row). */
  shownTab = $state(false);

  rows = $derived(this.matters.map((m): Row => ({ m, s: shown(m, this.today, this.settings.norm) })));
  groups = $derived(grouped(this.rows));
  /** Some touches are not known yet: the index is being built. */
  counting = $derived(this.matters.some((m) => !m.touched));
  /** Most dates are approximate (the first start on a folder). */
  mostlyApprox = $derived(this.matters.length > 0 && this.matters.filter((m) => m.touched?.approx).length * 2 > this.matters.length);

  readStored() {
    this.settings = readSettings(this.ctx.storage.folder.get());
  }

  private reading = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Read again a moment later (many events come together). */
  soon(ms = 150) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), ms);
  }
  async load() {
    const n = ++this.reading;
    const ctx = this.ctx;
    const files = await ctx.index!.files();
    const tagged = this.settings.sources.some((s) => s.kind === 'tag');
    const wanted = tagged ? files.map((f) => f.path) : files.map((f) => f.path).filter((p) => this.settings.sources.some((s) => s.kind === 'file' && s.file === p));
    if (this.progress) this.progress = { done: 0, total: wanted.length };
    const out: (Matter & { tone: string })[] = [];
    let done = 0;
    await Promise.all(
      wanted.map(async (path) => {
        const f = await readOrg(ctx, path);
        if (f) {
          for (const h of longIn(path, f.headings, f.info.done, this.settings.sources)) {
            const ref: HeadingRef = { path, line: h.line, title: h.title };
            const [info, note] = await Promise.all([ctx.index!.heading(ref), ctx.index!.lastNote(ref)]);
            if (!info) continue;
            out.push({
              key: `${path} › ${[...h.path, h.title].join(' › ')}#${h.line}`,
              path,
              line: h.line,
              title: h.title,
              keyword: h.keyword,
              tone: h.keyword ? toneVars(h.keyword, f.wf) : '',
              touched: info.touched,
              note,
              waiting: info.properties.WAITING_ON?.trim() || null,
              nextReview: readDay(info.properties.NEXT_REVIEW),
            });
          }
        }
        done++;
        if (n === this.reading && this.progress) this.progress = { done, total: wanted.length };
      }),
    );
    if (n !== this.reading) return;
    this.matters = out.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
    this.progress = null;
    this.today = startOfDay();
    // the touches are being counted: look again
    if (this.counting) this.soon(1000);
  }

  // ---- what a row does ------------------------------------------------------------------------------------------
  refOf = (m: Matter): HeadingRef => ({ path: m.path, line: m.line, title: m.title });
  reveal(m: Matter) {
    void this.ctx.commands.run('heading.reveal', { ref: this.refOf(m) });
  }
  beside(m: Matter) {
    void this.ctx.commands.run('file.open', { path: m.path, line: m.line, beside: true });
  }
  /** The tab «Долгие дела», with this matter chosen. */
  openList(key: string | null = null) {
    if (key) this.sel = key;
    void this.ctx.ui.open(VIEW, null);
  }
  openSources() {
    void this.ctx.commands.run('settings.open', { section: 'Плагины' });
  }
}

export const long = new LongMatters();
