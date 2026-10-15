// Notes for the tests of «Сегодня» (ТЗ 32): yesterday's day in the journal (a note and the choice for today), the
// Inbox's tasks, today's agenda and the overdue ones — all dated from the day the tests run (it starts at 4:00).

const now = new Date();
export const DAY = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < 4 ? 1 : 0));
/** The time the window lives in (`page.clock.setFixedTime`): noon of that day — a run across midnight or 4:00 does
 *  not change the day under the test. */
export const NOW = new Date(DAY.getFullYear(), DAY.getMonth(), DAY.getDate(), 12, 0);
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const p = (n: number) => String(n).padStart(2, '0');
export const shift = (n: number) => new Date(DAY.getFullYear(), DAY.getMonth(), DAY.getDate() + n);
export const iso = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
export const stamp = (n: number, tail = '') => `${iso(shift(n))} ${WD[shift(n).getDay()]}${tail}`;

export const JOURNAL = () =>
  [
    `* ${DAY.getFullYear()}`,
    `** ${iso(shift(-1)).slice(0, 7)} Месяц`,
    `*** ${stamp(-1)}`,
    '**** На завтра',
    ':PROPERTIES:',
    `:CREATED:  [${stamp(-1, ' 18:42')}]`,
    ':END:',
    '- Дожать Аню по *бюджету* на нагрузочное',
    '- Перед 1-1 с Алексеем глянуть его цели',
    '**** Главное',
    '- [[id:a1][Бюджет на нагрузочное]]',
    '- [[id:a2][Вопросы к ревью биллинга]]',
    '- [[id:zz][Удалённая задача]]',
    '',
  ].join('\n');
export const INBOX = () =>
  [
    '* TODO Бюджет на нагрузочное',
    ':PROPERTIES:',
    ':ID: a1',
    ':END:',
    '* NEXT [#A] Вопросы к ревью биллинга',
    `DEADLINE: <${stamp(0)}>`,
    ':PROPERTIES:',
    ':ID: a2',
    ':END:',
    '* TODO Ответить HR по вакансии SRE',
    '* NEXT [#B] Купить билеты на конференцию',
    '* WAIT Ждём ответа',
    '* DONE Уже сделано',
    '',
  ].join('\n');
export const WORK = () =>
  [
    '* Стендап платформы',
    `<${stamp(0, ' 00:00-00:01')}>`,
    '* Ревью архитектуры',
    `<${stamp(0, ' 23:58-23:59')}>`,
    '* 1-1 Петров Алексей :1on1:',
    `<${stamp(0, ' 23:30-23:45 +2w')}>`,
    '* TODO Написать Ане про бюджет',
    `SCHEDULED: <${stamp(-2)}>`,
    '* TODO Ревью перформанса Олега',
    `DEADLINE: <${stamp(-3)}>`,
    '* DONE Ответил по оферу SRE',
    `CLOSED: [${stamp(0, ' 11:00')}]`,
    '* DONE Ревью RFC логирования',
    `CLOSED: [${stamp(0, ' 12:30')}]`,
    '* TODO Подготовить слайды к QBR',
    `SCHEDULED: <${stamp(0)}>`,
    '* NEXT Еженедельный отчёт',
    `SCHEDULED: <${stamp(-5, ' +1w')}>`,
    '',
  ].join('\n');
export const FILES = () => ({
  '/mock/journal.org': JOURNAL(),
  '/mock/inbox.org': INBOX(),
  '/mock/work.org': WORK(),
});
