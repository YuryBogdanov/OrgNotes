// The plugin «inbox» (ТЗ 28): the section «Inbox» — the unsorted tasks of the Inbox file — and «Разбор Inbox» by cards,
// on the public API only. The quick entry and the Inbox file are the core's: the plugin follows them.

import { definePlugin } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import { data } from './state.svelte';
import { inboxBadge } from './list';
import { session } from './session.svelte';
import Panel from './Panel.svelte';
import Card from './Card.svelte';
import type { HeadingRef } from '@panopticon/api';
import './styles.css';

let stop: (() => void) | null = null;

export default definePlugin({
  async activate(ctx) {
    data.ctx = ctx;
    data.readSettings();
    await data.load();

    // the Inbox file, its tasks, the files of the review's tasks: read again when they change
    ctx.events.on('inbox.changed', () => void data.load());
    ctx.events.on('folder.changed', () => void data.load());
    ctx.events.on('file.changed', (p) => {
      const path = (p as { path: string }).path;
      if (path in data.files) void data.refresh(path).then(() => session.synced());
    });
    ctx.settings.onChange(() => data.readSettings());
    // «Выполнено» and «Отменить» of the settings: the done statuses of the Inbox file's sets
    const states = () => data.doneStates.map((s) => ({ value: s, label: s }));
    ctx.settings.dynamic('reviewDone', { options: states });
    ctx.settings.dynamic('reviewCancel', { options: states });

    // the section with the count on its button; «Разобрать Inbox» offered while there is something to go through
    ctx.ui.navSection('inbox', (el) => {
      const app = mount(Panel, { target: el });
      return () => void unmount(app);
    });
    ctx.commands.on('inbox.review', () => session.start());
    // the card of the Inbox file (ТЗ 44 §5): its tasks, the one under the caret and the actions on it
    const cards = new WeakMap<HTMLElement, { path: string; heading: HeadingRef | null }>();
    ctx.ui.fileCard('inbox.card', {
      match: (path) => path === data.path,
      count: (path) => (path === data.path ? data.list.length || null : null),
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
    stop = $effect.root(() => {
      // fix-50: the badge — the entries to sort; red when the oldest has lain too long
      $effect(() => {
        const b = inboxBadge(data.list, data.settings);
        ctx.ui.setBadge('inbox', b.n, b.alert ? { tone: 'alert' } : {});
      });
      $effect(() => ctx.commands.setAvailable('inbox.review', data.pending.length > 0));
    });
  },
  deactivate() {
    stop?.();
    stop = null;
    session.run = null;
  },
});
