import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';
import { insertHeading, replaceBody, setProperty, treeOf } from './orgOps';
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
