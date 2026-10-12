// Notes for the Inbox tests: an inbox.org with unsorted tasks, and a work file to move them into.
/** The time the stamps are counted from: the last 14:00 that has passed (never in the future, so a task added now is
 *  the newest), so «5 мин» and «вчера» hold at any hour, midnight too (the test of the relative times gives the page
 *  the same clock). */
export const NOW = (() => {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 14, 0);
  return t > d ? new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 14, 0) : t;
})();
const stamp = (minutesAgo: number) => {
  const d = new Date(+NOW - minutesAgo * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `[${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${wd} ${p(d.getHours())}:${p(d.getMinutes())}]`;
};
export const INBOX = () =>
  [
    '#+TITLE: Inbox',
    '* TODO Позвонить в банк про лимиты',
    ':PROPERTIES:',
    `:CREATED: ${stamp(5)}`,
    ':END:',
    'по карте компании, уточнить комиссию',
    '* TODO Согласовать отпуск с тимлидами',
    ':PROPERTIES:',
    `:CREATED: ${stamp(60 * 26)}`,
    ':END:',
    'до пятницы',
    '* DONE Уже разобрано',
    '* TODO Идея: ежемесячный обзор рисков',
    ':PROPERTIES:',
    `:CREATED: ${stamp(60 * 24 * 4)}`,
    ':END:',
    '* TODO Проверить доступы подрядчика',
    '',
  ].join('\n');
export const WORK = '* Q4 2026\n** TODO Подготовить бюджет 2027\nтекст\n* Найм\n** NEXT План найма\n';
export const FILES = (inbox = true) => ({
  '/mock/inbox.org': INBOX(),
  '/mock/Работа/work.org': WORK,
  '/mock/Работа/journal.org': '* Октябрь\n** Итоги\n',
  ...(inbox ? { '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'inbox.org' } }) } : {}),
});
