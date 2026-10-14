import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';
import { insertHeading, propertiesOf, replaceBody, reschedulesOf, setProperty, setTitle, treeOf } from './orgOps';
import { Tx } from './journal';

const H = (t: string, i = 0) => parseHeadings(t, DEFAULT_WORKFLOW)[i];

describe('setProperty', () => {
  const T = '* TODO A\nSCHEDULED: <2026-10-12 Mon>\nТекст\n';
  it('makes the drawer after the planning, changes, removes; an empty drawer goes', () => {
    const a = setProperty(T, H(T), 'OWNER', 'Юрий');
    expect(a).toBe('* TODO A\nSCHEDULED: <2026-10-12 Mon>\n:PROPERTIES:\n:OWNER: Юрий\n:END:\nТекст\n');
    const b = setProperty(a, H(a), 'owner', 'Олег');
    expect(b).toContain(':OWNER: Олег\n');
    expect(setProperty(b, H(b), 'OWNER', null)).toBe(T);
  });
});

describe('insertHeading', () => {
  const T = '#+TITLE: x\n\n* A\nтекст\n** A1\n* B\n';
  it('under a heading, first or last, relevelled', () => {
    expect(insertHeading(T, { under: H(T), position: 'first' }, '* TODO Новая\n** Деталь')).toBe('#+TITLE: x\n\n* A\nтекст\n** TODO Новая\n*** Деталь\n** A1\n* B\n');
    expect(insertHeading(T, { under: H(T), position: 'last' }, '*** Новая')).toBe('#+TITLE: x\n\n* A\nтекст\n** A1\n** Новая\n* B\n');
  });
  it('at the top (after the header) or the end of a file', () => {
    expect(insertHeading(T, { position: 'top' }, '** Новая')).toBe('#+TITLE: x\n\n* Новая\n* A\nтекст\n** A1\n* B\n');
    expect(insertHeading(T, { position: 'end' }, '* Новая')).toBe(T + '\n* Новая\n'); // a blank line after the headings above (ТЗ 30)
    expect(insertHeading('', { position: 'top' }, '* Новая')).toBe('* Новая\n');
  });
  it('one heading with its subtree only', () => {
    expect(treeOf('текст')).toBeNull();
    expect(treeOf('* A\n* B')).toBeNull();
    expect(insertHeading(T, { position: 'end' }, '* A\n* B')).toBeNull();
  });
});

describe('replaceBody', () => {
  it('keeps the planning, the drawers and the subheadings', () => {
    const T = '* A\nDEADLINE: <2026-10-20 Tue>\n:PROPERTIES:\n:X: 1\n:END:\nстарое\nещё\n\n** A1\n';
    expect(replaceBody(T, H(T), 'новое')).toBe('* A\nDEADLINE: <2026-10-20 Tue>\n:PROPERTIES:\n:X: 1\n:END:\nновое\n\n** A1\n');
    expect(replaceBody('* A\n* B\n', H('* A\n* B\n'), 'текст')).toBe('* A\nтекст\n* B\n');
    expect(() => replaceBody(T, H(T), '* нельзя')).toThrow();
  });
});

describe('Tx: the operations of the plugins\' API', () => {
  const files: Record<string, string> = { 'a.org': '* A\n** A1\n* B\n', 'b.org': '* Цель\n' };
  const tx = () => new Tx((p) => (files[p] === undefined ? undefined : { path: p, text: files[p], wf: DEFAULT_WORKFLOW }));
  const ref = (path: string, line: number, title: string) => ({ path, line, title });
  it('moves within a file and to another one; the target first', () => {
    const t = tx();
    t.move(ref('a.org', 1, 'A1'), { under: ref('a.org', 2, 'B') });
    expect(t.result()).toEqual([{ path: 'a.org', text: '* A\n* B\n** A1\n' }]);
    const u = tx();
    u.move(ref('a.org', 0, 'A'), { under: ref('b.org', 0, 'Цель') });
    expect(u.result()).toEqual([{ path: 'b.org', text: '* Цель\n** A\n*** A1\n' }, { path: 'a.org', text: '* B\n' }]);
  });
  it('a heading into itself, a wrong org text: an error; a missing heading: a conflict', () => {
    const t = tx();
    t.move(ref('a.org', 0, 'A'), { under: ref('a.org', 1, 'A1') });
    expect(t.error).toBeTruthy();
    const u = tx();
    u.insertHeading({ file: 'a.org', position: 'end' }, 'не заголовок');
    expect(u.error).toBeTruthy();
    const v = tx();
    v.setProperty(ref('a.org', 5, 'Нет такого'), 'X', '1');
    expect(v.conflict).toBe(true);
  });
});

