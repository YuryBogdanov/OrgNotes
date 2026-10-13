import { describe, expect, it } from 'vitest';
import { DEFAULT_SEQUENCE, fromSequences, parseHeadings, type Heading } from '../../org'; // the test may use the core (the boundary is for the plugin's code)
import { Tx as CoreTx } from '../../journal';
import type { HeadingInfo, HeadingRef, Tx } from '@panopticon/api';
import { GOALS_WORKFLOW, finalMark, lastMarks, quarterLabel, readSource } from './goals';
import { addGoal, addMark, carryOver, ensureQuarter, moveGoal, withMark } from './ops';

// ТЗ 30: the goals' edits as operations of the core's transaction — the same texts as their pure functions gave.

const WF = fromSequences([DEFAULT_SEQUENCE, GOALS_WORKFLOW as never], 0, 'project');
const hs = (t: string) => parseHeadings(t, WF);
const NOW = new Date(2026, 9, 12); // Пн 12 окт 2026
const RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const P = '/p.org';

/** The plugin's `Tx` over the core's, as the host gives it (paths as they are). */
function run<R>(text: string, fn: (tx: Tx, src: HeadingRef) => R): { text: string; r: R; conflict: boolean } {
  const core = new CoreTx((path) => (path === P ? { path, text, wf: WF } : undefined));
  const info = (h: Heading): HeadingInfo => ({ ref: { path: P, line: h.line, title: h.title }, level: h.level, keyword: h.keyword, done: false, priority: h.priority, title: h.title, tags: h.tags, ...(h.deadline ? { deadline: h.deadline } : {}) });
  const tx = {
    setStatus: (h: HeadingRef, k: string | null) => core.setStatus(h, k),
    setPlanning: (h: HeadingRef, k: 'SCHEDULED' | 'DEADLINE', d: Date | null) => core.setPlanning(h, k, d),
    insertHeading: (at: never, org: string) => core.insertHeading(at, org),
    ensureChild: (u: HeadingRef, t: string, at?: { before?: HeadingRef }) => core.ensureChild(u, t, at),
    heading: (h: HeadingRef) => {
      const x = core.heading(h);
      return x ? info(x) : null;
    },
    children: (h: HeadingRef) => core.children(h).map(info),
    body: (h: HeadingRef) => core.body(h),
    replaceBody: (h: HeadingRef, org: string) => core.replaceBody(h, org),
    move: (h: HeadingRef, to: { under: HeadingRef }) => core.move(h, to),
  } as unknown as Tx;
  const s = hs(text).find((h) => h.level === 1 && h.title === 'Квартальные задачи');
  const r = fn(tx, s ? { path: P, line: s.line, title: s.title } : { path: P, line: 0, title: 'нет' });
  return { text: core.result()[0]?.text ?? text, r, conflict: core.conflict };
}
const goalRef = (text: string, title: string): HeadingRef => {
  const h = hs(text).find((x) => x.title === title)!;
  return { path: P, line: h.line, title: h.title };
};

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
const CI = 'Сократить время сборки CI до 10 минут';

describe('writing a goal', () => {
  const g = { title: 'Наставничество  для  двух мидлов', plan: 'Встречи раз в две недели.\n\n- план развития;\n* звёздочка в начале', result: '- оба с планом', deadline: new Date(2026, 11, 31), status: 'ACTIVE' };
  it('at the end of its quarter, with DEADLINE, :CREATED: and the three fields; a star line is escaped', () => {
    const { text, r } = run(FILE, (tx, src) => addGoal(tx, src, { y: 2026, q: 4 }, g, RU, NOW));
    const lines = text.split('\n');
    expect(lines.slice(r!.line, r!.line + 13)).toEqual([
      '*** ACTIVE Наставничество для двух мидлов', 'DEADLINE: <2026-12-31 Чт>', ':PROPERTIES:', ':CREATED: [2026-10-12 Пн 00:00]', ':END:',
      '**** Что буду делать', 'Встречи раз в две недели.', '', '- план развития;', ',* звёздочка в начале', '**** Ожидаемый результат', '- оба с планом', '**** Отметки',
    ]);
    expect(lines[r!.line - 1]).toBe('    CLOSED: [2026-10-08 Чт 10:00]'); // right after the last goal of Q4
    expect(lines[r!.line + 13]).toBe('** Заметки');
    const back = readSource(text, hs(text), 'Квартальные задачи').quarters[0].goals.at(-1)!;
    expect([back.title, back.plan, back.result, back.marks]).toEqual(['Наставничество для двух мидлов', g.plan.replace(',*', '*'), g.result, []]);
  });
  it('a new quarter in its place: the newest first, an older one after the others', () => {
    const a = run(FILE, (tx, src) => addGoal(tx, src, { y: 2027, q: 1 }, g, RU, NOW));
    const l1 = a.text.split('\n');
    expect([l1[a.r!.line - 2], l1[a.r!.line - 1]]).toEqual(['* Квартальные задачи', '** Квартал Q1 2027']);
    const b = run(FILE, (tx, src) => addGoal(tx, src, { y: 2026, q: 2 }, g, RU, NOW));
    const l2 = b.text.split('\n');
    expect([l2[b.r!.line - 2], l2[b.r!.line - 1]]).toEqual(['*** ACTIVE Старое', '** Квартал Q2 2026']);
  });
  it('«Создать „Квартальные задачи“» adds it at the end, a blank line before it; a goal under it', () => {
    const t = run('* A\n', (tx) => tx.insertHeading({ file: P, position: 'end' }, '* Квартальные задачи')).text;
    expect(t).toBe('* A\n\n* Квартальные задачи\n');
    expect(run(t, (tx, src) => addGoal(tx, src, { y: 2026, q: 4 }, g, RU, NOW)).text.startsWith('* A\n\n* Квартальные задачи\n** Квартал Q4 2026\n*** ACTIVE')).toBe(true);
  });
});

