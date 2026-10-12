// The plugin's code: one ES module, everything bundled in (vite.config.js). It sees the app only through `ctx`.
import { definePlugin, type Ctx } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import Panel from './Panel.svelte';

/** The open tasks: the agenda's engine. */
export const openTasks = (ctx: Ctx) => ctx.index!.query({ conds: [{ field: 'done', op: 'no' }] });

export default definePlugin({
  activate(ctx) {
    // a command of the manifest: its handler
    ctx.commands.on('example.count', async () => {
      ctx.ui.notify(`Открытых задач: ${(await openTasks(ctx)).length}`);
    });
    // the section of the navigator: a Svelte component in the element the app gives
    ctx.ui.navSection('example', (el) => {
      const app = mount(Panel, { target: el, props: { ctx } });
      return () => void unmount(app);
    });
  },
});
