import { describe, expect, it } from 'vitest';
import { parseHeadings, DEFAULT_WORKFLOW } from './org';
import { entriesIn } from './calIndex';
import {
  agendaRows, dateTitle, dayOf, doneStatus, focusRows, inlineHtml, journalDays, kicker, lastDay, noteLines, overdue, overdueWords, readFolder,
  readLocal, remindDue, shouldShow, taskGroups, whenChosen, type TFile,
} from './today';
import { arrange, withNew } from './todayBlocks';

const file = (name: string, text: string): TFile => ({ name, path: '/n/' + name, text, wf: DEFAULT_WORKFLOW, headings: parseHeadings(text, DEFAULT_WORKFLOW) });
const at = (s: string) => new Date(s);

describe('the day', () => {
  it('starts at 4:00: the small hours are the day before', () => {
    expect(dayOf(at('2026-10-14T01:30')).getDate()).toBe(13);
    expect(dayOf(at('2026-10-14T04:00')).getDate()).toBe(14);
  });
  it('is told by its week and its date; good morning till noon', () => {
    const d = new Date(2026, 9, 14);
    expect(kicker(d)).toBe('СРЕДА · 42 НЕДЕЛЯ');
    expect(dateTitle(d, at('2026-10-14T09:00'))).toBe('Доброе утро. Среда, 14 октября');
    expect(dateTitle(d, at('2026-10-14T13:00'))).toBe('Среда, 14 октября');
    expect(dateTitle(new Date(2026, 9, 13), at('2026-10-14T01:00'))).toBe('Вторник, 13 октября');
  });
  it('the choice was made yesterday, or on Friday', () => {
    expect(whenChosen(new Date(2026, 9, 13), new Date(2026, 9, 14))).toBe('вчера');
    expect(whenChosen(new Date(2026, 9, 9), new Date(2026, 9, 12))).toBe('в пятницу');
  });
});

describe('when it opens by itself', () => {
  const now = at('2026-10-14T09:00');
  it('at the start of the day: once after 4:00', () => {
    expect(shouldShow('day', null, now, true)).toBe(true);
    expect(shouldShow('day', +at('2026-10-14T03:00'), now, false)).toBe(true);
    expect(shouldShow('day', +at('2026-10-14T05:00'), now, false)).toBe(false);
  });
  it('at launch: every launch; by command: never', () => {
    expect(shouldShow('launch', +now, now, true)).toBe(true);
    expect(shouldShow('launch', null, now, false)).toBe(false);
    expect(shouldShow('command', null, now, true)).toBe(false);
  });
});

describe('the reminder', () => {
  const o = { remind: true, remindAt: '17:30' };
  const wed = (t: string) => at('2026-10-14T' + t);
  it('on a working day after its time, once, not when the day is ended', () => {
    expect(remindDue(o, wed('17:29'), null, false)).toBe(false);
    expect(remindDue(o, wed('17:30'), null, false)).toBe(true);
    expect(remindDue(o, wed('19:00'), null, false)).toBe(true); // asleep at 17:30: on waking
    expect(remindDue(o, wed('19:00'), '2026-10-14', false)).toBe(false);
    expect(remindDue(o, wed('19:00'), '2026-10-13', true)).toBe(false);
    expect(remindDue({ ...o, remind: false }, wed('19:00'), null, false)).toBe(false);
    expect(remindDue(o, at('2026-10-17T19:00'), null, false)).toBe(false); // Saturday
  });
});

