// Notes for «Разбор Inbox»: an Inbox with tasks of different ages (one deferred, one without :CREATED:), a work file.
const stamp = (daysAgo: number, h = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const p = (n: number) => String(n).padStart(2, '0');
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `[${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${wd} ${p(h)}:00]`;
};
const date = (daysAhead: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}`;
};
export const INBOX = () =>
  [
    '#+TITLE: Inbox',
    '* TODO Купить батарейки для мыши',
    ':PROPERTIES:',
    `:CREATED: ${stamp(0, 9)}`,
    ':END:',
    '',
    '* TODO Подготовить презентацию для CTO :work:',
    'DEADLINE: <' + date(5) + '>',
    ':PROPERTIES:',
    `:CREATED: ${stamp(9)}`,
    ':END:',
    'Показать план найма и бюджет на Q4.',
    '',
    '* TODO Продлить страховку авто',
    ':PROPERTIES:',
    `:CREATED: ${stamp(15)}`,
    ':END:',
    '',
    '* TODO Отложенная задача',
    'SCHEDULED: <' + date(3) + '>',
    ':PROPERTIES:',
    `:CREATED: ${stamp(20)}`,
    ':END:',
    '',
    '* TODO Позвонить в банк про лимиты',
    ':PROPERTIES:',
    `:CREATED: ${stamp(12)}`,
    ':END:',
    'по карте компании',
    '',
    '* TODO Без даты создания',
    '',
  ].join('\n');
export const WORK = '* Финансы\n** Банки и лимиты\n* Q4 2026\n';
export const FILES = (cfg: object = {}) => ({
  '/mock/inbox.org': INBOX(),
  '/mock/Работа/finance.org': WORK,
  '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'inbox.org', ...cfg } }),
});
