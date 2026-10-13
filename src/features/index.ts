// The built-in features (roadmap 0.3): what each adds to the window — kinds of tabs, sections of the navigator and of
// the settings — registered with the shell's registries (views.ts). Their shortcuts are in features/keys.ts. Later
// these become the manifests of the built-in plugins.

import './keys';
import { registerNav, registerSettings, registerView } from '../views';
import { calendar } from './calendar.svelte';
import { fromIso, monthTitle, weekNumber } from '../calIndex';
import CalendarView from '../CalendarView.svelte';
import CalendarDay from '../CalendarDay.svelte';
import CalendarPanel from '../CalendarPanel.svelte';
import { calendarSchema } from './calendarSettings';
const CAL_ICON = 'M5.5 4h9A2.5 2.5 0 0 1 17 6.5v8a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 14.5v-8A2.5 2.5 0 0 1 5.5 4zM3 8h14M7 2.5v3M13 2.5v3M7 12h.01M10 12h.01M13 12h.01';

// ---- Inbox and its review: the built-in plugin «inbox» (ТЗ 28); the quick entry and the Inbox file stay the core's
import './inboxMigration';

// ---- the goals of the quarter: the built-in plugin «quarter-goals» (ТЗ 27); what the core kept under the old id
// moves to it
import './goalsMigration';

// ---- the calendar --------------------------------------------------------------------------------------------------
const calCrumb = (c: { view: 'month' | 'week'; date: string }) => (c.view === 'week' ? `Неделя ${weekNumber(fromIso(c.date))}` : monthTitle(fromIso(c.date)));
registerNav({ id: 'calendar', label: 'Календарь', icon: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3M7 12h.01M10 12h.01M13 12h.01', key: 'navCalendar', order: 50, component: CalendarPanel });
registerView({
  kind: 'calendar', label: () => 'Календарь', icon: CAL_ICON, component: CalendarView, inspector: CalendarDay,
  crumbs: (t) => ['Календарь', t.data ? calCrumb(t.data) : ''],
  restore: (d: any) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? { view: d.view === 'week' ? 'week' : 'month', date: d.date } : calendar.fresh()),
});
registerSettings({ id: 'Календарь', icon: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3', order: 50, schema: calendarSchema });

// the plugins that are on: what their manifests declare (roadmap 1.1); their code is started by App once drawn
import '../api/host.svelte';