describe('the settings', () => {
  it('read with defaults; the blocks keep their order, a new one goes last', () => {
    const f = readFolder({ statuses: ['NEXT'], tag: ':1on1:', blocks: [{ id: 'tasks', on: false }, { id: 'note', on: true }] });
    expect(f.statuses).toEqual(['NEXT']);
    expect(f.files).toBeNull();
    expect(f.tag).toBe('1on1');
    expect(f.blocks.slice(0, 3)).toEqual([{ id: 'tasks', on: false }, { id: 'note', on: true }, { id: 'focus', on: true }]);
    expect(f.blocks).toHaveLength(6);
    expect(readLocal({ show: 'nope', remindAt: '7' })).toEqual({ show: 'day', overTabs: true, remind: true, remindAt: '17:30' });
  });
  it('lays the blocks out: wide ones first, an attached one under the one before', () => {
    const spec = (id: string) => ({ id, title: id, wide: id === 'note' || id === 'focus', attach: id === 'oneOnOne' || id === 'goals' });
    const order = ['note', 'focus', 'agenda', 'oneOnOne', 'tasks', 'overdue', 'goals'].map((id) => ({ id, on: id !== 'focus' }));
    const a = arrange(order, spec);
    expect({ top: a.top, cols: a.cols }).toEqual({ top: ['note'], cols: [['agenda', 'oneOnOne'], ['tasks'], ['overdue', 'goals']] });
    expect(a.rows).toEqual([{ kind: 'top', ids: ['note'] }, { kind: 'cols', cols: [['agenda', 'oneOnOne'], ['tasks'], ['overdue', 'goals']] }]);
    expect(arrange(order, (id) => (id === 'overdue' ? undefined : spec(id))).cols).toEqual([['agenda', 'oneOnOne'], ['tasks', 'goals']]);
  });
});

describe('the blocks', () => {
  const inbox = file('inbox.org', '* TODO Ответить HR\n* NEXT [#B] Купить билеты\n* DONE Старое\n* TODO [#A] Срочное\n* WAIT Ждём');
  it('«Задачи»: the statuses, by file, priority first; a missing file says so', () => {
    const g = taskGroups([inbox], ['TODO', 'NEXT'], ['inbox.org', 'nope.org']);
    expect(g[0].rows.map((r) => r.title)).toEqual(['Срочное', 'Купить билеты', 'Ответить HR']);
    expect(g[0].total).toBe(3);
    expect(g[1]).toMatchObject({ file: 'nope.org', missing: true });
    expect(taskGroups([inbox], ['TODO'], ['inbox.org'], 1)[0]).toMatchObject({ total: 2, more: 1 });
  });
  it('«Просрочено»: open tasks with a date before the day, the oldest first', () => {
    const f = file('w.org', [
      '* TODO Написать Ане', 'SCHEDULED: <2026-10-12 Пн>',
      '* TODO Ревью Олега', 'DEADLINE: <2026-10-11 Вс>',
      '* DONE Сделано', 'SCHEDULED: <2026-10-01 Чт>',
      '* TODO Сегодня', 'SCHEDULED: <2026-10-14 Ср>',
      '* NEXT Еженедельное', 'SCHEDULED: <2026-10-07 Ср +1w>',
    ].join('\n'));
    const rows = overdue([f], new Date(2026, 9, 14));
    expect(rows.map((r) => r.title)).toEqual(['Еженедельное', 'Ревью Олега', 'Написать Ане']);
    expect(overdueWords(rows[1])).toBe('дедлайн 11 окт · 3 дня');
    expect(overdueWords(rows[2])).toBe('запланировано на 12 окт · 2 дня');
  });
  it('«Агенда»: the day by time, the whole day last, the past dimmed, a 1-1 marked', () => {
    const f = file('cal.org', [
      '#+TITLE: Петров Алексей',
      '* Стендап', '<2026-10-14 Ср 10:00-10:30>',
      '* 1-1 :1on1:', '<2026-10-14 Ср 15:00-15:45>',
      '* TODO Отчёт', 'DEADLINE: <2026-10-14 Ср 18:00>',
      '* TODO Слайды', 'SCHEDULED: <2026-10-14 Ср>',
      '* DONE Готово', 'CLOSED: [2026-10-14 Ср 09:00]',
    ].join('\n'));
    const day = new Date(2026, 9, 14);
    const rows = agendaRows(entriesIn([f], day, day), [f], day, at('2026-10-14T11:00'), '1on1');
    expect(rows.map((r) => [r.time, r.title, r.past, r.meeting])).toEqual([
      ['10:00–10:30', 'Стендап', true, false],
      ['15:00–15:45', '1-1 Петров Алексей', false, true],
      ['до 18:00', 'Дедлайн: Отчёт', false, false],
      ['весь день', 'Слайды', false, false],
    ]);
  });
});

