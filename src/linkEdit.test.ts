import { describe, expect, it } from 'vitest';
import { clipTarget, headingLink, labelOf, linkPaste, relTarget } from './linkEdit';

describe('the clipboard as a link', () => {
  it('an address with a scheme, or a whole Org link on one line', () => {
    expect(clipTarget('  https://wiki.example.com/dc  ')).toBe('https://wiki.example.com/dc');
    expect(clipTarget('mailto:a@b.ru')).toBe('mailto:a@b.ru');
    expect(clipTarget('id:6f1c')).toBe('id:6f1c');
    expect(clipTarget('file:work/a.org::*X')).toBe('file:work/a.org::*X');
    expect(clipTarget('[[id:6f1c][Ревью]]')).toBe('id:6f1c');
    expect(clipTarget('[[https://x.ru]]')).toBe('https://x.ru');
    expect(clipTarget('просто текст')).toBeNull();
    expect(clipTarget('https://a.ru\nhttps://b.ru')).toBeNull();
    expect(clipTarget('see https://a.ru')).toBeNull();
  });
  it('a file: path from the root is made relative to the file it goes into', () => {
    expect(relTarget('file:work/billing.org::*Ревью', 'work/platform.org')).toBe('file:billing.org::*Ревью');
    expect(relTarget('file:people/smirnov.org', 'work/platform.org')).toBe('file:../people/smirnov.org');
    expect(relTarget('file:work/a.org', 'inbox.org')).toBe('file:work/a.org');
    expect(relTarget('file:/abs/a.org', 'work/b.org')).toBe('file:/abs/a.org');
    expect(relTarget('https://x.ru', 'work/b.org')).toBe('https://x.ru');
  });
});

describe('⌘V on a selection', () => {
  const T = 'План в документе миграции, ответственный — Олег.';
  const at = (s: string) => [T.indexOf(s), T.indexOf(s) + s.length] as const;
  it('the selection becomes the label; the caret after the link', () => {
    const [a, b] = at('документе миграции');
    const r = linkPaste(T, a, b, 'https://wiki/dc')!;
    expect(T.slice(0, r.from) + r.insert + T.slice(r.to)).toBe('План в [[https://wiki/dc][документе миграции]], ответственный — Олег.');
    expect(r.caret).toBe(a + r.insert.length);
  });
  it('an Org link in the clipboard gives only its target', () => {
    const [a, b] = at('Олег');
    expect(linkPaste(T, a, b, '[[id:42][Олег Смирнов]]')!.insert).toBe('[[id:42][Олег]]');
  });
  it('an ordinary paste: nothing selected, two lines, not a link, across a link, brackets', () => {
    expect(linkPaste(T, 3, 3, 'https://x')).toBeNull();
    expect(linkPaste('а\nб', 0, 3, 'https://x')).toBeNull();
    expect(linkPaste(T, 0, 4, 'слово')).toBeNull();
    const L = 'см. [[https://a][доку]] тут';
    expect(linkPaste(L, 0, 8, 'https://x')).toBeNull(); // across the link's edge
    expect(linkPaste('a [[b c', 0, 7, 'https://x')).toBeNull();
  });
  it('the exact label of a link: only its target changes', () => {
    const L = 'см. [[https://a][доку]] тут';
    const a = L.indexOf('доку');
    const r = linkPaste(L, a, a + 4, 'https://b')!;
    expect(L.slice(0, r.from) + r.insert + L.slice(r.to)).toBe('см. [[https://b][доку]] тут');
  });
  it('a heading\'s link from the root, relative where it goes', () => {
    const r = linkPaste(T, 0, 4, '[[file:work/billing.org::*Ревью][Ревью]]', 'work/platform.org')!;
    expect(r.insert).toBe('[[file:billing.org::*Ревью][План]]');
  });
});

describe('a link to a heading', () => {
  it('by ID or by title; the label without the cookie', () => {
    expect(labelOf({ title: 'Чек-лист [2/5]' })).toBe('Чек-лист');
    expect(headingLink({ title: 'Ревью архитектуры' }, { id: 'abc' })).toBe('[[id:abc][Ревью архитектуры]]');
    expect(headingLink({ title: 'Чек-лист [2/5]' }, { file: 'work/p.org' })).toBe('[[file:work/p.org::*Чек-лист][Чек-лист]]');
  });
});
