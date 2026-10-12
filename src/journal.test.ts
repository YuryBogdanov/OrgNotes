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
