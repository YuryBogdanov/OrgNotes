import { plugins } from '../api/host.svelte';
import { CARDS_KEY } from '../api/manifest';
import { settingsValues } from '../api/pluginSettings';
import type { FileCardSpec, HeadingRef } from '../api/index';
import { headingAt } from '../org';
import { store } from '../store.svelte';
import { allNavs } from '../views';

// The cards of a file in the new interface (ТЗ 44 §5–§8): which plugins have something to say about the file open
// (their `match`, asked when the tab is shown and when the file changes), in the order of their sections in the
// sidebar; the ones folded (on this Mac, by card, not by file); a card whose plugin failed while it was shown stays
// in its place with the reason, until another file is shown.

export interface Card {
  id: string;
  plugin: string;
  title: string;
  icon: string;
  spec?: FileCardSpec;
  /** Its plugin failed: why. */
  broken?: string;
}

const FOLDED = 'next:cardsFolded';
const readFolded = () => {
  try {
    const v = JSON.parse(localStorage.getItem(FOLDED) ?? '[]');
    return new Set<string>(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set<string>();
  }
};

/** The deepest heading under the caret of the file shown: what a card's «Под курсором» is about. */
export function caretHeading(): HeadingRef | null {
  const f = store.tab?.kind === 'file' ? store.file : undefined;
  if (!f) return null;
  const k = headingAt(f.headings, store.tab!.cursor.line);
  return k >= 0 ? { path: f.name, line: f.headings[k].line, title: f.headings[k].title } : null;
}

export class FileCardsCtl {
  folded = $state(readFolded());
  /** The cards that said yes for the file, by id. */
  private yes = $state<string[]>([]);
  private shownFor = $state<string | null>(null);
  /** The cards shown for the file, with the plugin each is of (a failed one is kept by it). */
  private seen = new Map<string, Card>();
  constructor(private path: () => string | null) {}

  /** Every card declared by a plugin that is on, its setting on, in the sidebar's order of the plugins. */
  private readonly declared = $derived.by((): Card[] => {
    const navOrder = new Map(allNavs().map((n) => [n.id, n.order]));
    const out: { c: Card; at: number }[] = [];
    plugins.entries.forEach((e, i) => {
      const m = e.manifest;
      if (!m || !e.enabled || !m.contributes.fileCards.length) return;
      if (settingsValues(m)[CARDS_KEY] === false) return;
      const at = Math.min(...m.contributes.navSections.map((n) => navOrder.get(n.id) ?? Infinity), 1000 + i);
      for (const c of m.contributes.fileCards) {
        const reg = plugins.fileCards.get(c.id);
        const failed = plugins.failed.get(m.id);
        out.push({ c: { id: c.id, plugin: m.id, title: c.title, icon: c.icon, spec: reg?.plugin === m.id ? reg.spec : undefined, ...(failed ? { broken: failed } : {}) }, at });
      }
    });
    return out.sort((a, b) => a.at - b.at).map((x) => x.c);
  });

  /** The cards of the file shown now. */
  readonly cards = $derived.by((): Card[] => {
    const p = this.path();
    if (!p || p !== this.shownFor) return [];
    return this.declared.filter((c) => (c.broken ? this.seen.has(c.id) : !!c.spec && this.yes.includes(c.id)));
  });

  /** The effects: `match` asked again when the file shown, its text, or the cards registered change. */
  effects() {
    $effect(() => {
      const p = this.path();
      const text = store.files.find((f) => f.name === p)?.text;
      const asked = this.declared.filter((c) => c.spec && !c.broken);
      void text;
      if (!p) {
        this.yes = [];
        this.shownFor = null;
        return;
      }
      if (p !== this.shownFor) this.seen.clear();
      let stale = false;
      void Promise.all(asked.map(async (c) => ((await Promise.resolve(plugins.guard(c.plugin, () => c.spec!.match(p), false)).catch(() => false)) === true ? c.id : null))).then((ids) => {
        if (stale) return;
        this.yes = ids.filter((x): x is string => !!x);
        this.shownFor = p;
        for (const c of asked) if (this.yes.includes(c.id)) this.seen.set(c.id, c);
      });
      return () => {
        stale = true;
      };
    });
  }

  toggle(id: string) {
    const next = new Set(this.folded);
    if (!next.delete(id)) next.add(id);
    this.folded = next;
    try {
      localStorage.setItem(FOLDED, JSON.stringify([...next]));
    } catch {
      /* no storage */
    }
  }
}
