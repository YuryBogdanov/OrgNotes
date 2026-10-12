import { describe, expect, it } from 'vitest';
import { buttons, expandAll, headingKey, pathKeys, subtreeKeys, treeNodes, type TreeFile } from './navTree';

// work.org:  * Цели  / ** Q4 / *** Бюджет ;  * Идеи
const H = (title: string, level: number, parent: number, line: number, end: number) => ({ title, level, parent, line, end });
const work: TreeFile = { name: 'Работа/2026/work.org', path: '/n/Работа/2026/work.org', headings: [H('Цели', 1, -1, 0, 3), H('Q4', 2, 0, 1, 3), H('Бюджет', 3, 1, 2, 3), H('Идеи', 1, -1, 3, 4)] };
const plan: TreeFile = { name: 'Работа/plan.org', path: '/n/Работа/plan.org', headings: [] };
const top: TreeFile = { name: 'inbox.org', path: '/n/inbox.org', headings: [H('Задача', 1, -1, 0, 1)] };
const files = [work, plan, top];
const folders = ['Работа', 'Работа/2026', 'Личное'];

describe('the tree', () => {
  it('nodes by keys: folders with «/», files by path, headings by the chain of titles', () => {
    const nodes = treeNodes(folders, files, true);
    expect(nodes.map((n) => [n.key, n.kids])).toEqual([
      ['Личное/', false], // empty: nothing to open
      ['Работа/', true],
      ['Работа/2026/', true],
      ['/n/Работа/2026/work.org', true],
      ['/n/Работа/2026/work.org#Цели', true],
      ['/n/Работа/2026/work.org#Цели › Q4', true],
      ['/n/Работа/2026/work.org#Цели › Q4 › Бюджет', false],
      ['/n/Работа/2026/work.org#Идеи', false],
      ['/n/Работа/plan.org', false],
      ['/n/inbox.org', true],
      ['/n/inbox.org#Задача', false],
    ]);
    expect(headingKey(work, 2)).toBe('/n/Работа/2026/work.org#Цели › Q4 › Бюджет');
    // «Чистое»: no headings, files cannot be opened
    expect(treeNodes(folders, files, false).filter((n) => n.kids).map((n) => n.key)).toEqual(['Работа/', 'Работа/2026/']);
  });

  it('the path to the current file: its folders, the file, the headings above the current one', () => {
    expect(pathKeys(work, 2, true)).toEqual(['Работа/', 'Работа/2026/', '/n/Работа/2026/work.org', '/n/Работа/2026/work.org#Цели', '/n/Работа/2026/work.org#Цели › Q4']);
    expect(pathKeys(work, -1, true)).toEqual(['Работа/', 'Работа/2026/', '/n/Работа/2026/work.org']);
    expect(pathKeys(work, 2, false)).toEqual(['Работа/', 'Работа/2026/']);
    expect(pathKeys(undefined, -1, true)).toEqual([]);
  });

  it('«Развернуть всё»: every node that opens; over the cap only folders and files', () => {
    const nodes = treeNodes(folders, files, true);
    expect(expandAll(nodes)).toEqual({ keys: ['Работа/', 'Работа/2026/', '/n/Работа/2026/work.org', '/n/Работа/2026/work.org#Цели', '/n/Работа/2026/work.org#Цели › Q4', '/n/inbox.org'], capped: false });
    expect(expandAll(nodes, 5)).toEqual({ keys: ['Работа/', 'Работа/2026/', '/n/Работа/2026/work.org', '/n/inbox.org'], capped: true });
  });

  it('a subtree: the node and what opens under it', () => {
    const nodes = treeNodes(folders, files, true);
    expect(subtreeKeys(nodes, 'Работа/')).toEqual(['Работа/', 'Работа/2026/', '/n/Работа/2026/work.org', '/n/Работа/2026/work.org#Цели', '/n/Работа/2026/work.org#Цели › Q4']);
    expect(subtreeKeys(nodes, '/n/inbox.org')).toEqual(['/n/inbox.org']);
  });

  it('the buttons: «Свернуть всё» off when only the path is open, «Развернуть всё» off when all is', () => {
    const nodes = treeNodes(folders, files, true);
    const path = pathKeys(work, 2, true);
    expect(buttons(nodes, new Set(path), path)).toEqual({ collapse: false, expand: true });
    expect(buttons(nodes, new Set([...path, '/n/inbox.org']), path)).toEqual({ collapse: true, expand: false });
    expect(buttons(nodes, new Set([...path, 'Пропавшая/']), path)).toEqual({ collapse: false, expand: true }); // gone nodes do not count
    const capped = expandAll(nodes, 5).keys;
    expect(buttons(nodes, new Set(capped), path, 5)).toEqual({ collapse: true, expand: false });
  });
});
