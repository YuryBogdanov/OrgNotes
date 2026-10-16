// The plugin «long-matters» (ТЗ 40): the section of the navigator, the tab of the list, the commands — and how it
// follows the notes (a file, a touch, the folder).

import { definePlugin } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import { long, VIEW, type Filter } from './state.svelte';
import Panel from './Panel.svelte';
import List from './List.svelte';
import Sources from './Sources.svelte';
import Today from './Today.svelte';
import { review, reviewed, stopWaiting, wait } from './actions';
import type { HeadingRef } from '@panopticon/api';
import './styles.css';

const FILTERS: Filter[] = ['all', 'due', 'waiting', 'nostatus'];

export default definePlugin({
  async activate(ctx) {
    long.ctx = ctx;
    long.readStored();
    await long.load();

    ctx.settings.onChange(() => {
      long.readStored();
      long.soon();
    });
    // «Настройки → Долгие дела» (§8): the sources drawn here, the statuses of the folder for the waiting one
    ctx.settings.dynamic('sources', {
      render: (el, ctrl) => {
        const app = mount(Sources, { target: el, props: { ctrl } });
        return () => void unmount(app);
      },
    });
    ctx.settings.dynamic('wait', {
      options: (v) => [...new Set([String(v.wait ?? 'WAIT'), ...long.openStates])].map((s) => ({ value: s, label: s })),
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
    // «Сегодня» (§7): what is due, up to three
    ctx.ui.todayBlock('long-matters.today', (el, block) => {
      const app = mount(Today, { target: el, props: { hide: (h: boolean) => block.setHidden(h) } });
      return () => void unmount(app);
    });

    // §9: «Проверить через…», «Ждём…», «Осмотрено» in the palette and the heading's menu, on a long matter only
    const here = () => long.at(ctx.ui.currentHeading());
    const ACTS: { id: string; label: string; ok?: (m: NonNullable<ReturnType<typeof here>>) => boolean; run: (m: NonNullable<ReturnType<typeof here>>) => unknown }[] = [
      { id: 'long-matters.review', label: 'Проверить через…', run: (m) => review(m) },
      { id: 'long-matters.wait', label: 'Ждём…', ok: (m) => !m.waiting, run: (m) => wait(m) },
      { id: 'long-matters.unwait', label: 'Больше не ждём', ok: (m) => !!m.waiting, run: (m) => stopWaiting(m) },
      { id: 'long-matters.seen', label: 'Осмотрено', run: (m) => reviewed(m) },
    ];
    for (const a of ACTS) {
      const ok = (m: ReturnType<typeof here>) => !!m && (a.ok?.(m) ?? true);
      ctx.commands.on(a.id, () => {
        const m = here();
        if (m && ok(m)) void a.run(m);
      });
      ctx.commands.when(a.id, () => ok(here()));
      ctx.ui.headingAction({
        label: a.label,
        when: (h) => ok(long.at(h.ref)),
        run: (r: HeadingRef) => {
          const m = long.at(r);
          if (m) void a.run(m);
        },
      });
    }
  },
});
