// `commands.run` of the core's commands (tech sprint 3.1, from the host).

import { store } from '../store.svelte';
import { openFile, openFromAgenda } from '../layout';
import { viewOf } from '../views';
import type { HeadingRef } from './index';
import { fileOf, findHeading } from './refs';
import { openNote } from '../noteReq.svelte';

/** The core's commands a plugin may run (ТЗ 26: a minimum, grows with our plugins). */
export function coreCommand(cmd: string, arg: unknown) {
  const a = (arg ?? {}) as { path?: string; ref?: HeadingRef };
  switch (cmd) {
    case 'file.open': {
      const i = store.files.findIndex((f) => f.name === a.path);
      if (i < 0) throw new Error(`нет файла «${a.path}»`);
      const o = (arg ?? {}) as { line?: number; beside?: boolean; focus?: boolean; neighbour?: boolean; newTab?: boolean };
      const line = Math.max(0, Number(o.line) || 0);
      if (o.neighbour) {
        // as from an agenda: the other pane (made on the left when there is none), the focus stays here
        const t = openFromAgenda(store.layout, store.layout.active, store.files[i].path, line, '', 'neighbor');
        t.fromAgenda = null;
        return;
      }
      // a tab of its own here (the file's tab when it has one), the one shown stays (1.12)
      if (o.newTab && !o.beside) return void openFile(store.layout, store.layout.active, store.files[i].path, line, { replace: false, focus: o.focus !== false });
      if (!o.beside) return store.open(i, line, o.focus !== false);
      // in the other editor (a new tab when there is one), what is shown here stays in front
      const L = store.layout;
      const here = L.active;
      const keep = L.panes[here].tabs[L.panes[here].active];
      openFile(L, L.panes.length > 1 ? 1 - here : here, store.files[i].path, line, { replace: false, focus: false });
      L.active = here;
      L.panes[here].active = Math.max(0, L.panes[here].tabs.indexOf(keep));
      return;
    }
    case 'heading.reveal': {
      const i = a.ref ? store.files.findIndex((f) => f.name === a.ref!.path) : -1;
      const h = i >= 0 && a.ref ? findHeading(store.files[i].headings, a.ref) : undefined;
      if (!h) throw new Error('заголовок не найден');
      return store.open(i, h.line);
    }
    case 'file.reveal': {
      if (!store.files.some((f) => f.name === a.path)) throw new Error(`нет файла «${a.path}»`);
      return store.revealEntry(String(a.path));
    }
    case 'agenda.open': {
      // `here` (1.14): «‹ К агенде» of the calendar (ТЗ 47 §1.6) — this tab becomes «Агенда» in «День» on `date`
      const o = (arg ?? {}) as { date?: unknown; here?: unknown };
      const date = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : undefined;
      if (o.here) return store.agendaInTab(date);
      return store.showAgendaHere();
    }
    case 'settings.open':
      return store.openSettings(typeof (arg as { section?: unknown })?.section === 'string' ? ((arg as { section: string }).section as never) : undefined);
    case 'capture.open':
      return store.openCapture();
    case 'inbox.pickFile':
      return void (store.pickInbox = Date.now());
    case 'inbox.createFile':
      return store.createInboxFile();
    case 'heading.note': {
      // «Добавить заметку…» (ТЗ 40 §3): the popover at { x, y } of the window (under the plugin's row), else at the top
      const f = a.ref ? fileOf(a.ref.path) : undefined;
      const h = f && a.ref ? findHeading(f.headings, a.ref) : undefined;
      if (!f || !h) throw new Error('заголовок не найден');
      const o = (arg ?? {}) as { x?: unknown; y?: unknown };
      const at = typeof o.x === 'number' && typeof o.y === 'number' ? { x: o.x, y: o.y } : undefined;
      return openNote(f.name, h.line, at);
    }
    case 'heading.archive': {
      // «Архивировать поддерево» (ТЗ 41 §7) for the walk's «В архив»: a note first, in the same step
      const f = a.ref ? fileOf(a.ref.path) : undefined;
      const h = f && a.ref ? findHeading(f.headings, a.ref) : undefined;
      if (!f || !h) throw new Error('заголовок не найден');
      const note = (arg as { note?: unknown })?.note;
      return store.archiveSubtree({ path: f.path, line: h.line }, typeof note === 'string' && note.trim() ? { note } : {}).then((ok) => {
        if (!ok) throw new Error('не удалось перенести в архив');
      });
    }
    case 'heading.status':
    case 'heading.schedule':
    case 'heading.deadline':
    case 'heading.tags':
    case 'heading.priority': {
      // the palette's step for the heading: the caret goes to it in the tab shown (its file must be the tab's)
      const f = a.ref ? fileOf(a.ref.path) : undefined;
      const h = f && a.ref ? findHeading(f.headings, a.ref) : undefined;
      const t = store.tab;
      if (!f || !h || !t) throw new Error('заголовок не найден');
      const shown = t.kind === 'file' ? t.path : viewOf(t.kind)?.fileOf?.(t);
      if (shown !== f.path) throw new Error('файл заголовка не показан во вкладке');
      store.setTabCursor(t, h.line, 0);
      return store.openPalette(cmd.slice('heading.'.length) as 'status');
    }
  }
  throw new Error(`нет команды «${cmd}»`);
}
