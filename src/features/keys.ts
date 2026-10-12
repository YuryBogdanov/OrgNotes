// The shortcuts of the built-in features (roadmap 0.3): their commands, groups and scopes, registered with the
// registry of keys.ts. Plain data, so the tests of keys see them too.

import { C, registerGroup, registerKeys, registerScope } from '../keys';

// ---- the Inbox section and its review ------------------------------------------------------------------------
registerScope({ id: 'review', name: 'в разборе Inbox', over: ['window'], outside: { scopes: ['window'], word: 'Вне разбора' }, rank: 10 });
registerKeys([
  C('navInbox', 'Навигатор: Inbox', 'view', 'window', ['⌃⌘2'], { after: 'navFiles' }),
  C('review', 'Разобрать Inbox', 'inbox', 'window', ['⇧⌘R'], { synonyms: ['разбор', 'карточки'], after: 'refile' }),
  C('reviewDone', 'Разбор: Выполнено', 'inbox', 'review', ['⌘1'], { after: 'captureHere' }),
  C('reviewCancel', 'Разбор: Отменить', 'inbox', 'review', ['⌘2'], { after: 'reviewDone' }),
  C('reviewMove', 'Разбор: Перенести…', 'inbox', 'review', ['⌘3'], { after: 'reviewCancel' }),
  C('reviewDefer', 'Разбор: Отложить…', 'inbox', 'review', ['⌘4'], { after: 'reviewMove' }),
  C('reviewSkip', 'Разбор: Пропустить', 'inbox', 'review', ['⌘5'], { after: 'reviewDefer' }),
  C('reviewBack', 'Разбор: Назад', 'inbox', 'review', ['⌘['], { after: 'reviewSkip' }),
  C('reviewCalendar', 'Разбор: Показать / скрыть календарь', 'inbox', 'review', ['⌘K'], { synonyms: ['календарь'], after: 'reviewBack' }),
]);

// the goals of the quarter: the plugin «quarter-goals» (ТЗ 27), its keys in its manifest

// ---- the calendar --------------------------------------------------------------------------------------------
registerKeys([
  C('navCalendar', 'Навигатор: календарь', 'view', 'window', ['⌃⌘5'], { synonyms: ['слои'], after: 'navAgendas' }),
  C('calendar', 'Календарь', 'go', 'window', ['⌘3'], { synonyms: ['месяц', 'неделя'], after: 'agenda' }),
]);
