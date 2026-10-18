import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';
import { searchFile } from './search';
import { contextBlocks } from './searchContext';

const TEXT = [
  '* Платформа', // 0
  '** NEXT Переезд хранилища :dev:', // 1
  'SCHEDULED: <2026-11-12 Чт>', // 2
  ':PROPERTIES:', // 3
  ':ID: a1', // 4
  ':END:', // 5
  'С созвона:', // 6
  '- окно переезда 12 ноября', // 7
  '- индекс готов', // 8
  '- спросить про откат переезда', // 9
  '', // 10
  '*** TODO Риски переезда', // 11
  'Контур не готов.', // 12
].join('\n');
const hs = parseHeadings(TEXT, DEFAULT_WORKFLOW);
const blocks = () => contextBlocks(TEXT, hs, searchFile(TEXT, hs, 'переезд', { cs: false, word: false }, 'all'));

describe('the context of the results (ТЗ 53 §3)', () => {
  it('a heading\'s line: without its stars and status, the status the block\'s; SCHEDULED after it as text', () => {
    const b = blocks()[0];
    expect(b.keyword).toBe('NEXT');
    expect(b.lines.map((l) => l.text)).toEqual(['Переезд хранилища :dev:', 'SCHEDULED: <2026-11-12 Чт>']);
    expect(b.lines[0]).toMatchObject({ heading: true, match: true, marks: [[0, 7]] });
  });
  it('matches two lines apart under one heading: one block, the shared line once; a drawer and an empty line left out', () => {
    const b = blocks()[1];
    expect(b.hits).toHaveLength(2);
    expect(b.lines.map((l) => l.n)).toEqual([6, 7, 8, 9]);
    expect(b.lines.filter((l) => l.match).map((l) => l.n)).toEqual([7, 9]);
    expect(b.lines.some((l) => l.text.startsWith(':'))).toBe(false);
  });
  it('another heading\'s line is not a neighbour; its own block', () => {
    const bs = blocks();
    expect(bs).toHaveLength(3);
    expect(bs[2].keyword).toBe('TODO');
    expect(bs[2].lines.map((l) => l.n)).toEqual([11, 12]); // the empty line before left out
    expect(bs[2].where).toBe('Платформа › Переезд хранилища');
  });
});
