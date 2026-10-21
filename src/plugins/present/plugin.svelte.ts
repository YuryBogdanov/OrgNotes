// The plugin «Презентация» (ТЗ 59): an Org file as slides — a view of the file («Показывать как ›», ⌥⌘P there and
// back, by itself for a file with «#+PRESENT:»), its keys; only in the new interface. On the public API only.

import { definePlugin } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import { present, VIEW } from './state.svelte';
import { isDeck } from './model';
import Editor from './Editor.svelte';
import { show } from './show.svelte';
import './styles.css';

export default definePlugin({
  async activate(ctx) {
    if (ctx.ui.look === 'old') return; // the old interface has no presentations (§ Контекст)
    present.ctx = ctx;
    present.readSettings();
    ctx.settings.onChange(() => present.readSettings());
    ctx.events.on('file.changed', (p) => present.refresh((p as { path: string }).path));
    ctx.events.on('folder.changed', () => present.files.clear());
    ctx.events.on('tab.active', (p) => {
      const a = p as { path: string | null; view: string | null };
      present.active = { path: a.path, view: a.view };
    });

    ctx.ui.fileView(VIEW, {
      // a file with «#+PRESENT:» opened the first time is shown as slides
      defaultFor: (text) => isDeck(text),
      render: (el, f) => {
        const app = mount(Editor, { target: el, props: { path: f.path } });
        return () => void unmount(app);
      },
    });

    ctx.commands.on('present.toggle', () => void ctx.ui.showAs(present.active.view === VIEW ? null : VIEW));
    const here = () => (present.active.view === VIEW ? present.active.path : null);
    ctx.commands.on('present.prev', () => void (here() && present.step(here()!, -1)));
    ctx.commands.on('present.next', () => void (here() && present.step(here()!, 1)));
    // the show (§8): from the slide chosen, or from the first
    ctx.commands.on('present.show', () => void (here() && show.start(here()!, present.current.get(here()!) ?? 0)));
    ctx.commands.on('present.showFirst', () => void (here() && show.start(here()!, 0)));
    $effect.root(() => {
      $effect(() => {
        ctx.commands.setAvailable('present.toggle', !!present.active.path);
      });
    });
  },
});
