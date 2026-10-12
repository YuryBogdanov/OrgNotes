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

// ---- the goals of the quarter --------------------------------------------------------------------------------
registerGroup({ id: 'goals', title: 'ЦЕЛИ' });
// the review of goals is a tab of its own: its keys win over the window's and the editor's (its card has one)
registerScope({ id: 'goalReview', name: 'в разборе целей', over: ['window', 'editor', 'heading', 'review'], outside: { scopes: ['window', 'editor'], word: 'Вне разбора' }, rank: 20 });
registerKeys([
  C('navGoals', 'Навигатор: цели', 'view', 'window', ['⌃⌘4'], { synonyms: ['цели'], after: 'navAgendas' }),
  C('newGoal', 'Новая цель…', 'goals', 'window', [], { synonyms: ['цель', 'квартал'] }),
  C('goalsOverview', 'Цели: обзор квартала', 'goals', 'window', [], { synonyms: ['цели квартала'] }),
  C('goalMark', 'Разбор целей: Добавить отметку', 'goals', 'goalReview', ['⌘↩']),
  C('goalDone', 'Разбор целей: Цель достигнута', 'goals', 'goalReview', ['⌘1']),
  C('goalShift', 'Разбор целей: Сдвинуть срок…', 'goals', 'goalReview', ['⌘2']),
  C('goalBack', 'Разбор целей: Назад', 'goals', 'goalReview', ['⌘[']),
  C('goalNext', 'Разбор целей: Следующая', 'goals', 'goalReview', ['⌘]']),
]);

// ---- the calendar --------------------------------------------------------------------------------------------
registerKeys([
  C('navCalendar', 'Навигатор: календарь', 'view', 'window', ['⌃⌘5'], { synonyms: ['слои'], after: 'navGoals' }),
  C('calendar', 'Календарь', 'go', 'window', ['⌘3'], { synonyms: ['месяц', 'неделя'], after: 'agenda' }),
]);
