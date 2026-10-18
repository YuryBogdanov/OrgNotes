// The tab of the results of the search in every file (ТЗ 53 §1): one per window; the query, the options and the
// results are the panel's (`searchAll`). Not kept after a restart: the results live till the app quits (ТЗ 21 §2.1).

import { store } from '../store.svelte';
import { openView } from '../layout';
import { summary } from '../search';
import { anyFilter, noFilters, passes, type Facet, type Filters } from '../searchFilters';
import { tagsOf, type TagFile } from '../tags';
import { tagsState } from '../tagsState.svelte';
import { DEFAULT_WORKFLOW, parseHeadings, type Heading } from '../org';
import type { SearchGroup } from '../store.svelte';

export const SEARCH_TAB = 'search';
/** Bumped: the tab's field takes the focus (the panel's is `search.focusN`). */
export const tabFocus = $state({ n: 0, list: 0 });
export const SEARCH_ICON = 'M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.2 12.2 16.5 16.5';

const cut = (q: string) => (q.length > 24 ? q.slice(0, 23) + '…' : q);
/** «Поиск: переезд» (the query cut to 24); «Поиск» before the first run. */
export const searchTabLabel = () => (store.search.ran ? `Поиск: ${cut(store.search.ran)}` : 'Поиск');
/** «48 совпадений в 12 файлах» — the toolbar's second line. */
export const searchTabSub = () => (store.search.ran ? (store.search.total ? summary(store.search.total, store.search.groups.length) : 'Ничего не найдено') : '');

/** The tab there is made active (in its pane), else a new one after the active tab. A query typed and not run yet
 *  runs. */
export function openSearchTab() {
  const L = store.layout;
  const pi = L.panes.findIndex((p) => p.tabs.some((t) => t.kind === SEARCH_TAB));
  if (pi >= 0) {
    L.panes[pi].active = L.panes[pi].tabs.findIndex((t) => t.kind === SEARCH_TAB);
    L.active = pi;
  } else openView(L, L.active, SEARCH_TAB, () => ({}));
  const s = store.search;
  if (s.q.trim() && s.q.trim() !== s.ran) void store.runSearch();
  tabFocus.n++;
}
/** The search tab is the active one. */
export const searchTabActive = () => store.tab?.kind === SEARCH_TAB;

// ---- the filters (ТЗ 53 §4): they choose from what was found; a new query drops them (not «Где искать») ----------
/** The filters and the query they were set for; replaced whole on a change (the sets are not reactive inside). */
export const tabFilters = $state({ f: noFilters(), ran: '' });
export const setFilters = (change: (f: Filters) => void) => {
  own();
  const f: Filters = { off: new Set(tabFilters.f.off), status: new Set(tabFilters.f.status), tags: new Set(tabFilters.f.tags) };
  change(f);
  tabFilters.f = f;
};
export const resetFilters = () => (tabFilters.f = noFilters());
/** The filters for the results shown: a new query has none. */
export const liveFilters = (): Filters => (tabFilters.ran === store.search.ran ? tabFilters.f : noFilters());
/** Before a change: the filters are the shown query's (the old ones dropped). */
function own() {
  if (tabFilters.ran !== store.search.ran) Object.assign(tabFilters, { ran: store.search.ran, f: noFilters() });
}

/** The headings of a group's text as searched (the file's own, when not changed since). */
export function headsOf(g: SearchGroup): Heading[] {
  const f = store.files.find((x) => x.path === g.path);
  return f && f.text === g.stamp ? f.headings : parseHeadings(g.stamp, f?.wf ?? DEFAULT_WORKFLOW);
}
/** Every match's file, status and tags (with the inherited ones), in the order of the results. */
export function facetsOf(groups: SearchGroup[]): Facet[][] {
  const noInherit = tagsState.noInheritSet;
  return groups.map((g) => {
    const f = store.files.find((x) => x.path === g.path);
    const tf: TagFile = { name: g.name, headings: headsOf(g), filetags: f?.filetags ?? [] };
    const byHead = new Map<number, Facet>();
    const fileOnly: Facet = { file: g.path, status: '', tags: tf.filetags.map((t) => t.toLowerCase()) };
    return g.hits.map((h) => {
      if (h.under === null || !tf.headings[h.under]) return fileOnly;
      let x = byHead.get(h.under);
      if (!x) {
        x = { file: g.path, status: tf.headings[h.under].keyword ?? '', tags: tagsOf(tf, h.under, noInherit).map((t) => t.tag.toLowerCase()) };
        byHead.set(h.under, x);
      }
      return x;
    });
  });
}
/** Per group, the indices of its matches that pass the filters. */
export const keptOf = (facets: Facet[][], f: Filters): number[][] => facets.map((fs) => fs.flatMap((x, i) => (passes(x, f) ? [i] : [])));

/** ⌥⌘G with the tab open (in any pane): over the matches its filters keep (ТЗ 53 §5). */
export function keptForStep(): number[][] | null {
  if (!store.layout.panes.some((p) => p.tabs.some((t) => t.kind === SEARCH_TAB))) return null;
  const f = liveFilters();
  return anyFilter(f) ? keptOf(facetsOf(store.search.groups), f) : null;
}