describe('insertHeadingAt (ТЗ 30)', () => {
  it('at the end of a file: a blank line after the headings above, none after the header alone or a blank line', async () => {
    const { insertHeadingAt } = await import('./orgOps');
    expect(insertHeadingAt('#+TITLE: x\n* A\n', { position: 'end' }, '* B')).toEqual({ text: '#+TITLE: x\n* A\n\n* B\n', line: 3 });
    expect(insertHeadingAt('#+TITLE: x\n', { position: 'end' }, '* B')).toEqual({ text: '#+TITLE: x\n* B\n', line: 1 });
    expect(insertHeadingAt('* A\n\n', { position: 'end' }, '* B')!.text).toBe('* A\n\n* B\n');
  });
});

describe('beside another heading (ТЗ 33)', async () => {
  const { moveBeside, insertAfter } = await import('./orgOps');
  const { parseHeadings, DEFAULT_WORKFLOW } = await import('./org');
  const T = '#+TITLE: x\n* TODO A\nтело A\n* TODO B\n** sub B\n* TODO C\n';
  const hs = parseHeadings(T, DEFAULT_WORKFLOW);
  const [a, b, , c] = hs;
  it('before and after another one, the subtree with it; the file keeps its ending', () => {
    expect(moveBeside(T, c, a, 'before').text).toBe('#+TITLE: x\n* TODO C\n* TODO A\nтело A\n* TODO B\n** sub B\n');
    expect(moveBeside(T, a, c, 'after').text).toBe('#+TITLE: x\n* TODO B\n** sub B\n* TODO C\n* TODO A\nтело A\n');
    expect(moveBeside(T, b, a, 'before')).toEqual({ text: '#+TITLE: x\n* TODO B\n** sub B\n* TODO A\nтело A\n* TODO C\n', line: 1 });
    expect(moveBeside(T, a, a, 'after').text).toBe(T);
  });
  it('a new heading after another one\'s subtree, at its level', () => {
    expect(insertAfter(T, b, '* TODO New')).toEqual({ text: '#+TITLE: x\n* TODO A\nтело A\n* TODO B\n** sub B\n* TODO New\n* TODO C\n', line: 5 });
    expect(insertAfter(T, c, '* TODO Last')!.text).toBe('#+TITLE: x\n* TODO A\nтело A\n* TODO B\n** sub B\n* TODO C\n* TODO Last\n'); // before the file's ending
  });
});

describe('the plugins\' reads and renames (API 1.7)', () => {
  const T = ['* TODO [#A] Старое название :work:q4:', 'SCHEDULED: <2026-10-14 Ср>', ':PROPERTIES:', ':ID: abc', ':RESULT:   done', ':END:', 'Заметка.', '** Под'].join('\n');
  const h = parseHeadings(T, DEFAULT_WORKFLOW)[0];
  it('setTitle keeps the status, the priority and the tags', () => {
    expect(setTitle(T, h, '  Новое   название ').split('\n')[0]).toBe('* TODO [#A] Новое название :work:q4:');
    const P = '* Просто :t:\n';
    expect(setTitle(P, parseHeadings(P, DEFAULT_WORKFLOW)[0], 'Другое').split('\n')[0]).toBe('* Другое :t:');
  });
  it('propertiesOf: its own drawer under the planning line, keys in upper case', () => {
    expect(propertiesOf(T, h)).toEqual({ ID: 'abc', RESULT: 'done' });
    expect(propertiesOf('* А\nтекст\n', parseHeadings('* А\nтекст\n', DEFAULT_WORKFLOW)[0])).toEqual({});
  });
});

describe('reschedulesOf (ТЗ 36)', () => {
  it('the moves its drawers note (ours and Emacs\'s), not those of the text or of a child', () => {
    const t = ['* TODO A', 'SCHEDULED: <2026-10-15 Чт>', ':LOGBOOK:', '- Rescheduled from "<2026-10-13 Вт>" on [2026-10-14 Wed 09:05]', '- Rescheduled from "<2026-10-12 Mon 10:00>" on [2026-10-12 Mon 18:40]', ':END:', '- Rescheduled from "<2026-01-01>" on [2026-01-02]', '** B', ':LOGBOOK:', '- Rescheduled from "<2026-10-01>" on [2026-10-02]', ':END:', ''].join('\n');
    const [a, b] = parseHeadings(t, DEFAULT_WORKFLOW);
    expect(reschedulesOf(t, a)).toEqual([
      { from: { y: 2026, m: 10, d: 13 }, at: { y: 2026, m: 10, d: 14, time: '09:05' } },
      { from: { y: 2026, m: 10, d: 12, time: '10:00' }, at: { y: 2026, m: 10, d: 12, time: '18:40' } },
    ]);
    expect(reschedulesOf(t, b)).toEqual([{ from: { y: 2026, m: 10, d: 1 }, at: { y: 2026, m: 10, d: 2 } }]);
  });
});
