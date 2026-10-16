// The plugin «long-matters» (ТЗ 40): the section of the navigator, the tab of the list, the commands — and how it
// follows the notes (a file, a touch, the folder).

import { definePlugin } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import { long, VIEW, type Filter } from './state.svelte';
import Panel from './Panel.svelte';
import List from './List.svelte';

const FILTERS: Filter[] = ['all', 'due', 'waiting', 'nostatus'];

export default definePlugin({
  async activate(ctx) {
    long.ctx = ctx;
    long.readStored();
    await long.load();

    ctx.storage.folder.onChange(() => {
      long.readStored();
      long.soon();
    });
    ctx.events.on('file.changed', () => long.soon());
    ctx.events.on('heading.touched', () => long.soon());
    ctx.events.on('folder.changed', () => {
      long.readStored();
      long.soon(0);
    });
    ctx.events.on('day.changed', () => long.soon(0));

    ctx.ui.navSection('long-matters', (el) => {
      const app = mount(Panel, { target: el });
      return () => void unmount(app);
    });
    ctx.ui.view<Filter>(VIEW, {
      title: () => 'Долгие дела',
      crumbs: () => ['Долгие дела'],
      restore: (raw) => (FILTERS.includes(raw as Filter) ? (raw as Filter) : 'all'),
      render: (el, state, tab) => {
        const app = mount(List, { target: el, props: { initial: FILTERS.includes(state) ? state : 'all', setState: (f: Filter) => tab.setState(f) } });
        return () => void unmount(app);
      },
    });
    ctx.commands.on('long-matters.open', () => long.openList());
  },
});