describe('the journal', () => {
  const j = file('journal.org', [
    '* 2026', '** 2026-10 Октябрь',
    '*** 2026-10-09 Пт', '**** На завтра', ':PROPERTIES:', ':CREATED:  [2026-10-09 Пт 18:42]', ':END:', '- Дожать *Аню* по бюджету', '  - и [[file:x.org][план]]',
    '**** Главное', '- [[id:abc][Бюджет]]', '- [[id:gone][Пропавшая]]',
    '*** 2026-10-12 Пн', '**** Другое', 'текст',
    '*** 2026-10-14 Ср', '**** На завтра', '- сегодняшняя',
  ].join('\n'));
  it('the morning reads the latest day before today with a note (after a weekend, Friday)', () => {
    const d = lastDay(journalDays(j), new Date(2026, 9, 14))!;
    expect(d.date.getDate()).toBe(9);
    expect(d.note).toMatchObject({ time: '18:42', text: '- Дожать *Аню* по бюджету\n  - и [[file:x.org][план]]' });
    expect(d.focus).toEqual([{ id: 'abc', title: 'Бюджет' }, { id: 'gone', title: 'Пропавшая' }]);
    expect(lastDay(journalDays(j), new Date(2026, 9, 9))).toBeNull();
  });
  it('the note as formatted lines', () => {
    expect(noteLines('- Дожать *Аню* по бюджету\n  - и [[file:x.org][план]]')).toEqual([
      { item: true, depth: 0, html: 'Дожать <b>Аню</b> по бюджету' },
      { item: true, depth: 1, html: 'и <span class="lnk" title="file:x.org">план</span>' },
    ]);
    expect(inlineHtml('<b> =код= /курсив/')).toBe('&lt;b&gt; <code>код</code> <i>курсив</i>');
  });
  it('«Главное»: the tasks by their :ID:, a deadline today is said; a lost one is kept with its title', () => {
    const w = file('w.org', '* TODO Бюджет\nDEADLINE: <2026-10-14 Ср>\n:PROPERTIES:\n:ID: abc\n:END:');
    const rows = focusRows([{ id: 'abc', title: 'Бюджет' }, { id: 'gone', title: 'Пропавшая' }], [w], new Date(2026, 9, 14));
    expect(rows[0].task).toMatchObject({ title: 'Бюджет', meta: 'дедлайн сегодня', late: true, done: false });
    expect(rows[1]).toEqual({ id: 'gone', title: 'Пропавшая', task: null });
    expect(doneStatus('TODO', DEFAULT_WORKFLOW)).toBe('DONE');
  });
  it('a full block is a row of its own where the order puts it; a new one goes before or after the block it names', () => {
    const spec = (id: string) => ({ id, title: id, wide: id === 'note' || id === 'focus', full: id === 'banner' || id === 'week' });
    const order = ['banner', 'note', 'focus', 'week', 'agenda', 'tasks'].map((id) => ({ id, on: true }));
    expect(arrange(order, spec).rows).toEqual([
      { kind: 'full', id: 'banner' }, { kind: 'top', ids: ['note', 'focus'] }, { kind: 'full', id: 'week' }, { kind: 'cols', cols: [['agenda'], ['tasks']] },
    ]);
    const saved = ['note', 'focus', 'agenda'].map((id) => ({ id, on: true }));
    const all = [{ id: 'banner', title: '', before: 'note' }, { id: 'week', title: '', after: 'focus' }, { id: 'x', title: '', after: 'nope' }];
    expect(withNew(saved, all).map((b) => b.id)).toEqual(['banner', 'note', 'focus', 'week', 'agenda', 'x']);
  });
});
