// The plugin «terminal» (ТЗ 55): the panel under the editor with the sessions, ⌃` to show it, ⌃⇧` a new session; the
// terminals repainted with the theme.

import { definePlugin } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import { terms } from './sessions.svelte';
import Panel from './Panel.svelte';
import Section from './Section.svelte';

let stop: (() => void) | null = null;

export default definePlugin({
  activate(ctx) {
    terms.init(ctx);
    terms.drawer = ctx.ui.drawer('panel', {
      title: 'Терминал',
      render: (el) => {
        const app = mount(Panel, { target: el, props: {} });
        return () => void unmount(app);
      },
    });
    const next = ctx.ui.look === 'next';
    ctx.commands.on('terminal.toggle', () => (next ? terms.toggle() : ctx.ui.notify('Терминал — в новом интерфейсе')));
    ctx.commands.on('terminal.new', () => {
      if (!next) return ctx.ui.notify('Терминал — в новом интерфейсе');
      terms.drawer?.show();
      terms.add();
    });
    ctx.events.on('theme.changed', () => requestAnimationFrame(() => terms.recolor()));
    // the section in the strip (ТЗ 55 §5): the sessions; its badge — the ones that rang unseen
    ctx.ui.navSection('terminal', (el) => {
      const app = mount(Section, { target: el, props: {} });
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
