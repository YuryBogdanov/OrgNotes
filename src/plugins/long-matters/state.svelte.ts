// «Долгие дела» (ТЗ 40): the long matters of the notes, read through the public API — every file's headings (own
// tags, statuses) by `readOrg`, then for each long matter its properties and touch (`index.heading`) and its last
// note (`index.lastNote`). Read again, a moment after a file, a touch or the folder changes.

import type { Ctx, HeadingRef } from '@panopticon/api';
import { readOrg, toneVars, type OrgFile } from '@panopticon/api/org';
import { grouped, longIn, readDay, readSettings, shown, sourceOf, DEFAULTS, type Matter, type Settings, type Shown } from './long';

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
  /** The files of the matters as read (their text, statuses), for the actions. */
  files = new Map<string, OrgFile>();
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

  /** The settings of «Настройки → Долгие дела» (the sources and the norm with the notes folder, the block on this Mac). */
  readStored() {
    this.settings = readSettings(this.ctx.settings.values());
  }
  /** The open statuses of the files read: the choice of «Статус ожидания». */
  openStates = $state<string[]>([]);

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
    const read = new Map<string, OrgFile>();
    let done = 0;
    await Promise.all(
      wanted.map(async (path) => {
        const f = await readOrg(ctx, path);
        if (f) {
          read.set(path, f);
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
              ...sourceOf(path, h, this.settings.sources),
            });
          }
        }
        done++;
        if (n === this.reading && this.progress) this.progress = { done, total: wanted.length };
      }),
    );
    if (n !== this.reading) return;
    this.files = read;
    this.openStates = [...new Set([...read.values()].flatMap((f) => f.info.open))];
    this.matters = out.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
    this.progress = null;
    this.today = startOfDay();
    // the touches are being counted: look again
    if (this.counting) this.soon(1000);
  }

  /** The matter at a heading (the editor's line, the palette's caret), if it is one. */
  at(ref: HeadingRef | null) {
    return ref ? this.matters.find((m) => m.path === ref.path && m.line === ref.line) : undefined;
  }
  /** Whom the matters wait for, the most used first (the sheet «Ждём…» offers them). */
  get waitedFor(): string[] {
    const n = new Map<string, number>();
    for (const m of this.matters) if (m.waiting) n.set(m.waiting, (n.get(m.waiting) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).map(([w]) => w);
  }

  // ---- what a row does ------------------------------------------------------------------------------------------
  refOf = (m: Matter): HeadingRef => ({ path: m.path, line: m.line, title: m.title });
  newTab(m: Matter) {
    void this.ctx.commands.run('file.open', { path: m.path, line: m.line, newTab: true });
  }
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
    void this.ctx.commands.run('settings.open', { section: 'Долгие дела' });
  }
}

export const long = new LongMatters();
