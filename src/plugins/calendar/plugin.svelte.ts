// The plugin «calendar» (ТЗ 29): the tab of a month or a week (⌘3, and a button in «Открыть в панели»), the
// navigator's «Календарь» (the layers, the files, the tasks without a date), the chosen day in the inspector, moving
// entries by the mouse, «+ Задача» / «+ Событие», «Настройки → Календарь» — on the public API only.

import { definePlugin, type Values } from '@panopticon/api';
import { fromIso, monthTitle, weekNumber } from '@panopticon/api/org';
import { mount, unmount } from 'svelte';
import { cal, type CalState } from './state.svelte';
import View from './View.svelte';
import Day from './Day.svelte';
import Panel from './Panel.svelte';
import NewSheet from './NewSheet.svelte';

const crumb = (c: CalState) => (c.view === 'week' ? `Неделя ${weekNumber(fromIso(c.date))}` : monthTitle(fromIso(c.date)));
const valid = (d: unknown): d is CalState => !!d && typeof d === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String((d as CalState).date));

export default definePlugin({
  async activate(ctx) {
    cal.ctx = ctx;
    cal.readCfg();
    await cal.load();

    // the notes: read again when they change
    ctx.events.on('file.changed', (p) => void cal.refresh((p as { path: string }).path));
    ctx.events.on('folder.changed', () => {
      cal.readCfg();
      void cal.load();
    });
    ctx.events.on('inbox.changed', () => void cal.load());
    ctx.settings.onChange(() => cal.readCfg());
    ctx.storage.folder.onChange(() => cal.readCfg());

    // the tab, its inspector; the navigator's section
    ctx.ui.view<CalState>('calendar.view', {
      title: () => 'Календарь',
      crumbs: (s) => ['Календарь', crumb(s)],
      restore: (raw) => (valid(raw) ? { view: raw.view === 'week' ? 'week' : 'month', date: raw.date } : cal.fresh()),
      render: (el, state, tab) => {
        const app = mount(View, { target: el, props: { initial: state, setState: (s: CalState) => tab.setState(s) } });
        return () => void unmount(app);
      },
      inspector: (el, state) => {
        const app = mount(Day, { target: el, props: { shown: valid(state) ? state : cal.fresh() } });
        return () => void unmount(app);
      },
    });
    ctx.ui.navSection('calendar', (el) => {
      const app = mount(Panel, { target: el });
      return () => void unmount(app);
    });
    ctx.commands.on('calendar.open', () => cal.showHere());

    // «+ Задача» / «+ Событие»: a sheet of its own
    cal.openNew = (kind, date) => {
      void ctx.ui.sheet({
        title: kind === 'task' ? 'Новая задача' : 'Новое событие',
        bare: true,
        render: (el, sheet) => {
          const app = mount(NewSheet, { target: el, props: { kind, date, onclose: () => sheet.close() } });
          return () => void unmount(app);
        },
      });
    };

    // «Настройки → Календарь»: what depends on the notes
    const fileShown = (rel: string | null) => {
      const ib = cal.inbox.path;
      if (!rel) return ib ? `Inbox — ${ib.split('/').join(' / ')}` : 'Inbox (файл не выбран)';
      return rel.split('/').join(' / ') + (cal.files.some((f) => f.name === rel) ? '' : ' — не найден');
    };
    const openStates = () => [...new Set(cal.files.flatMap((f) => (f.wf.sequences ?? []).flatMap((s) => s.states.filter((x) => !x.done).map((x) => x.name))))];
    const heading = (s: string) => s.replace(/^\*+\s*/, '').trim();
    const headHint = (k: 'taskHeading' | 'eventHeading') => (v: Values) =>
      v[k] ? 'Запись добавляется в конец этого заголовка; если его нет, он будет создан' : 'Без заголовка — в начало или конец файла, как в Inbox';
    const hours = (from: number, n: number, off: (h: number) => boolean) => Array.from({ length: n }, (_, i) => from + i).map((h) => ({ value: h, label: `${h}:00`, disabled: off(h) }));
    for (const k of ['taskFile', 'eventFile']) ctx.settings.dynamic(k, { show: fileShown });
    for (const k of ['taskHeading', 'eventHeading'] as const) ctx.settings.dynamic(k, { clean: heading, hint: headHint(k) });
    ctx.settings.dynamic('taskStatus', { options: () => [{ value: null, label: 'Начальный статус набора' }, ...openStates().map((s) => ({ value: s, label: s }))] });
    ctx.settings.dynamic('eventStatus', {
      options: (v) => {
        const all = openStates();
        const cur = v.eventStatus as string;
        return [{ value: '', label: 'Без статуса' }, ...(cur && !all.includes(cur) ? [cur, ...all] : all).map((s) => ({ value: s, label: s }))];
      },
    });
    ctx.settings.dynamic('from', { options: (v) => [hours(0, 13, (h) => h >= (v.to as number)), hours(12, 13, (h) => h <= (v.from as number))] });
    ctx.settings.dynamic('keepDeadline', { hint: (v) => (v.keepDeadline ? 'Меняется только дата SCHEDULED' : 'DEADLINE сдвигается на столько же дней') });
  },
});
