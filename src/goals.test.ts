import { describe, expect, it } from 'vitest';
import { DEFAULT_SEQUENCE, fromSequences, parseHeadings } from './org';
import {
  GOALS_WORKFLOW, addSourceHeading, avatarColor, defaultQuarter, goalNote, initials, insertGoal, isSilent, parseQuarter, quarterSub,
  readGoals, readSource, resultLine, shiftQuarter, sourceSummary, withGoals, deadlineSoon, reviewQueue, markLines, markDayLabel, dayLabel, addMark, moveGoal,
  readGoalSettings, withGoalSettings, reportText, finalMark, lastMarks, carryOver, quarterLabel,
} from './goals';

const WF = fromSequences([DEFAULT_SEQUENCE, GOALS_WORKFLOW as never], 0, 'project');
const hs = (t: string) => parseHeadings(t, WF);
const NOW = new Date(2026, 9, 12); // Пн 12 окт 2026
const RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const FILE = `#+TITLE: Петров Алексей
* 1-1
** Встреча
* Квартальные задачи
** Квартал Q4 2026
*** ACTIVE Сократить время сборки CI до 10 минут
    DEADLINE: <2026-11-30 Пн>
    :PROPERTIES:
    :CREATED:  [2026-09-18 Пт 11:20]
    :END:
**** Что буду делать
     Сейчас сборка main занимает 23 минуты.

     План:
     - разбить e2e на 4 потока;
     - включить кэш.
**** Ожидаемый результат
     - p90 сборки main ≤ 10 минут;
     - медиана сборки PR ≤ 6 минут.
**** Отметки
     - [2026-09-18 Пт] Поставили цель на 1-1.
     - [2026-09-22 Вт] Замерили: p90 = 23 мин.
       - главный кандидат — e2e в 4 потока;
       - кэш Docker даст ещё 3–4 мин.
*** BACKLOG Наставничество
*** COMPLETED Дизайн-система
    CLOSED: [2026-10-08 Чт 10:00]
** Заметки
** Квартал Q3 2026
*** ACTIVE Старое
`;

