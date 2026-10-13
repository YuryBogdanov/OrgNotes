// The shortcuts of the built-in features (roadmap 0.3): their commands, groups and scopes, registered with the
// registry of keys.ts. Plain data, so the tests of keys see them too.

import { C, registerGroup, registerKeys, registerScope } from '../keys';

// the Inbox and its review, the goals of the quarter: the plugins «inbox» (ТЗ 28) and «quarter-goals» (ТЗ 27), their
// keys in their manifests

// ---- the calendar --------------------------------------------------------------------------------------------
registerKeys([
  C('navCalendar', 'Навигатор: календарь', 'view', 'window', ['⌃⌘5'], { synonyms: ['слои'], after: 'navAgendas' }),
  C('calendar', 'Календарь', 'go', 'window', ['⌘3'], { synonyms: ['месяц', 'неделя'], after: 'agenda' }),
]);
