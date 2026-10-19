// The plugin «terminal» (ТЗ 55): the panel under the editor with the sessions, ⌃` to show it, ⌃⇧` a new session; the
// terminals repainted with the theme.

import { definePlugin } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import { terms } from './sessions.svelte';
import Panel from './Panel.svelte';

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
  },
  deactivate() {
    terms.dispose();
    terms.drawer = null;
  },
});
