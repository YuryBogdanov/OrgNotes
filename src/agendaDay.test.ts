import { describe, expect, it } from 'vitest';
import { DEFAULT_SEQUENCE, fromSequences, parseHeadings } from './org';
import type { CalFile } from './calIndex';
import { dayOf, horizonDate, horizonOf, weekCounts, weekOf } from './agendaDay';

const WF = fromSequences([DEFAULT_SEQUENCE], 0, 'project');
const file = (name: string, text: string): CalFile => ({ name, path: '/n/' + name, text, headings: parseHeadings(text, WF), wf: WF });
const W = file('work.org', `* TODO Роадмап Q4
DEADLINE: <2026-10-16 Пт>
* NEXT План переезда
SCHEDULED: <2026-10-16 Пт>
* TODO Синк платформы
SCHEDULED: <2026-10-16 Пт 09:30>
* 1-1 с Борисом <2026-10-16 Пт 12:00-12:45>
* DONE Апдейт
CLOSED: [2026-10-16 Пт 10:00] SCHEDULED: <2026-10-16 Пт>
* TODO План найма
SCHEDULED: <2026-10-19 Пн>
* TODO Миграция индекса
DEADLINE: <2026-10-21 Ср>
* TODO Итоги квартала
SCHEDULED: <2026-11-02 Пн>
* TODO Далеко
SCHEDULED: <2026-12-20 Вс>
`);
const DAY = new Date(2026, 9, 16);

describe('«Агенда» → «День» (ТЗ 45 §3.2)', () => {
  it('the day: the timed ones as chips (the past, the one on now), the planned and due without a time, done struck', () => {
    const d = dayOf([W], DAY, new Date(2026, 9, 16, 12, 10));
    expect(d.timed.map((t) => [t.time, t.title, t.past, t.now])).toEqual([['09:30', 'Синк платформы', true, false], ['12:00', '1-1 с Борисом', false, true]]);
    expect(d.planned.map((r) => [r.title, r.chip, r.done])).toEqual([['Роадмап Q4', 'срок сегодня', false], ['План переезда', null, false], ['Апдейт', null, true]]);
    expect(d.isToday).toBe(true);
  });
  it('«Горизонт»: the 30 days after the day, by date, a deadline marked; the dates as the mockup writes them', () => {
    const h = horizonOf([W], DAY);
    expect(h.map((x) => horizonDate(x, DAY))).toEqual(['ПН 19', 'СР 21 · СРОК', 'ПН 2 НОЯБ']);
    expect(h[1].items.map((i) => i.title)).toEqual(['Миграция индекса']);
  });
  it('the week strip: Monday to Sunday, the entries of each day', () => {
    const wk = weekOf(DAY);
    expect(wk.map((d) => d.getDate())).toEqual([12, 13, 14, 15, 16, 17, 18]);
    expect(weekCounts([W], wk)).toEqual([0, 0, 0, 0, 4, 0, 0]);
  });
});