describe('marks, another quarter', () => {
  it('added at the end of «Отметки», with its indent; a past day goes to its place', () => {
    const t = run(FILE, (tx) => addMark(tx, goalRef(FILE, CI), new Date(2026, 9, 12), 'Кэш включили.', RU)).text;
    expect(t).toContain('       - кэш Docker даст ещё 3–4 мин.\n     - [2026-10-12 Пн] Кэш включили.\n*** BACKLOG Наставничество');
    const p = run(FILE, (tx) => addMark(tx, goalRef(FILE, CI), new Date(2026, 8, 20), 'Между.', RU)).text;
    expect(p).toContain('Поставили цель на 1-1.\n     - [2026-09-20 Вс] Между.\n     - [2026-09-22 Вт] Замерили');
  });
  it('no «Отметки» under the goal: made at its end', () => {
    const t = run(FILE, (tx) => addMark(tx, goalRef(FILE, 'Наставничество'), new Date(2026, 9, 12), 'Первая.', RU)).text;
    expect(t).toContain('*** BACKLOG Наставничество\n**** Отметки\n- [2026-10-12 Пн] Первая.\n*** COMPLETED Дизайн-система');
  });
  it('the body of «Отметки»: in the order of dates, a continuation kept with its mark', () => {
    const body = '- [2026-09-18 Пт] Раз.\n- [2026-09-22 Вт] Три.\n  - деталь';
    expect(withMark(body, new Date(2026, 8, 20), ['- [2026-09-20 Вс] Два.'])).toBe('- [2026-09-18 Пт] Раз.\n- [2026-09-20 Вс] Два.\n- [2026-09-22 Вт] Три.\n  - деталь');
    expect(withMark('', new Date(), ['- x'])).toBe('- x');
  });
  it('another quarter: the goal moves under it, the quarter made in its place', () => {
    const { text, conflict } = run(FILE, (tx, src) => moveGoal(tx, src, goalRef(FILE, 'Наставничество'), { y: 2027, q: 1 }));
    expect(conflict).toBe(false);
    expect(text).toContain('* Квартальные задачи\n** Квартал Q1 2027\n*** BACKLOG Наставничество\n** Квартал Q4 2026');
    const r2 = run(FILE, (tx, src) => moveGoal(tx, src, goalRef(FILE, 'Наставничество'), { y: 2026, q: 3 })).text;
    expect(readSource(r2, hs(r2), 'Квартальные задачи').quarters[1].goals.map((g) => g.title)).toEqual(['Старое', 'Наставничество']);
    expect(run(FILE, (tx, src) => ensureQuarter(tx, src, { y: 2026, q: 4 })).r).toEqual({ path: P, line: 4, title: 'Квартал Q4 2026' }); // found, not made
  });
  it('the final mark and the last three', () => {
    const t = run(FILE, (tx) => addMark(tx, goalRef(FILE, CI), new Date(2026, 9, 12), 'Итог: p90 = 9 мин.', RU)).text;
    const ci = readSource(t, hs(t), 'Квартальные задачи').quarters[0].goals[0];
    expect(finalMark(ci)?.text).toBe('Итог: p90 = 9 мин.');
    expect(lastMarks(ci).map((m) => m.text.split('\n')[0])).toEqual(['Замерили: p90 = 23 мин.', 'Поставили цель на 1-1.']);
  });
  it('carry-over: under the next quarter, a deadline of the old one becomes the end of the new, a mark', () => {
    const { text, r } = run(FILE, (tx, src) => carryOver(tx, src, { y: 2026, q: 4 }, { y: 2027, q: 1 }, [CI, 'Наставничество', 'Нет такой'], RU, NOW));
    expect(r).toEqual([CI, 'Наставничество']);
    const src = readSource(text, hs(text), 'Квартальные задачи');
    expect(src.quarters.map((x) => [quarterLabel(x.q), x.goals.map((g) => g.title)])).toEqual([
      ['Q1 2027', [CI, 'Наставничество']],
      ['Q4 2026', ['Дизайн-система']],
      ['Q3 2026', ['Старое']],
    ]);
    const [ci, mentor] = src.quarters[0].goals;
    expect(ci.deadline).toEqual(new Date(2027, 2, 31));
    expect(text).toContain('    DEADLINE: <2027-03-31 Ср>');
    expect(ci.marks.at(-1)!.text).toBe('Перенесена из Q4 2026');
    expect(mentor.marks.map((m) => m.text)).toEqual(['Перенесена из Q4 2026']);
  });
});