describe('sources in config.json', () => {
  it('reads what it can, one «мои» at most, no doubles; writes back keeping other keys', () => {
    expect(readGoals([{ file: 'a.org', heading: 'Цели', title: 'А', me: true }, { file: 'b.org', heading: 'Цели', me: true }, { file: 'a.org', heading: 'Цели' }, { heading: 'x' }])).toEqual([
      { file: 'a.org', heading: 'Цели', title: 'А', me: true },
      { file: 'b.org', heading: 'Цели', title: 'b' },
    ]);
    const out = JSON.parse(withGoals('{"version":1,"inbox":{"file":"i.org"}}', [{ file: 'a.org', heading: 'Цели', title: 'А' }]));
    expect(out).toEqual({ version: 1, inbox: { file: 'i.org' }, goals: [{ file: 'a.org', heading: 'Цели', title: 'А' }] });
    expect(JSON.parse(withGoals(JSON.stringify(out), []))).toEqual({ version: 1, inbox: { file: 'i.org' } });
  });
  it('initials as on the mockups, a colour per file', () => {
    expect(initials('Петров Алексей')).toBe('АП');
    expect(initials('Козлов Сергей')).toBe('СК');
    expect(initials('kozlov')).toBe('K');
    expect(initials('Мои цели', true)).toBe('Я');
    expect(avatarColor('Работа/petrov.org')).toBe(avatarColor('Работа/petrov.org'));
    expect(avatarColor('a.org')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('quarters', () => {
  it('«Квартал Q4 2026» in any case; around the year; the current one or, in its last two weeks, the next', () => {
    expect(parseQuarter('квартал q4 2026')).toEqual({ y: 2026, q: 4 });
    expect(parseQuarter('Квартал Q5 2026')).toBeNull();
    expect(parseQuarter('Заметки')).toBeNull();
    expect(shiftQuarter({ y: 2026, q: 4 }, 1)).toEqual({ y: 2027, q: 1 });
    expect(shiftQuarter({ y: 2026, q: 1 }, -1)).toEqual({ y: 2025, q: 4 });
    expect(defaultQuarter(NOW)).toEqual({ y: 2026, q: 4 });
    expect(defaultQuarter(new Date(2026, 11, 20))).toEqual({ y: 2027, q: 1 });
    expect(quarterSub({ y: 2026, q: 4 }, NOW)).toBe('4 квартал 2026 · 1 окт – 31 дек · осталось 80 дней');
  });
});

describe('reading a source', () => {
  it('quarters newest first, goals with their fields, marks with their continuation', () => {
    const s = readSource(FILE, hs(FILE), 'квартальные задачи');
    expect(s.head).toBe(2);
    expect(s.quarters.map((q) => q.q)).toEqual([{ y: 2026, q: 4 }, { y: 2026, q: 3 }]); // «Заметки» left out
    const [ci, mentor, design] = s.quarters[0].goals;
    expect(ci.title).toBe('Сократить время сборки CI до 10 минут');
    expect(ci.keyword).toBe('ACTIVE');
    expect(ci.deadline).toEqual(new Date(2026, 10, 30));
    expect(ci.created).toEqual(new Date(2026, 8, 18));
    expect(ci.plan).toBe('Сейчас сборка main занимает 23 минуты.\n\nПлан:\n- разбить e2e на 4 потока;\n- включить кэш.');
    expect(ci.result).toBe('- p90 сборки main ≤ 10 минут;\n- медиана сборки PR ≤ 6 минут.');
    expect(ci.marks.map((m) => [m.date, m.text])).toEqual([
      [new Date(2026, 8, 18), 'Поставили цель на 1-1.'],
      [new Date(2026, 8, 22), 'Замерили: p90 = 23 мин.\n- главный кандидат — e2e в 4 потока;\n- кэш Docker даст ещё 3–4 мин.'],
    ]);
    expect(resultLine(ci)).toBe('p90 сборки main ≤ 10 минут; медиана сборки PR ≤ 6 минут.');
    expect(mentor.plan).toBe('');
    expect(design.closed).toEqual(new Date(2026, 9, 8));
  });
  it('a heading gone: not found', () => {
    expect(readSource(FILE, hs(FILE), 'Цели').head).toBe(-1);
  });
  it('a heading that looks like a source says what is under it', () => {
    const h = hs(FILE);
    expect(sourceSummary(FILE, h, 2)).toBe('2 квартала · 4 цели');
    expect(sourceSummary(FILE, h, 0)).toBe('');
  });
});

describe('how a goal stands', () => {
  const s = readSource(FILE, hs(FILE), 'Квартальные задачи');
  const [ci, mentor, design] = s.quarters[0].goals;
  it('«молчит»: active, no mark for more than 14 days', () => {
    expect(isSilent(ci, NOW)).toBe(true); // 20 days since 22 sep
    expect(goalNote(ci, ['COMPLETED'], NOW)).toBe('20 дней без отметок');
    expect(isSilent(ci, new Date(2026, 9, 5))).toBe(false);
    expect(goalNote(ci, ['COMPLETED'], new Date(2026, 9, 5))).toBe('отметка 13 дней назад');
    expect(isSilent(mentor, NOW)).toBe(false); // a backlog goal does not
    expect(goalNote(mentor, ['COMPLETED'], NOW)).toBe('нет отметок');
    expect(goalNote(design, ['COMPLETED'], NOW)).toBe('закрыта 8 окт');
  });
  it('a deadline closer than 6 weeks is lit, not for a closed goal', () => {
    expect(deadlineSoon(ci, ['COMPLETED'], NOW)).toBe(false); // 49 days
    expect(deadlineSoon(ci, ['COMPLETED'], new Date(2026, 9, 25))).toBe(true); // 36 days
    expect(deadlineSoon(ci, ['COMPLETED'], new Date(2026, 8, 1))).toBe(false);
  });
});

describe('writing a goal', () => {
  const g = { title: 'Наставничество  для  двух мидлов', plan: 'Встречи раз в две недели.\n\n- план развития;\n* звёздочка в начале', result: '- оба с планом', deadline: new Date(2026, 11, 31), status: 'ACTIVE' };
  it('at the end of its quarter, with DEADLINE, :CREATED: and the three fields; a star line is escaped', () => {
    const r = insertGoal(FILE, hs(FILE), 'Квартальные задачи', { y: 2026, q: 4 }, g, RU, NOW)!;
    const lines = r.text.split('\n');
    expect(lines[r.line]).toBe('*** ACTIVE Наставничество для двух мидлов');
    expect(lines.slice(r.line, r.line + 13)).toEqual([
      '*** ACTIVE Наставничество для двух мидлов',
      'DEADLINE: <2026-12-31 Чт>',
      ':PROPERTIES:',
      ':CREATED: [2026-10-12 Пн 00:00]',
      ':END:',
      '**** Что буду делать',
      'Встречи раз в две недели.',
      '',
      '- план развития;',
      ',* звёздочка в начале',
      '**** Ожидаемый результат',
      '- оба с планом',
      '**** Отметки',
    ]);
    expect(lines[r.line - 1]).toBe('    CLOSED: [2026-10-08 Чт 10:00]'); // right after the last goal of Q4
    expect(lines[r.line + 13]).toBe('** Заметки');
    // read back
    const back = readSource(r.text, hs(r.text), 'Квартальные задачи').quarters[0].goals.at(-1)!;
    expect([back.title, back.plan, back.result, back.marks]).toEqual(['Наставничество для двух мидлов', g.plan.replace(',*', '*'), g.result, []]);
  });
  it('a new quarter in its place: the newest first, an older one after the others', () => {
    const r1 = insertGoal(FILE, hs(FILE), 'Квартальные задачи', { y: 2027, q: 1 }, g, RU, NOW)!;
    const l1 = r1.text.split('\n');
    expect(l1[r1.line - 1]).toBe('** Квартал Q1 2027');
    expect(l1[r1.line - 2]).toBe('* Квартальные задачи');
    const r2 = insertGoal(FILE, hs(FILE), 'Квартальные задачи', { y: 2026, q: 2 }, g, RU, NOW)!;
    const l2 = r2.text.split('\n');
    expect(l2[r2.line - 1]).toBe('** Квартал Q2 2026');
    expect(l2[r2.line - 2]).toBe('*** ACTIVE Старое');
  });
  it('no source heading: nothing; «Создать „Квартальные задачи“» adds it at the end', () => {
    expect(insertGoal('* A\n', hs('* A\n'), 'Квартальные задачи', { y: 2026, q: 4 }, g, RU, NOW)).toBeNull();
    const t = addSourceHeading('* A\n');
    expect(t).toBe('* A\n\n* Квартальные задачи\n');
    const r = insertGoal(t, hs(t), 'Квартальные задачи', { y: 2026, q: 4 }, g, RU, NOW)!;
    expect(r.text.startsWith('* A\n\n* Квартальные задачи\n** Квартал Q4 2026\n*** ACTIVE')).toBe(true);
  });
});

describe('the review: queue, marks, another quarter', () => {
  const s = readSource(FILE, hs(FILE), 'Квартальные задачи');
  it('open goals only, the silent first, then by deadline', () => {
    const q = reviewQueue(s.quarters[0].goals, ['COMPLETED'], NOW);
    expect(q.map((g) => g.title)).toEqual(['Сократить время сборки CI до 10 минут', 'Наставничество']);
  });
  it('a mark: the date as the file writes it, the other lines under it, «- » lines nested', () => {
    expect(markLines(new Date(2026, 9, 12), 'Кэш включили, p90 = 17 мин.\n- e2e делим на 4 потока;\n- раннеры до пятницы.', RU)).toEqual([
      '- [2026-10-12 Пн] Кэш включили, p90 = 17 мин.',
      '  - e2e делим на 4 потока;',
      '  - раннеры до пятницы.',
    ]);
    expect(markDayLabel(new Date(2026, 9, 12), NOW)).toBe('Сегодня, Пн 12 окт');
    expect(dayLabel(new Date(2026, 8, 22))).toBe('Вт, 22 сен');
  });
  it('added at the end of «Отметки», with its indent; a past day goes to its place', () => {
    const t = addMark(FILE, hs(FILE), 'Квартальные задачи', { y: 2026, q: 4 }, 'Сократить время сборки CI до 10 минут', new Date(2026, 9, 12), 'Кэш включили.', RU)!;
    expect(t).toContain('       - кэш Docker даст ещё 3–4 мин.\n     - [2026-10-12 Пн] Кэш включили.\n*** BACKLOG Наставничество');
    const p = addMark(FILE, hs(FILE), 'Квартальные задачи', { y: 2026, q: 4 }, 'Сократить время сборки CI до 10 минут', new Date(2026, 8, 20), 'Между.', RU)!;
    expect(p).toContain('Поставили цель на 1-1.\n     - [2026-09-20 Вс] Между.\n     - [2026-09-22 Вт] Замерили');
    const back = readSource(p, hs(p), 'Квартальные задачи').quarters[0].goals[0].marks.map((m) => m.text.split('\n')[0]);
    expect(back).toEqual(['Поставили цель на 1-1.', 'Между.', 'Замерили: p90 = 23 мин.']);
  });
  it('no «Отметки» under the goal: made at its end', () => {
    const t = addMark(FILE, hs(FILE), 'Квартальные задачи', { y: 2026, q: 4 }, 'Наставничество', new Date(2026, 9, 12), 'Первая.', RU)!;
    expect(t).toContain('*** BACKLOG Наставничество\n**** Отметки\n- [2026-10-12 Пн] Первая.\n*** COMPLETED Дизайн-система');
    expect(addMark(FILE, hs(FILE), 'Квартальные задачи', { y: 2026, q: 4 }, 'Нет такой', new Date(), 'x', RU)).toBeNull();
  });
  it('another quarter: the goal moves under it, the quarter made in its place', () => {
    const r = moveGoal(FILE, hs(FILE), 'Квартальные задачи', { y: 2026, q: 4 }, 'Наставничество', { y: 2027, q: 1 }, hs)!;
    const lines = r.text.split('\n');
    expect(lines[r.line]).toBe('*** BACKLOG Наставничество');
    expect(lines[r.line - 1]).toBe('** Квартал Q1 2027');
    const src = readSource(r.text, hs(r.text), 'Квартальные задачи');
    expect(src.quarters.map((x) => [x.q.q, x.goals.map((g) => g.title)])).toEqual([
      [1, ['Наставничество']],
      [4, ['Сократить время сборки CI до 10 минут', 'Дизайн-система']],
      [3, ['Старое']],
    ]);
    const r2 = moveGoal(FILE, hs(FILE), 'Квартальные задачи', { y: 2026, q: 4 }, 'Наставничество', { y: 2026, q: 3 }, hs)!;
    expect(readSource(r2.text, hs(r2.text), 'Квартальные задачи').quarters[1].goals.map((g) => g.title)).toEqual(['Старое', 'Наставничество']);
  });
});

describe('part 3: settings, report, carry-over', () => {
  it('settings: the lists of values, defaults left out of the file', () => {
    expect(readGoalSettings({ silent: 21, soon: 4 })).toEqual({ silent: 21, soon: 4 });
    expect(readGoalSettings({ silent: 10 })).toEqual({ silent: 14, soon: 6 });
    expect(JSON.parse(withGoalSettings('{"version":1}', { silent: 21, soon: 6 }))).toEqual({ version: 1, goalSettings: { silent: 21 } });
    expect(JSON.parse(withGoalSettings('{"version":1,"goalSettings":{"silent":21}}', { silent: 14, soon: 6 }))).toEqual({ version: 1 });
  });
  it('the threshold of «молчит» is a setting', () => {
    const ci = readSource(FILE, hs(FILE), 'Квартальные задачи').quarters[0].goals[0];
    expect(isSilent(ci, NOW, 21)).toBe(false);
    expect(goalNote(ci, [], NOW, 21)).toBe('отметка 20 дней назад');
  });
  it('the report: «Название / Что делал / Результат / Срок / Статус», as text and Markdown', () => {
    const s = readSource(FILE, hs(FILE), 'Квартальные задачи');
    const people = [{ name: 'Петров Алексей', goals: s.quarters[0].goals.slice(0, 1), done: ['COMPLETED'] }, { name: 'Никто', goals: [], done: [] }];
    expect(reportText(people, { y: 2026, q: 4 }, 'text')).toBe(
      'Цели Q4 2026\n\nПЕТРОВ АЛЕКСЕЙ\n\n1. Сократить время сборки CI до 10 минут\n' +
        'Что делал: Сейчас сборка main занимает 23 минуты.\n\nПлан:\n- разбить e2e на 4 потока;\n- включить кэш.\n18 сен: Поставили цель на 1-1.\n22 сен: Замерили: p90 = 23 мин.\n- главный кандидат — e2e в 4 потока;\n- кэш Docker даст ещё 3–4 мин.\n' +
        'Результат: - p90 сборки main ≤ 10 минут;\n- медиана сборки PR ≤ 6 минут.\nСрок: 30 ноября 2026\nСтатус: В работе\n',
    );
    const md = reportText(people, { y: 2026, q: 4 }, 'md');
    expect(md.startsWith('# Цели Q4 2026\n\n## Петров Алексей\n\n### Сократить время сборки CI до 10 минут\n**Что делал:** \nСейчас')).toBe(true);
    expect(md).toContain('**Срок:** 30 ноября 2026\n**Статус:** В работе');
  });
  it('the final mark and the last three', () => {
    const t = addMark(FILE, hs(FILE), 'Квартальные задачи', { y: 2026, q: 4 }, 'Сократить время сборки CI до 10 минут', new Date(2026, 9, 12), 'Итог: p90 = 9 мин.', RU)!;
    const ci = readSource(t, hs(t), 'Квартальные задачи').quarters[0].goals[0];
    expect(finalMark(ci)?.text).toBe('Итог: p90 = 9 мин.');
    expect(lastMarks(ci).map((m) => m.text.split('\n')[0])).toEqual(['Замерили: p90 = 23 мин.', 'Поставили цель на 1-1.']);
  });
  it('carry-over: under the next quarter, a deadline of the old one becomes the end of the new, a mark', () => {
    const r = carryOver(FILE, 'Квартальные задачи', { y: 2026, q: 4 }, { y: 2027, q: 1 }, ['Сократить время сборки CI до 10 минут', 'Наставничество', 'Нет такой'], RU, hs, NOW);
    expect(r.moved).toEqual(['Сократить время сборки CI до 10 минут', 'Наставничество']);
    const src = readSource(r.text, hs(r.text), 'Квартальные задачи');
    expect(src.quarters.map((x) => [quarterLabel(x.q), x.goals.map((g) => g.title)])).toEqual([
      ['Q1 2027', ['Сократить время сборки CI до 10 минут', 'Наставничество']],
      ['Q4 2026', ['Дизайн-система']],
      ['Q3 2026', ['Старое']],
    ]);
    const [ci, mentor] = src.quarters[0].goals;
    expect(ci.deadline).toEqual(new Date(2027, 2, 31));
    expect(r.text).toContain('    DEADLINE: <2027-03-31 Ср>');
    expect(ci.marks.at(-1)!.text).toBe('Перенесена из Q4 2026');
    expect(mentor.marks.map((m) => m.text)).toEqual(['Перенесена из Q4 2026']);
  });
});
