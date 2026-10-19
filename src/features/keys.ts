// The shortcuts of the built-in features (roadmap 0.3). The Inbox and its review, the goals of the quarter and the
// calendar became plugins (ТЗ 27–29): their keys are in their manifests. Here: the mini window's (ТЗ 31) and those of
// «Сегодня» (ТЗ 32). The tests of keys import this module as the app does.

import { C, registerGroup, registerKeys, registerScope } from '../keys';

// ---- the mini window: one system-wide key, and the keys of its own window ------------------------------------------
registerGroup({ id: 'mini', title: 'МИНИ-ОКНО', note: 'только в мини-окне' });
registerScope({ id: 'mini', name: 'в мини-окне', over: ['window', 'editor', 'heading'], outside: { scopes: ['window'], word: 'В главном окне' }, rank: 5, alone: true });
registerKeys([
  // ⌃⌥Space of the spec switches the input source on macOS: ⌃⌥⌘M (ТЗ 31, decision 3)
  C('miniShow', 'Показать мини-окно и писать', 'global', 'global', ['⌃⌥⌘M'], { synonyms: ['мини-окно', 'поверх', 'созвон'], after: 'capture' }),
  C('miniBack', 'Вернуть фокус в предыдущую программу', 'mini', 'mini', ['⎋'], { note: 'Когда в мини-окне нечего закрывать' }),
  C('miniPalette', 'Сменить заметку', 'mini', 'mini', ['⌘P']),
  C('miniHide', 'Скрыть мини-окно', 'mini', 'mini', ['⌘W']),
]);

// ---- «Сегодня» (ТЗ 32): the screen of the morning ---------------------------------------------------------------------
registerGroup({ id: 'today', title: 'СЕГОДНЯ' });
registerKeys([
  C('today', 'Открыть «Сегодня»', 'today', 'window', ['⇧⌘H'], { synonyms: ['сегодня', 'утро', 'обзор', 'день'] }),
  C('endDay', 'Завершить день…', 'today', 'window', [], { synonyms: ['вечер', 'журнал', 'итоги', 'на завтра'] }),
]);

// ---- a task chosen in a list (ТЗ 34): the agenda, «Сегодня», the calendar, the navigator's «Задачи» -------------------
registerGroup({ id: 'list', title: 'ЗАДАЧИ В СПИСКАХ', note: 'в агенде, календаре, «Сегодня» и навигаторе' });
registerScope({ id: 'list', name: 'в списке задач', over: ['window', 'editor', 'heading'], outside: { scopes: ['window'], word: 'Вне списка' }, rank: 20, alone: true });
registerKeys([
  C('taskOpen', 'Открыть задачу', 'list', 'list', ['↩']),
  C('taskOpenOther', 'Открыть сбоку', 'list', 'list', ['⌥↩'], { synonyms: ['файл сбоку', 'вторая панель'], note: 'Второй раз — фокус в файл сбоку · в старом интерфейсе — во второй панели' }),
  C('taskStatusNext', 'Следующий статус', 'list', 'list', ['⇧→']),
  C('taskStatusPrev', 'Предыдущий статус', 'list', 'list', ['⇧←']),
  C('taskPrioUp', 'Приоритет выше', 'list', 'list', ['⇧↑']),
  C('taskPrioDown', 'Приоритет ниже', 'list', 'list', ['⇧↓']),
  C('taskDateNext', 'Дата +1 день', 'list', 'list', ['⌥⇧→'], { note: 'Та дата, по которой задача стоит в списке' }),
  C('taskDatePrev', 'Дата −1 день', 'list', 'list', ['⌥⇧←']),
  C('taskSchedule', 'Запланировать…', 'list', 'list', ['⌃C S'], { synonyms: ['scheduled', 'дата'] }),
  C('taskDeadline', 'Дедлайн…', 'list', 'list', ['⌃C D'], { synonyms: ['срок'] }),
  C('taskTags', 'Теги…', 'list', 'list', ['⌃C Q'], { synonyms: ['метки'] }),
  C('taskRefile', 'Перенести в другой файл…', 'list', 'list', [], { emacs: ['⌃C ⌃W'], mac: [], synonyms: ['refile', 'переместить'] }),
  C('taskRefresh', 'Обновить список', 'list', 'list', ['⌘R']),
  C('taskDeselect', 'Снять выделение', 'list', 'list', ['⎋'], { note: 'Сначала закрывает файл сбоку' }),
]);

// ---- the file beside a list (ТЗ 56): its tab, the focus in the list or in the file ------------------------------------
registerScope({ id: 'beside', name: 'с файлом сбоку', over: ['window', 'editor', 'heading', 'list'], outside: { scopes: ['window'], word: 'Без файла сбоку' }, rank: 30 });
registerKeys([
  C('besideFocusList', 'Фокус в список', 'list', 'beside', ['⌃⌘←'], { synonyms: ['файл сбоку'] }),
  C('besideFocusFile', 'Фокус в файл сбоку', 'list', 'beside', ['⌃⌘→'], { synonyms: ['файл сбоку'] }),
  C('besideClose', 'Закрыть файл сбоку', 'list', 'beside', [], { synonyms: ['файл сбоку', 'вторая панель'], note: 'В списке — также ⎋' }),
]);
