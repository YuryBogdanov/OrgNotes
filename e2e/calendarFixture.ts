// The calendar (ТЗ 24): October 2026 of the mockups. «Now» is Mon 12 Oct 2026, 14:00.
export const NOW = new Date(2026, 9, 12, 14, 0);
export const WORK = '/mock/work.org';
export const FILES = () => ({
  [WORK]: `* Q4 2026
** TODO [#A] Подготовить бюджет 2027
SCHEDULED: <2026-10-14 Ср> DEADLINE: <2026-10-24 Сб>
** NEXT Свести расходы по направлениям
SCHEDULED: <2026-10-12 Пн>
** TODO Согласовать с финансами
SCHEDULED: <2026-10-16 Пт>
** WAIT Ответ CTO по архитектуре
SCHEDULED: <2026-10-16 Пт>
** DONE Ревизия целей команд
CLOSED: [2026-10-06 Вт 12:00]
** DONE Собрать заявки от тимлидов
CLOSED: [2026-10-08 Чт 18:20]
** TODO План найма на Q4
`,
  '/mock/journal.org': `* Встречи
** Планёрка с тимлидами
<2026-10-12 Пн 10:00-11:00>
** Синк с CTO
<2026-10-14 Ср 11:00>
** 1:1 с тимлидами
<2026-10-02 Пт 15:00 +1w>
`,
  '/mock/finance.org': `* Отчётность
** NEXT Отчёт за Q3
SCHEDULED: <2026-10-16 Пт>
`,
  '/mock/inbox.org': `* TODO Подготовить презентацию для CTO
DEADLINE: <2026-10-16 Пт>
* TODO Продлить пропуск на парковку
SCHEDULED: <2026-10-16 Пт>
`,
});
