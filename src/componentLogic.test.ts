import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings, titleIndex } from './org';
import { visibleRows } from './navRows';
import { dividerRatio, fitPanels, MIN_PANE } from './layout';
import { fitStatus, fitUntitledBar } from './statusFit';
import { builtinItemsOf, builtinSectionsOf } from './builtinAgenda';

// Tech sprint 4.1: the logic taken out of the components (Navigator, App, Pane, Agenda), under test on its own.

const wf = DEFAULT_WORKFLOW;
const file = (name: string, text: string) => ({ name, path: '/n/' + name, text, wf, headings: parseHeadings(text, wf) });

describe('the navigator rows', () => {
  const files = [file('Работа/plan.org', '* TODO Цели\n** DONE Q4\n** TODO Бюджет\n* Идеи\n'), file('inbox.org', '')];
  const opts = { headings: true, creating: null, cur: 0, selected: -1 };
  it('folded: the folders first, then the files of the root', () => {
    expect(visibleRows(['Работа', 'Архив'], files, new Set(), opts).map((r) => [r.kind, r.label, r.hasKids])).toEqual([
      ['folder', 'Архив', false], // empty: no chevron
      ['folder', 'Работа', true],
      ['file', 'inbox', false],
    ]);
  });
  it('open down to the headings; a folded heading hides its children; progress of a subtree', () => {
    const rows = visibleRows(['Работа'], files, new Set(['Работа/', '/n/Работа/plan.org']), opts);
    expect(rows.map((r) => [r.kind, r.label, r.depth, r.cnt ?? ''])).toEqual([
      ['folder', 'Работа', 0, ''],
      ['file', 'plan', 1, ''],
      ['heading', 'Цели', 2, '1/2'],
      ['heading', 'Идеи', 2, ''],
      ['file', 'inbox', 0, ''],
    ]);
    expect(rows[1].selected).toBe(true); // the current file, no heading chosen
  });
  it('the row of a new file in the folder it is named in', () => {
    const rows = visibleRows(['Работа'], files, new Set(['Работа/']), { ...opts, creating: 'Работа' });
    expect(rows.map((r) => r.kind)).toEqual(['folder', 'new', 'file', 'file']);
  });
});

describe('room for two panes', () => {
  const o = { navW: 248, inspW: 272, nav: true, insp: true, two: true };
  it('wide: everything stays; one pane or no width yet: nothing changes', () => {
    expect(fitPanels(1600, o)).toEqual({ nav: true, insp: true, merge: false });
    expect(fitPanels(500, { ...o, two: false })).toEqual({ nav: true, insp: true, merge: false });
    expect(fitPanels(0, o)).toEqual({ nav: true, insp: true, merge: false });
  });
  it('narrower: the inspector goes, then the navigator, then the panes merge', () => {
    expect(fitPanels(2 * MIN_PANE + 1 + 249 + 100, o)).toEqual({ nav: true, insp: false, merge: false });
    expect(fitPanels(2 * MIN_PANE + 1 + 100, o)).toEqual({ nav: false, insp: false, merge: false });
    expect(fitPanels(2 * MIN_PANE, o)).toEqual({ nav: false, insp: false, merge: true });
  });
  it('the divider: the share of the left pane, neither narrower than a pane may be', () => {
    expect(dividerRatio(500, 0, 1000)).toBe(0.5);
    expect(dividerRatio(10, 0, 1000)).toBeCloseTo(MIN_PANE / 1000);
    expect(dividerRatio(990, 0, 1000)).toBeCloseTo(1 - MIN_PANE / 1000);
  });
});

describe('the bottom bars of a pane', () => {
  const tw = (s: string) => s.length * 7;
  const parts = ['Работа', '2026', 'plan.org'];
  it('wide: the whole path, Org and UTF-8; before the font is known: everything', () => {
    expect(fitStatus(parts, 2000, 'Стр. 1, кол. 0', 'Сохранено', tw)).toEqual({ org: true, utf: true, path: 'Работа/2026/plan.org' });
    expect(fitStatus(parts, 10, 'x', 'y', null)).toEqual({ org: true, utf: true, path: 'Работа/2026/plan.org' });
  });
  it('narrower: the folders go from the start, then UTF-8, then Org', () => {
    const fixed = 28 + tw('Стр. 1, кол. 0') + tw('Сохранено') + 32;
    const both = tw('Org') + 16 + tw('UTF-8') + 16;
    expect(fitStatus(parts, fixed + both + tw('…/2026/plan.org'), 'Стр. 1, кол. 0', 'Сохранено', tw).path).toBe('…/2026/plan.org');
    expect(fitStatus(parts, fixed + tw('Org') + 16 + tw('plan.org'), 'Стр. 1, кол. 0', 'Сохранено', tw)).toEqual({ org: true, utf: false, path: 'plan.org' });
    expect(fitStatus(parts, fixed + tw('plan.org'), 'Стр. 1, кол. 0', 'Сохранено', tw)).toEqual({ org: false, utf: false, path: 'plan.org' });
  });
  it('a new note: the hint goes first, then the key', () => {
    expect(fitUntitledBar(2000, 120, '⌘S', tw)).toEqual({ keys: true, hint: true });
    expect(fitUntitledBar(300, 120, '⌘S', tw)).toEqual({ keys: true, hint: false });
    expect(fitUntitledBar(200, 120, '⌘S', tw)).toEqual({ keys: false, hint: false });
  });
});

describe('the built-in agenda', () => {
  const today = new Date(2026, 9, 15);
  const f = file('work.org', [
    '* TODO Отчёт', 'DEADLINE: <2026-10-13 Вт>',
    '* TODO Отчёт', 'SCHEDULED: <2026-10-16 Пт>',
    '* Встреча', '<2026-10-15 Чт 10:00>',
    '* DONE Сделано', 'SCHEDULED: <2026-10-15 Чт>',
    '* TODO Далеко', 'SCHEDULED: <2026-12-20 Вс>',
  ].join('\n') + '\n');
  it('open tasks and events of 30 days, overdue first; the same titles told apart', () => {
    const items = builtinItemsOf([f], today);
    expect(items.map((i) => [i.title, i.day, i.dk, i.n, i.late])).toEqual([
      ['Отчёт', -2, 'DEADLINE', 0, true],
      ['Встреча', 0, 'event', 0, false],
      ['Отчёт', 1, 'SCHEDULED', 1, false],
    ]);
    expect(builtinSectionsOf(items, today).map((s) => s.title)).toEqual(['Просрочено', 'Сегодня', 'Завтра']);
  });
  it('which of the same titles a heading is', () => {
    expect(titleIndex(f.headings, 2, 'Отчёт')).toBe(1);
    expect(titleIndex(f.headings, 99, 'Отчёт')).toBe(0);
  });
});
