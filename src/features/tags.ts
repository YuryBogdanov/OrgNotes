// Tags (ТЗ 38): the tab «Тег» — the headings with the tags of its filter; the navigator's section is the core's
// (NavPanel), the settings' «Теги» too (Settings).

import { registerView } from '../views';
import { TAGS, TAG_ICON, type TagTab } from '../tagsState.svelte';
import TagsView from '../TagsView.svelte';

const tagsOf = (t: { data?: unknown }) => ((t.data as TagTab | undefined)?.tags ?? []).map((x) => `:${x}:`);
registerView({
  kind: TAGS,
  icon: TAG_ICON,
  component: TagsView,
  label: (t) => {
    const l = tagsOf(t);
    return !l.length ? 'Теги' : l.length === 1 ? `Тег ${l[0]}` : `Теги: ${l.join(' и ')}`;
  },
  crumbs: (t) => ['Теги', ...(tagsOf(t).length ? [tagsOf(t).join(' и ')] : [])],
  restore: (raw) => {
    const r = raw as Partial<TagTab> | null;
    return {
      tags: Array.isArray(r?.tags) ? r.tags.filter((x): x is string => typeof x === 'string') : [],
      show: r?.show === 'tasks' || r?.show === 'open' ? r.show : 'all',
      inherit: r?.inherit !== false,
    } satisfies TagTab;
  },
});
