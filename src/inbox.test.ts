import { describe, expect, it } from 'vitest';
import { DEFAULT_INBOX, ago, append, entry, inboxItems, prepend, readInbox, remove, withInbox } from './inbox';
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
  it('appended (the other setting): at the end, one blank line before it', () => {
    expect(append('#+TITLE: Inbox\n* TODO A\n', '* TODO B')).toBe('#+TITLE: Inbox\n* TODO A\n\n* TODO B\n');
    expect(append('* TODO A\ntext\n\n\n', '* TODO B')).toBe('* TODO A\ntext\n\n* TODO B\n');
    expect(append('', '* TODO B')).toBe('* TODO B\n');
    expect(append('\n\n', '* TODO B')).toBe('* TODO B\n');
    expect(append(append('* A', '* B'), '* C')).toBe('* A\n\n* B\n\n* C\n');
  });
  it('prepended: after the preamble, before the first heading, one blank line below it', () => {
    expect(prepend('#+TITLE: Inbox\n* TODO A\n', '* TODO B')).toBe('#+TITLE: Inbox\n* TODO B\n\n* TODO A\n');
    expect(prepend('#+TITLE: Inbox\n\n* TODO A\ntext\n\n* TODO C', '* TODO B\n:PROPERTIES:\n:END:')).toBe(
      '#+TITLE: Inbox\n\n* TODO B\n:PROPERTIES:\n:END:\n\n* TODO A\ntext\n\n* TODO C\n',
    );
    expect(prepend('* TODO A\n', '* TODO B')).toBe('* TODO B\n\n* TODO A\n');
    // a heading-like line inside a block is not a heading
    expect(prepend('#+BEGIN_SRC\n* x\n#+END_SRC\n* A\n', '* B')).toBe('#+BEGIN_SRC\n* x\n#+END_SRC\n* B\n\n* A\n');
    // no headings yet: after the preamble with a blank line; an empty file gets just the task
    expect(prepend('#+TITLE: inbox\n\n\n', '* TODO B')).toBe('#+TITLE: inbox\n\n* TODO B\n');
    expect(prepend('', '* TODO B')).toBe('* TODO B\n');
    expect(prepend('\n\n', '* TODO B')).toBe('* TODO B\n');
    // twice: the newest on top, the tasks don't stick together
    expect(prepend(prepend('* A\n', '* B'), '* C')).toBe('* C\n\n* B\n\n* A\n');
  });
  it('removing a subtree', () => {
    const h = hs.find((x) => x.title === 'Согласовать отпуск')!;
    expect(remove(INBOX, h)).not.toContain('Согласовать отпуск');
    expect(remove(INBOX, h)).toContain('* Просто заметка');
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
    // where a task goes: the top by default, the end only when set
    expect(DEFAULT_INBOX.add).toBe('top');
    expect(readInbox({ add: 'end' }).add).toBe('end');
    expect(readInbox({ add: 'middle' }).add).toBe('top');
    // «Разбор»: the statuses, the order of the cards, when a task lies too long
    expect(readInbox({ reviewDone: 'HELD', reviewOrder: 'new', stale: 14 })).toMatchObject({ reviewDone: 'HELD', reviewCancel: 'CANCELLED', reviewOrder: 'new', stale: 14 });
    expect(readInbox({ stale: 5, reviewOrder: 'x' })).toMatchObject({ stale: 7, reviewOrder: 'old' });
    expect(JSON.parse(withInbox(null, { ...DEFAULT_INBOX, add: 'end' })).inbox).toEqual({ add: 'end' });
  });
});
