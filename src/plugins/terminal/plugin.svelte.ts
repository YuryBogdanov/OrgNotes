// The plugin «terminal» (ТЗ 55): the panel under the editor with the sessions, ⌃` to show it, ⌃⇧` a new session; the
// terminals repainted with the theme.

import { definePlugin } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import { terms } from './sessions.svelte';
import { profiles } from './profiles.svelte';
import Panel from './Panel.svelte';
import Section from './Section.svelte';

let stop: (() => void) | null = null;

export default definePlugin({
  activate(ctx) {
    terms.init(ctx);
    profiles.init(ctx);
    const next = ctx.ui.look === 'next';
    terms.drawer = ctx.ui.drawer('panel', {
      title: 'Терминал',
      render: (el) => {
        const app = mount(Panel, { target: el, props: {} });
        return () => void unmount(app);
      },
    });
    // the tab «Терминал» (§5): the same sessions, the whole area; not kept after a restart
    ctx.ui.view<Record<string, never>>('terminal', {
      title: () => 'Терминал',
      crumbs: () => {
        const s = terms.active;
        return ['Терминал', s ? `${s.name} · ${(s.launch.cwd ?? '').replace(/^\/Users\/[^/]+/, '~') || 'рабочая папка'}` : 'нет сессий'];
      },
      restore: () => ({}),
      render: (el) => {
        terms.tabShown = true;
        if (!next) terms.where = 'tab';
        if (terms.where === 'tab' && !terms.list.length) queueMicrotask(() => terms.add());
        const app = mount(Panel, { target: el, props: { tab: true, old: !next } });
        return () => {
          terms.tabShown = false;
          void unmount(app);
          // the tab closed: the sessions go back to the panel (they live on)
          if (next && terms.where === 'tab') {
            terms.where = 'panel';
            if (terms.list.length) terms.drawer?.show();
          }
        };
      },
    });
    ctx.commands.on('terminal.toggle', () => terms.toggle());
    ctx.commands.on('terminal.new', () => void terms.add());
    ctx.commands.on('terminal.toTab', () => (next ? terms.toTab() : terms.show()));
    ctx.commands.on('terminal.toPanel', () => terms.toPanel());
    for (let i = 0; i < 5; i++)
      ctx.commands.on(`terminal.profile${i + 1}`, () => {
        const p = profiles.list[i];
        if (p) void terms.byProfile(p);
      });
    ctx.events.on('theme.changed', () => requestAnimationFrame(() => terms.recolor()));
    // the section in the strip (ТЗ 55 §5): the sessions and the profiles; its badge — the ones that rang unseen
    ctx.ui.navSection('terminal', (el) => {
      const app = mount(Section, { target: el, props: { ctx } });
      return () => void unmount(app);
    });
    stop = $effect.root(() => {
      $effect(() => {
        const n = terms.ringing;
        ctx.ui.setBadge('terminal', n, n ? { tone: 'alert' } : {});
      });
      // a session that rang is seen once its panel shows it and the window is in front
      $effect(() => {
        void terms.now;
        for (const s of terms.list) if (s.bell && terms.inSight(s)) s.bell = false;
      });
    });
  },
  deactivate() {
    stop?.();
    stop = null;
    terms.dispose();
    terms.drawer = null;
  },
});
