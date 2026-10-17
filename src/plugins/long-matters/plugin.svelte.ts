// The plugin «long-matters» (ТЗ 40): the section of the navigator, the tab of the list, the commands — and how it
// follows the notes (a file, a touch, the folder).

import { definePlugin } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import { long, VIEW, type Filter } from './state.svelte';
import { badgeOf } from './long';
import Panel from './Panel.svelte';
import List from './List.svelte';
import Sources from './Sources.svelte';
import Today from './Today.svelte';
import Card from './Card.svelte';
import { review, reviewed, stopWaiting, wait } from './actions';
import { walk } from './walk.svelte';
import type { HeadingRef } from '@panopticon/api';

const FILTERS: Filter[] = ['all', 'due', 'waiting', 'nostatus'];
let stop: (() => void) | null = null;

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

    // the section's number: «Пора проверить», red (API 1.13); none due — how many, as any
    stop = $effect.root(() => {
      $effect(() => {
        const b = badgeOf(long.groups);
        ctx.ui.setBadge('long-matters', b.n, b.alert ? { tone: 'alert' } : {});
      });
    });
    // the card of a file of the sources (ТЗ 44 §5): its matters' groups, the one under the caret and its actions
    const cards = new WeakMap<HTMLElement, { path: string; heading: HeadingRef | null }>();
    const isSource = (path: string) => long.matters.some((m) => m.path === path) || long.settings.sources.some((s) => s.kind === 'file' && s.file === path);
    ctx.ui.fileCard('long-matters.card', {
      match: (path) => !long.progress && isSource(path),
      count: (path) => long.matters.filter((m) => m.path === path).length || null,
      render: (el, c) => {
        const at = cards.get(el);
        if (at) return void Object.assign(at, c);
        const fresh = $state({ path: c.path, heading: c.heading });
        cards.set(el, fresh);
        const app = mount(Card, { target: el, props: { at: fresh } });
        return () => {
          void unmount(app);
          cards.delete(el);
        };
      },
    });
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
    // «Обход» (ТЗ 41 §2): the matters of «Пора проверить», one by one, in their files
    ctx.commands.on('long-matters.walk', () => walk.start());
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
  deactivate() {
    stop?.();
    stop = null;
  },
});
