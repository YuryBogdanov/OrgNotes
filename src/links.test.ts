import { describe, expect, it } from 'vitest';
import { backlinks, extractLinks, resolveLink, type NoteRef } from './links';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';

const note = (path: string, text: string, name = path.split('/').pop()!): NoteRef => ({
  path, name, text, headings: parseHeadings(text, DEFAULT_WORKFLOW),
});

describe('extractLinks', () => {
  const text = [
    '* H [[file:hiring.org::*План][план]] x',
    ':PROPERTIES:',
    ':ID: abc',
    ':END:',
    'See [[id:abc][by id]], [[*Local]], [[#custom]], [[Fuzzy]], https://plain.example.org and <https://angle.org>.',
  ].join('\n');
  const ls = extractLinks(text);

  it('finds all kinds with exact offsets', () => {
    expect(ls.map((l) => l.type)).toEqual(['file', 'id', 'fuzzy', 'custom-id', 'fuzzy', 'https', 'https']);
    const f = ls[0];
    expect(text.slice(f.from, f.to)).toBe('[[file:hiring.org::*План][план]]');
    expect(text.slice(f.descFrom, f.descTo)).toBe('план');
    expect(f.desc).toBe('план');
    expect(f.line).toBe(0);
    expect(ls[1].line).toBe(4);
  });
  it('reads plain and angle URLs', () => {
    expect(ls[5].format).toBe('plain');
    expect(ls[6].format).toBe('angle');
    expect(ls[5].raw).toBe('https://plain.example.org');
  });
  it('ignores links inside source blocks', () => {
    expect(extractLinks('#+BEGIN_SRC org\n[[file:x.org]]\n#+END_SRC\n')).toEqual([]);
  });
});

describe('resolveLink', () => {
  const files = [
    note('/n/Команда/lead.org', '* Цели\n** TODO План найма\n:PROPERTIES:\n:ID: id-1\n:CUSTOM_ID: hire\n:END:\n'),
    note('/n/Weekly.org', '* Задачи\n** Позвонить\nтекст <<anchor>> здесь\n'),
  ];
  const link = (raw: string, type: string, path = raw) => ({ from: 0, to: 0, format: 'bracket' as const, type, raw, path, line: 0 });

  it('resolves relative file links, with heading search', () => {
    const from = 0;
    expect(resolveLink(link('file:../Weekly.org', 'file', '../Weekly.org'), from, files)).toEqual({ kind: 'note', file: 1, line: null });
    expect(resolveLink(link('file:../Weekly.org::*Позвонить', 'file', '../Weekly.org::*Позвонить'), from, files)).toEqual({ kind: 'note', file: 1, line: 1 });
    expect(resolveLink(link('f', 'file', '../Weekly.org::anchor'), from, files)).toEqual({ kind: 'note', file: 1, line: 2 });
    expect(resolveLink(link('f', 'file', '../Weekly.org::2'), from, files)).toEqual({ kind: 'note', file: 1, line: 1 });
  });
  it('keeps the file when the section is missing', () => {
    const t = resolveLink(link('f', 'file', '../Weekly.org::*Нет такого'), 0, files);
    expect(t).toMatchObject({ kind: 'note', file: 1, line: null, missingSection: '*Нет такого' });
  });
  it('resolves ids and custom ids across files', () => {
    expect(resolveLink(link('id:id-1', 'id', 'id-1'), 1, files)).toEqual({ kind: 'note', file: 0, line: 1 });
    expect(resolveLink(link('#hire', 'custom-id', 'hire'), 1, files)).toEqual({ kind: 'note', file: 0, line: 1 });
  });
  it('resolves fuzzy links inside the same file', () => {
    expect(resolveLink(link('*Цели', 'fuzzy'), 0, files)).toEqual({ kind: 'note', file: 0, line: 0 });
    expect(resolveLink(link('План найма', 'fuzzy'), 0, files)).toEqual({ kind: 'note', file: 0, line: 1 });
  });
  it('passes urls through and reports missing targets', () => {
    expect(resolveLink(link('https://a.b', 'https'), 0, files)).toEqual({ kind: 'url', url: 'https://a.b' });
    expect(resolveLink(link('file:nope.org', 'file', 'nope.org'), 0, files)).toMatchObject({ kind: 'missing' });
    expect(resolveLink(link('id:zzz', 'id', 'zzz'), 0, files)).toMatchObject({ kind: 'missing' });
  });
});

describe('backlinks', () => {
  it('lists links that point at a heading', () => {
    const files = [
      note('/n/a.org', '* Цель\n** План\n:PROPERTIES:\n:ID: p1\n:END:\n'),
      note('/n/b.org', '* Встреча\nОбсудить [[id:p1][план]] и [[file:a.org]]\n'),
    ];
    const bl = backlinks(files, 0, 1);
    expect(bl).toEqual([{ file: 1, line: 1, heading: 'Встреча', label: 'план' }]);
    // whole-file links
    expect(backlinks(files, 0, null)).toEqual([{ file: 1, line: 1, heading: 'Встреча', label: 'a.org' }]);
  });
});
