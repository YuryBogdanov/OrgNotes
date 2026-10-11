import { describe, expect, it } from 'vitest';
import { DEFAULT_INBOX, ago, append, entry, inboxItems, insert, readInbox, remove, subtree, withInbox } from './inbox';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';

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

describe('writing', () => {
  it('a new task: one line of title, :CREATED:, details with a heading-like line escaped', () => {
    const e = entry('  Подготовить\nпрезентацию   для CTO ', 'Показать план найма.\n* не заголовок\n\n', 'TODO', new Date(2026, 9, 11, 14, 32));
    expect(e).toBe(['* TODO Подготовить презентацию для CTO', ':PROPERTIES:', ':CREATED: [2026-10-11 Sun 14:32]', ':END:', 'Показать план найма.', ',* не заголовок'].join('\n'));
    expect(entry('Без деталей', '', 'NEW', null)).toBe('* NEW Без деталей');
  });
  it('appended at the end, the file ends with a line break', () => {
    expect(append('* A', '* TODO B')).toBe('* A\n* TODO B\n');
    expect(append('* A\n\n\n', '* TODO B')).toBe('* A\n* TODO B\n');
    expect(append('', '* TODO B')).toBe('* TODO B\n');
  });
  it('removing and moving a subtree: levels recounted, :CREATED: and details go with it', () => {
    const h = hs.find((x) => x.title === 'Согласовать отпуск')!;
    const tree = subtree(INBOX, h);
    expect(remove(INBOX, h)).not.toContain('Согласовать отпуск');
    expect(remove(INBOX, h)).toContain('* Просто заметка');
    const dst = '* Работа\n** Q4\nтекст\n\n* Дом\n';
    const dh = parseHeadings(dst, DEFAULT_WORKFLOW);
    expect(insert(dst, tree, 1, dh[1])).toBe(['* Работа', '** Q4', 'текст', '*** TODO Согласовать отпуск', ':PROPERTIES:', ':CREATED: [2026-10-11 Sun 18:40]', ':END:', '**** NEXT подзадача', '', '* Дом', ''].join('\n'));
    expect(insert(dst, tree, 1, null)).toBe(dst.replace(/\n$/, '') + '\n' + tree.join('\n') + '\n');
  });
});

describe('settings', () => {
  it('read with defaults, written without them, other keys kept', () => {
    expect(readInbox(undefined)).toEqual(DEFAULT_INBOX);
    const c = { ...DEFAULT_INBOX, file: 'inbox.org', counter: false };
    const raw = withInbox('{"version":1,"workflows":[]}', c);
    expect(JSON.parse(raw)).toEqual({ version: 1, workflows: [], inbox: { file: 'inbox.org', counter: false } });
    expect(readInbox(JSON.parse(raw).inbox)).toEqual(c);
    expect(JSON.parse(withInbox(raw, DEFAULT_INBOX)).inbox).toBeUndefined();
  });
});
