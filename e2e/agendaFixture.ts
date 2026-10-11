// Notes and statuses for the agenda builder tests: three status sets, as on the design board.
export const CONFIG = {
  version: 1,
  workflows: [
    { name: 'Задачи', states: [{ name: 'TODO', color: 'red' }, { name: 'NEXT', color: 'blue' }, { name: 'WAIT', color: 'orange' }, { name: 'DONE', done: true, color: 'green' }] },
    { name: 'Встречи', states: [{ name: 'MEETING', color: 'blue' }, { name: 'FINISHED', done: true, color: 'green' }, { name: 'CANCELLED', done: true, color: 'gray' }] },
    { name: 'Цели на квартал', states: [{ name: 'BACKLOG', color: 'gray' }, { name: 'ACTIVE', color: 'blue' }, { name: 'COMPLETED', done: true, color: 'green' }] },
  ],
};
const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${wd}`;
};
export const NOTES = () => ({
  '/mock/work.org': [
    '* Q4 2026',
    '** TODO [#A] Подготовить бюджет 2027 :budget:',
    `   DEADLINE: <${day(13)}>`,
    '** NEXT Свести расходы по направлениям',
    `   SCHEDULED: <${day(0)}>`,
    '** WAIT Ответ CTO по архитектуре',
    '** DONE Закрыть квартал',
    '* Тимлиды',
    '** TODO Ревизия целей команд :leads:',
    `   SCHEDULED: <${day(-5)}>`,
    '** TODO Отложенное :later:',
    `   SCHEDULED: <${day(0)}>`,
    '** MEETING Планёрка с тимлидами',
    `   SCHEDULED: <${day(1)}>`,
    '** ACTIVE Нанять двух тимлидов',
  ].join('\n') + '\n',
  '/mock/inbox.org': `* TODO Разобрать входящие\n  SCHEDULED: <${day(0)}>\n`,
  '/mock/Личное/список.org': '* TODO Купить подарки\n',
  '/mock/.orgnotes/config.json': JSON.stringify(CONFIG, null, 2),
});
/** "Мой день" from the design: overdue, for today, waiting, deadlines for 14 days. */
export const MY_DAY = {
  id: 'a-my-day',
  name: 'Мой день',
  sources: ['work.org', 'inbox.org'],
  blocks: [
    { name: 'Просрочено', color: 'red', conds: [{ field: 'status', op: 'in', values: [{ set: 'Задачи', name: 'TODO' }, { set: 'Задачи', name: 'NEXT' }] }, { field: 'scheduled', op: 'eq', date: { kind: 'before' } }], group: 'none', sort: 'prio' },
    { name: 'На сегодня', color: 'blue', conds: [{ field: 'status', op: 'in', values: [{ set: 'Задачи', name: 'TODO' }, { set: 'Задачи', name: 'NEXT' }] }, { field: 'scheduled', op: 'eq', date: { kind: 'today' } }, { field: 'tag', op: 'hasnot', values: ['later'] }], group: 'none', sort: 'prio' },
    { name: 'Жду ответа', color: 'orange', conds: [{ field: 'status', op: 'in', values: [{ set: 'Задачи', name: 'WAIT' }] }], group: 'none', sort: 'age' },
    { name: 'Дедлайны на 14 дней', color: 'green', conds: [{ field: 'deadline', op: 'eq', date: { kind: 'next', n: 14 } }], group: 'none', sort: 'deadline' },
  ],
};
export const withAgenda = (files: Record<string, string>, ...agendas: unknown[]) => ({
  ...files,
  '/mock/.orgnotes/config.json': JSON.stringify({ ...CONFIG, agendas }, null, 2),
});
