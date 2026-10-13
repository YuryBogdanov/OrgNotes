import { describe, expect, it } from 'vitest';
import { Journal, Tx, canUndo, type TxFile } from './journal';
import { DEFAULT_WORKFLOW } from './org';

const files = (m: Record<string, string>) => (path: string): TxFile | undefined => (m[path] === undefined ? undefined : { path, text: m[path], wf: DEFAULT_WORKFLOW });

describe('a transaction', () => {
  const disk = { '/a.org': '* TODO Купить\n* TODO Позвонить\n', '/b.org': '* Проекты\n' };
  it('Org operations on headings by reference, one after another on the same text', () => {
    const tx = new Tx(files(disk));
    tx.setStatus({ path: '/a.org', line: 1, title: 'Позвонить' }, 'DONE');
    tx.setPlanning({ path: '/a.org', line: 0, title: 'Купить' }, 'SCHEDULED', new Date(2026, 9, 14));
    tx.setTags({ path: '/a.org', line: 0, title: 'Купить' }, ['дом']);
    const r = tx.result();
    expect(r).toHaveLength(1);
    expect(r[0].text).toMatch(/^\* TODO Купить :дом:\nSCHEDULED: <2026-10-14 [^>]+>\n\* DONE Позвонить\n/);
    expect(tx.conflict).toBe(false);
  });
  it('a heading that moved is found by its title; one that is gone makes a conflict', () => {
    const tx = new Tx(files(disk));
    tx.remove({ path: '/a.org', line: 5, title: 'Позвонить' }); // the line is stale
    expect(tx.result()[0].text).toBe('* TODO Купить'); // as the Inbox's remove() leaves it
    const bad = new Tx(files(disk));
    bad.setStatus({ path: '/a.org', line: 0, title: 'Нет такой' }, 'DONE');
    expect(bad.conflict).toBe(true);
    const nofile = new Tx(files(disk));
    nofile.update('/c.org', () => 'x');
    expect(nofile.conflict).toBe(true);
  });
  it('files in the order first touched (a move writes its target first); unchanged files are left out', () => {
    const tx = new Tx(files(disk));
    tx.update('/b.org', (t) => t + '** Купить\n');
    tx.update('/a.org', (t) => t.replace('* TODO Купить\n', ''));
    tx.update('/b.org', (t) => t + '** ещё\n');
    tx.update('/a.org', (t) => t); // no change
    expect(tx.result().map((x) => x.path)).toEqual(['/b.org', '/a.org']);
    expect(tx.text('/b.org')).toBe('* Проекты\n** Купить\n** ещё\n');
    const none = new Tx(files(disk));
    none.update('/a.org', () => null);
    expect(none.result()).toEqual([]);
  });
});

describe('the journal', () => {
  it('the last step on top; a step can be taken back while its files are as it left them', () => {
    const j = new Journal();
    const a = j.record('A', [{ path: '/a.org', before: '1', after: '2' }]);
    const b = j.record('B', [{ path: '/a.org', before: '2', after: '3' }, { path: '/b.org', before: 'x', after: 'y' }]);
    expect(j.last()).toBe(b);
    expect(canUndo(b, (p) => ({ '/a.org': '3', '/b.org': 'y' })[p])).toBe(true);
    expect(canUndo(b, (p) => ({ '/a.org': '3', '/b.org': 'z' })[p])).toBe(false);
    j.drop(b);
    expect(j.last()).toBe(a);
    expect(j.has(b)).toBe(false);
    expect(j.size).toBe(1);
  });
});

describe('the operations of Org level (ТЗ 30)', () => {
  const T = '* Квартальные задачи\n** Квартал Q4 2026\n*** TODO Цель\n**** Отметки\n- [2026-10-01 Чт] раз\n- [2026-10-10 Сб] три\n\n** Квартал Q2 2026\n*** TODO Старая\n\n* Другое\n';
  const P = '/f.org';
  const tx = () => new Tx(files({ [P]: T }));
  const src = { path: P, line: 0, title: 'Квартальные задачи' };
  it('a heading made in the transaction is found by the next operation; the last child goes before the blank lines', () => {
    const t = tx();
    const q = t.insertHeading({ under: src, position: 'last' }, '* Квартал Q1 2026');
    expect(q).toEqual({ path: P, line: 9, title: 'Квартал Q1 2026' }); // before the blank line ending the source's Q2
    const g = t.insertHeading({ under: q!, position: 'last' }, '* TODO Новая\n** Отметки');
    expect(g).toEqual({ path: P, line: 10, title: 'Новая' });
    t.setPlanning(g!, 'DEADLINE', new Date(2026, 2, 31));
    expect(t.result()[0].text).toContain('** Квартал Q1 2026\n*** TODO Новая\nDEADLINE: <2026-03-31');
    expect(t.conflict).toBe(false);
  });
  it('before a subheading; ensureChild finds one (case aside) or makes it in its place', () => {
    const t = tx();
    const older = t.children(src).find((h) => h.title === 'Квартал Q2 2026')!;
    const q3 = t.ensureChild(src, 'Квартал Q3 2026', { before: { path: P, line: older.line, title: older.title } });
    expect(q3).toEqual({ path: P, line: 7, title: 'Квартал Q3 2026' });
    expect(t.ensureChild(src, '  квартал q4 2026 ')).toEqual({ path: P, line: 1, title: 'Квартал Q4 2026' });
    expect(t.children(src).map((h) => h.title)).toEqual(['Квартал Q4 2026', 'Квартал Q3 2026', 'Квартал Q2 2026']);
    expect(t.result()[0].text).toContain('\n\n** Квартал Q3 2026\n** Квартал Q2 2026\n');
  });
  it('the body read and written in the same transaction; a move under a heading made there', () => {
    const t = tx();
    const marks = { path: P, line: 3, title: 'Отметки' };
    expect(t.body(marks)).toBe('- [2026-10-01 Чт] раз\n- [2026-10-10 Сб] три');
    t.replaceBody(marks, '- [2026-10-01 Чт] раз\n- [2026-10-05 Пн] два\n- [2026-10-10 Сб] три');
    expect(t.body(marks)).toBe('- [2026-10-01 Чт] раз\n- [2026-10-05 Пн] два\n- [2026-10-10 Сб] три');
    const q1 = t.ensureChild(src, 'Квартал Q1 2027')!;
    t.move({ path: P, line: 8, title: 'Старая' }, { under: q1 });
    expect(t.conflict).toBe(false);
    expect(t.result()[0].text).toContain('** Квартал Q2 2026\n** Квартал Q1 2027\n*** TODO Старая\n\n* Другое');
    expect(t.children(q1).map((h) => h.title)).toEqual(['Старая']);
  });
  it('a heading not there: a conflict, null', () => {
    const t = tx();
    expect(t.ensureChild({ path: P, line: 0, title: 'Нет такого' }, 'X')).toBeNull();
    expect(t.conflict).toBe(true);
  });
});
