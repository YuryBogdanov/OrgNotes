// The plugin «Канбан» (ТЗ 33): a view of an Org file as a board — «Показать как ›» in a file tab's menu, ⌥⌘B there and
// back, «Открыть доску» right of «#+BOARD» in the text; its settings. On the public API only.

import { definePlugin } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import { kanban, VIEW } from './state.svelte';
import { boardOf } from './board';
import Board from './Board.svelte';
import './styles.css';

export default definePlugin({
  async activate(ctx) {
    kanban.ctx = ctx;
    kanban.readSettings();
    ctx.settings.onChange(() => kanban.readSettings());
    ctx.storage.local.onChange(() => kanban.readSettings());
    ctx.events.on('file.changed', (p) => kanban.refresh((p as { path: string }).path));
    ctx.events.on('folder.changed', () => kanban.files.clear());
    ctx.events.on('tab.active', (p) => {
      const a = p as { path: string | null; view: string | null };
      kanban.active = { path: a.path, view: a.view };
    });

    ctx.ui.fileView(VIEW, {
      // a file with «#+BOARD» opened the first time is shown as its board
      defaultFor: (text) => boardOf(text) !== null,
      render: (el, f, view) => {
        const app = mount(Board, { target: el, props: { path: f.path, showText: () => view.showText() } });
        return () => void unmount(app);
      },
    });
    ctx.ui.editorLink({
      label: (text) => (/^#\+BOARD:/i.test(text) ? `Открыть доску${ctx.commands.keyOf('kanban.toggle') ? ' ' + ctx.commands.keyOf('kanban.toggle') : ''}` : null),
      run: () => void ctx.ui.showAs(VIEW),
    });

    // ⌥⌘B: the board and back; «Показать как доску» in the palette
    ctx.commands.on('kanban.toggle', () => void ctx.ui.showAs(kanban.active.view === VIEW ? null : VIEW));
    ctx.commands.on('kanban.show', () => void ctx.ui.showAs(VIEW));
    // the board's keys (only on it: the scope «view»)
    const here = () => (kanban.active.view === VIEW ? kanban.active.path : null);
    const on = (id: string, fn: (path: string) => void) => ctx.commands.on(id, () => void (here() && fn(here()!)));
    on('kanban.statusPrev', (p) => void kanban.stepStatus(p, -1));
    on('kanban.statusNext', (p) => void kanban.stepStatus(p, 1));
    on('kanban.up', (p) => void kanban.stepPlace(p, -1));
    on('kanban.down', (p) => void kanban.stepPlace(p, 1));
    on('kanban.newCard', (p) => kanban.ask?.({ kind: 'new', path: p }));
    on('kanban.filter', (p) => kanban.ask?.({ kind: 'filter', path: p }));
    // only in a file's tab; «Показать как доску» — when it is the text
    $effect.root(() => {
      $effect(() => {
        ctx.commands.setAvailable('kanban.toggle', !!kanban.active.path);
        ctx.commands.setAvailable('kanban.show', !!kanban.active.path && kanban.active.view !== VIEW);
      });
    });
  },
});
