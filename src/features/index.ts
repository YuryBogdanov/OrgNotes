// The built-in features (roadmap 0.3): what each adds to the window — kinds of tabs, sections of the navigator and of
// the settings — registered with the shell's registries (views.ts). Their shortcuts are in features/keys.ts. Later
// these become the manifests of the built-in plugins.

import './keys';
import { registerNav, registerSettings, registerSettingsBlock, registerView } from '../views';
import { calendar } from './calendar.svelte';
import { goals, goalsLabel, goalReviewLabel, goalsSchema } from './goals.svelte';
import { inboxReview } from './review.svelte';
import { inbox } from './inbox.svelte';
import { store } from '../store.svelte';
import { fromIso, monthTitle, weekNumber } from '../calIndex';
import { GOAL_ICON } from '../goals';
import CalendarView from '../CalendarView.svelte';
import CalendarDay from '../CalendarDay.svelte';
import CalendarPanel from '../CalendarPanel.svelte';
import { calendarSchema } from './calendarSettings';
import Goals from '../Goals.svelte';
import GoalReview from '../GoalReview.svelte';
import GoalsPanel from '../GoalsPanel.svelte';
import Review from '../Review.svelte';
import InboxPanel from '../InboxPanel.svelte';

const INBOX_ICON = 'M3 11l2-7h10l2 7v5H3zM3 11h4l1 2h4l1-2h4';
const CAL_ICON = 'M5.5 4h9A2.5 2.5 0 0 1 17 6.5v8a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 14.5v-8A2.5 2.5 0 0 1 5.5 4zM3 8h14M7 2.5v3M13 2.5v3M7 12h.01M10 12h.01M13 12h.01';

// ---- Inbox and its review ------------------------------------------------------------------------------------------
registerNav({ id: 'inbox', label: 'Inbox', icon: INBOX_ICON, key: 'navInbox', order: 10, component: InboxPanel, badge: () => (store.inboxCfg.counter ? inbox.list.length : 0) });
registerView({
  kind: 'review', label: () => 'Разбор Inbox', icon: INBOX_ICON, component: Review,
  transient: true, single: true, fileOf: (t) => t.path, onGone: () => (inboxReview.review = null),
});

// ---- the goals of the quarter --------------------------------------------------------------------------------------
registerNav({ id: 'goals', label: 'Цели', icon: GOAL_ICON, key: 'navGoals', order: 40, component: GoalsPanel });
registerView({
  kind: 'goals', label: goalsLabel, icon: GOAL_ICON, component: Goals, crumbs: (t) => ['Цели', goalsLabel(t)],
  restore: (d) => (typeof d === 'string' && d ? d : '*'),
});
registerView({
  kind: 'goalReview', label: goalReviewLabel, icon: GOAL_ICON, component: GoalReview,
  crumbs: (t) => ['Цели', `Разбор · ${goals.goalPeople.find((p) => p.key === t.data)?.name ?? ''}`],
  transient: true, fileOf: (t) => t.path, onGone: () => (goals.goalReview = null),
});

// ---- the calendar --------------------------------------------------------------------------------------------------
const calCrumb = (c: { view: 'month' | 'week'; date: string }) => (c.view === 'week' ? `Неделя ${weekNumber(fromIso(c.date))}` : monthTitle(fromIso(c.date)));
registerNav({ id: 'calendar', label: 'Календарь', icon: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3M7 12h.01M10 12h.01M13 12h.01', key: 'navCalendar', order: 50, component: CalendarPanel });
registerView({
  kind: 'calendar', label: () => 'Календарь', icon: CAL_ICON, component: CalendarView, inspector: CalendarDay,
  crumbs: (t) => ['Календарь', t.data ? calCrumb(t.data) : ''],
  restore: (d: any) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? { view: d.view === 'week' ? 'week' : 'month', date: d.date } : calendar.fresh()),
});
registerSettings({ id: 'Календарь', icon: 'M3 4h14v13H3zM3 8h14M7 2.5v3M13 2.5v3', order: 50, schema: calendarSchema });
registerSettingsBlock({ section: 'Агенды', order: 10, schema: goalsSchema });

// the plugins that are on: what their manifests declare (roadmap 1.1); their code is started by App once drawn
import '../api/host.svelte';
