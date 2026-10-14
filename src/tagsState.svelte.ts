// Tags (ТЗ 38): their colours and the ones not inherited (`tags` of .orgnotes/config.json — they go with the notes),
// the navigator's order, the tab «Тег» — one per pane, its filter (И), what it shows.

import { store } from './store.svelte';
import { openView, openViewNew, type Tab } from './layout';
import { sortTags, tagCounts } from './tags';
import { asNamed } from './themes';

export const TAGS = 'tags';
/** The state of a tab «Тег»: the tags of its filter (all of them), which headings, with inheritance. */
export interface TagTab {
  tags: string[];
  show: 'all' | 'tasks' | 'open';
  inherit: boolean;
}
export const TAG_ICON = 'M3 3h6.5l7.5 7.5-6 6L3.5 9.5zM6.8 6.8h.01';

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const key = (t: string) => t.toLowerCase();

class TagsState {
  /** tag (lower case) → a named colour */
  colors = $state.raw<Record<string, string>>({});
  /** tags not passed down to the headings under them (`org-tags-exclude-from-inheritance`) */
  noInherit = $state.raw<string[]>([]);
  sort = $state<'count' | 'name'>(lsGet('tags:sort') === 'name' ? 'name' : 'count');

  constructor() {
    store.onConfig((parsed) => {
      const t = parsed?.tags ?? {};
      const colors: Record<string, string> = {};
      if (t.colors && typeof t.colors === 'object') for (const [k, v] of Object.entries(t.colors)) if (typeof v === 'string' && asNamed(v)) colors[key(k)] = v;
      this.colors = colors;
      this.noInherit = Array.isArray(t.noInherit) ? t.noInherit.filter((x: unknown) => typeof x === 'string').map((x: string) => x.replace(/:/g, '').trim()).filter(Boolean) : [];
    });
  }
  get noInheritSet() {
    return new Set(this.noInherit.map(key));
  }
  /** The folder's tags with how often they are set, in the navigator's order. */
  get list() {
    return sortTags(tagCounts(store.agendaFiles), this.sort);
  }
  setSort(s: 'count' | 'name') {
    this.sort = s;
    try {
      localStorage.setItem('tags:sort', s);
    } catch {
      /* none */
    }
  }
  colorOf(tag: string): string | undefined {
    return this.colors[key(tag)];
  }

  private async save(change: (t: { colors: Record<string, string>; noInherit: string[] }) => void) {
    await store.updateConfig((raw) => {
      let o: any = {};
      try {
        o = raw ? JSON.parse(raw) : {};
      } catch {
        o = {};
      }
      const t = { colors: { ...(o.tags?.colors ?? {}) }, noInherit: [...(o.tags?.noInherit ?? [])] };
      change(t);
      const tags: any = {};
      if (Object.keys(t.colors).length) tags.colors = t.colors;
      if (t.noInherit.length) tags.noInherit = t.noInherit;
      if (Object.keys(tags).length) o.tags = tags;
      else delete o.tags;
      return JSON.stringify({ version: 1, ...o }, null, 2) + '\n';
    });
  }
  /** «Цвет тега»; null — «Без цвета». */
  setColor(tag: string, color: string | null) {
    return this.save((t) => {
      for (const k of Object.keys(t.colors)) if (key(k) === key(tag)) delete t.colors[k];
      if (color) t.colors[tag] = color;
    });
  }
  setNoInherit(list: string[]) {
    return this.save((t) => void (t.noInherit = [...new Set(list.map((x) => x.replace(/:/g, '').trim()).filter(Boolean))]));
  }

  // ---- the tab «Тег» ------------------------------------------------------------------------------------------------
  /** The tab of the active pane: shows these tags (one such tab per pane), or a new one. */
  open(tags: string[], fresh = false) {
    const L = store.layout;
    const pi = L.active;
    const data = (): TagTab => ({ tags, show: 'all', inherit: true });
    if (fresh) openViewNew(L, pi, TAGS, data());
    else openView(L, pi, TAGS, data, (t: Tab) => (t.data = { ...((t.data as TagTab) ?? data()), tags }));
  }
  /** ⌘-click: the tag added to the filter of the tab shown (И); none shown — a tab of it. */
  add(tag: string) {
    const t = store.tab;
    if (t?.kind === TAGS) {
      const d = t.data as TagTab;
      if (!d.tags.some((x) => key(x) === key(tag))) t.data = { ...d, tags: [...d.tags, tag] };
      return;
    }
    const pane = store.layout.panes[store.layout.active];
    const other = pane?.tabs.find((x) => x.kind === TAGS);
    if (other) {
      const d = other.data as TagTab;
      this.open(d.tags.some((x) => key(x) === key(tag)) ? d.tags : [...d.tags, tag]);
    } else this.open([tag]);
  }
  /** The tags of the tab shown (the navigator marks them). */
  get shown(): string[] {
    const t = store.tab;
    return t?.kind === TAGS ? ((t.data as TagTab)?.tags ?? []) : [];
  }
}

export const tagsState = new TagsState();
