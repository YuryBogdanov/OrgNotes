// The tab of the results of the search in every file (ТЗ 53 §1): one per window; the query, the options and the
// results are the panel's (`searchAll`). Not kept after a restart: the results live till the app quits (ТЗ 21 §2.1).

import { store } from '../store.svelte';
import { openView } from '../layout';
import { summary } from '../search';

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
