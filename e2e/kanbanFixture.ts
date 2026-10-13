// A file for the board (ТЗ 33): the statuses of «Разработка» and «Задачи» in the project's config, a file with its
// cards, headings not on it, finished ones of different ages. Dates from the day the tests run.

const p = (n: number) => String(n).padStart(2, '0');
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const now = new Date();
export const day = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
export const stamp = (n: number) => { const d = day(n); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${WD[d.getDay()]}`; };

export const CONFIG = JSON.stringify({
  workflows: [
    { name: 'Разработка', states: [{ name: 'BACKLOG', done: false, color: 'gray' }, { name: 'TODO', done: false, color: 'red' }, { name: 'DOING', done: false, color: 'blue' }, { name: 'REVIEW', done: false, color: 'purple' }, { name: 'DONE', done: true, color: 'green' }, { name: 'CANCELLED', done: true, color: 'gray' }] },
    { name: 'Задачи', states: [{ name: 'TODO', done: false }, { name: 'NEXT', done: false }, { name: 'WAIT', done: false }, { name: 'DONE', done: true }] },
  ],
});
export const PLATFORM = (board = true) =>
  [
    '#+TITLE: Платформа',
    ...(board ? ['#+BOARD: Разработка'] : []),
    '',
    '* BACKLOG [#C] Миграция логов в ClickHouse      :infra:',
    '* BACKLOG Алерты v2: дизайн                     :alerts:',
    '* TODO [#A] Нагрузочное тестирование биллинга   :billing:',
    `DEADLINE: <${stamp(-1)}>`,
    '* TODO Обновить *Kafka* до 3.8                  :infra:',
    '* TODO Дашборд SLA для поддержки                :sla:',
    `SCHEDULED: <${stamp(3)}>`,
    '* DOING [#A] Переезд в новый ДЦ [2/5]           :infra:dc:',
    '** Чек-лист',
    '- [X] Инвентаризация',
    '* REVIEW RFC логирования                        :docs:',
    '- [X] раз',
    '- [X] два',
    '* Заметки по ДЦ',
    '* NEXT Позвонить провайдеру',
    '* DONE Дашборд SLA в проде',
    `CLOSED: [${stamp(-5)} 10:00]`,
    '* DONE Старая задача',
    `CLOSED: [${stamp(-40)} 10:00]`,
    '* CANCELLED Отменённое',
    '',
  ].join('\n');
export const FILES = (board = true) => ({
  '/mock/.orgnotes/config.json': CONFIG,
  '/mock/work/platform.org': PLATFORM(board),
  '/mock/inbox.org': '* TODO x\n',
});
