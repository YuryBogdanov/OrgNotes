import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from '../../org';
import { DEFAULT_SETTINGS, ago, inboxItems, readSettings } from './list';

const INBOX = [
  '#+TITLE: Inbox',
  '* TODO Позвонить в банк про лимиты',
  ':PROPERTIES:',
  ':CREATED: [2026-10-12 Mon 09:12]',
  ':END:',
  'по карте компании, уточнить комиссию',
  'вторая строка',
  '* DONE Уже сделано',
  '* TODO Без даты создания',
  '* TODO Согласовать отпуск',
  ':PROPERTIES:',
  ':CREATED: [2026-10-11 Sun 18:40]',
  ':END:',
  '** NEXT подзадача',
  '* Просто заметка',
  '',
].join('\n');
const hs = parseHeadings(INBOX, DEFAULT_WORKFLOW);

describe('the list', () => {
  it('open top-level tasks, newest first by :CREATED:, the rest after them in the file’s order', () => {
    const items = inboxItems(INBOX, hs, DEFAULT_WORKFLOW);
    expect(items.map((i) => i.title)).toEqual(['Позвонить в банк про лимиты', 'Согласовать отпуск', 'Без даты создания']);
    expect(items[0]).toMatchObject({ details: 'по карте компании, уточнить комиссию', hasDetails: true });
    expect(items[0].created).toEqual(new Date(2026, 9, 12, 9, 12));
    expect(items[1]).toMatchObject({ details: '', hasDetails: true }); // a sub-heading
    expect(items[2]).toMatchObject({ details: '', hasDetails: false, created: null });
    expect(inboxItems(INBOX, hs, DEFAULT_WORKFLOW, 'file').map((i) => i.title)).toEqual(['Позвонить в банк про лимиты', 'Без даты создания', 'Согласовать отпуск']);
  });
  it('relative time', () => {
    const now = new Date(2026, 9, 12, 10, 0);
    expect(ago(new Date(2026, 9, 12, 9, 59, 40), now)).toBe('только что');
    expect(ago(new Date(2026, 9, 12, 9, 55), now)).toBe('5 мин');
    expect(ago(new Date(2026, 9, 12, 7, 5), now)).toBe('сегодня 07:05');
    expect(ago(new Date(2026, 9, 11, 23, 0), now)).toBe('вчера');
    expect(ago(new Date(2026, 9, 8), now)).toBe('8 окт');
    expect(ago(new Date(2025, 11, 30), now)).toBe('30 дек 2025');
    expect(ago(null, now)).toBe('');
  });
});


describe('settings', () => {
  it('read with defaults; wrong values give the default', () => {
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({ reviewDone: 'HELD', reviewOrder: 'new', stale: 14 })).toMatchObject({ reviewDone: 'HELD', reviewCancel: 'CANCELLED', reviewOrder: 'new', stale: 14 });
    expect(readSettings({ stale: 5, reviewOrder: 'x', order: 'file', counter: false })).toMatchObject({ stale: 7, reviewOrder: 'old', order: 'file', counter: false });
  });
});

// fix-50: the badge of «Входящие» — the entries to sort, red when the oldest has lain longer than the setting
describe('the badge', async () => {
  const { inboxBadge } = await import('./list');
  const now = new Date(2026, 9, 19, 12);
  const at = (d: number) => ({ created: new Date(2026, 9, 19 - d, 12) });
  it('how many; red past the days set, never with 0; none with the counter off', () => {
    expect(inboxBadge([at(1), at(2)], { counter: true, alertAfter: 7 }, now)).toEqual({ n: 2, alert: false });
    expect(inboxBadge([at(1), at(9)], { counter: true, alertAfter: 7 }, now)).toEqual({ n: 2, alert: true });
    expect(inboxBadge([at(30)], { counter: true, alertAfter: 0 }, now)).toEqual({ n: 1, alert: false });
    expect(inboxBadge([at(30)], { counter: false, alertAfter: 7 }, now)).toEqual({ n: 0, alert: false });
    expect(inboxBadge([{ created: null }], { counter: true, alertAfter: 3 }, now)).toEqual({ n: 1, alert: false });
  });
});
