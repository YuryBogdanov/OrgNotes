// The choice of a workflow (ТЗ 33 §2) in the core's sheet, drawn by the plugin whole: the set chosen, null — cancelled.

import { mount, unmount } from 'svelte';
import { kanban, type BFile } from './state.svelte';
import type { StatusSet } from './board';
import Setup from './Setup.svelte';

export async function openSetup(file: BFile, current: string | null): Promise<StatusSet | null> {
  let chosen: StatusSet | null = null;
  await kanban.ctx.ui.sheet({
    title: 'Показать как доску',
    bare: true,
    render: (el, sheet) => {
      const app = mount(Setup, {
        target: el,
        props: { file, current, onpick: (s: StatusSet) => ((chosen = s), sheet.close('ok')), oncancel: () => sheet.close() },
      });
      return () => void unmount(app);
    },
  });
  return chosen;
}
