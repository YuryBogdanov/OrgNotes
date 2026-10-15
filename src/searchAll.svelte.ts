// ⇧⌘F, the search in every file (tech sprint 2.2, from the store): the query, the results, the recent queries of this
// Mac. The store runs it on its files and opens the results.

import { searchFile, type Hit, type Scope } from './search';
import { lsGet, lsSet } from './storage';
import type { NoteFile } from './store.svelte';

/** The search in every file: up to this many matches are listed. */
export const SEARCH_CAP = 1000;
export interface SearchGroup {
  path: string;
  name: string; // relative
  hits: Hit[];
  open: boolean; // its results shown
  all: boolean; // «Ещё N» opened: every result, not the first 4
  stamp: string; // the text searched: the file changed since when it differs
}
export interface SearchState {
  q: string; // the field
  ran: string; // the query of the results shown
  scope: Scope;
  running: boolean;
  groups: SearchGroup[];
  total: number;
  capped: boolean; // more than SEARCH_CAP: only the first shown
  scanned: number; // files looked at so far
  sel: { g: number; i: number } | null;
  focusN: number; // bumped: the field takes the focus
}
const SEARCH_RECENT = 'search:recent';

class SearchAll {
  /** The search in every file: its query, where, the results (kept until the app quits). */
  state = $state<SearchState>({ q: '', ran: '', scope: 'all', running: false, groups: [], total: 0, capped: false, scanned: 0, sel: null, focusN: 0 });
  private runs = 0;
  recent(): { q: string; t: number }[] {
    try {
      const v = JSON.parse(lsGet(SEARCH_RECENT) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => x && typeof x.q === 'string') : [];
    } catch {
      return [];
    }
  }
  clearRecent() {
    lsSet(SEARCH_RECENT, '[]');
    this.state.focusN++;
  }
  /** ↩: the files given, a portion at a time (`open`: shown first); a new run stops the old one. */
  async run(files: NoteFile[], open: Set<string>, opts: { cs: boolean; word: boolean }) {
    const q = this.state.q.trim();
    if (!q) return;
    const run = ++this.runs;
    lsSet(SEARCH_RECENT, JSON.stringify([{ q, t: Date.now() }, ...this.recent().filter((x) => x.q !== q)].slice(0, 8)));
    const scope = this.state.scope;
    const groups: SearchGroup[] = [];
    let total = 0;
    let capped = false;
    Object.assign(this.state, { ran: q, running: true, groups: [], total: 0, capped: false, scanned: 0, sel: null });
    const order = (a: SearchGroup, b: SearchGroup) =>
      Number(open.has(b.path)) - Number(open.has(a.path)) || b.hits.length - a.hits.length || a.name.localeCompare(b.name, 'ru');
    const show = () => {
      const g = [...groups].sort(order);
      g.forEach((x, i) => (x.open = i < 5));
      Object.assign(this.state, { groups: g, total, capped });
    };
    for (let i = 0; i < files.length; i++) {
      if (run !== this.runs) return;
      const f = files[i];
      const hits = searchFile(f.text, f.headings, q, opts, scope, SEARCH_CAP - total);
      if (hits.length) groups.push({ path: f.path, name: f.name, hits, open: false, all: false, stamp: f.text });
      total += hits.length;
      if (total >= SEARCH_CAP) {
        capped = true;
        break;
      }
      if (i % 40 === 39) {
        this.state.scanned = i + 1;
        show();
        await new Promise((r) => setTimeout(r, 0)); // the window stays alive on a big folder
      }
    }
    if (run !== this.runs) return;
    show();
    this.state.running = false;
  }
}

export const searchAll = new SearchAll();
