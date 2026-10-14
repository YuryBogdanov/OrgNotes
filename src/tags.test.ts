import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';
import { bareTag, foundText, headingsWith, oftenWith, perFile, retag, sortTags, tagCounts, tagOk, tagsOf, type TagFile } from './tags';

const file = (name: string, text: string, filetags: string[] = []): TagFile => ({ name, headings: parseHeadings(text, DEFAULT_WORKFLOW), filetags });
const P = file('platform.org', ['* Инфраструктура :infra:', '** TODO Обновить Kafka', '** NEXT Переезд в новый ДЦ :dc:', '*** TODO Учения по откату', '* 1-1 :1on1:', '** TODO План дежурств', ''].join('\n'));
const W = file('work.org', ['* NEXT Бюджет на второй ДЦ :infra:dc:budget:', '* TODO Отчёт', ''].join('\n'), ['work']);

describe('tags (ТЗ 38)', () => {
  it('counts the tags set on headings (not inherited); #+FILETAGS listed with 0; by count or by name', () => {
    const c = tagCounts([P, W]);
    expect(sortTags(c, 'count').map((x) => `${x.tag} ${x.n}`)).toEqual(['dc 2', 'infra 2', '1on1 1', 'budget 1', 'work 0']);
    expect(sortTags(c, 'name').map((x) => x.tag)).toEqual(['1on1', 'budget', 'dc', 'infra', 'work']);
  });
  it('a heading\'s tags: its own, its parents\' (nearest first) with their titles, the file\'s; «не наследовать»', () => {
    expect(tagsOf(P, 3)).toEqual([{ tag: 'dc', from: 'parent', parent: 'Переезд в новый ДЦ' }, { tag: 'infra', from: 'parent', parent: 'Инфраструктура' }]);
    expect(tagsOf(W, 1)).toEqual([{ tag: 'work', from: 'file' }]);
    expect(tagsOf(P, 5, new Set(['1on1']))).toEqual([]);
    expect(tagsOf(P, 4, new Set(['1on1']))).toEqual([{ tag: '1on1', from: 'own' }]); // its own one stays
  });
  it('headings with all the tags (И), with and without inheritance; the files with more first', () => {
    const t = (r: ReturnType<typeof headingsWith>) => r.map((g) => `${g.file.name}: ${g.hits.map((x) => x.h.title).join(', ')}`);
    expect(t(headingsWith([P, W], ['infra']))).toEqual(['platform.org: Инфраструктура, Обновить Kafka, Переезд в новый ДЦ, Учения по откату', 'work.org: Бюджет на второй ДЦ']);
    expect(t(headingsWith([P, W], ['infra'], false))).toEqual(['platform.org: Инфраструктура', 'work.org: Бюджет на второй ДЦ']);
    expect(t(headingsWith([P, W], [':INFRA:'.replace(/:/g, ''), 'dc']))).toEqual(['platform.org: Переезд в новый ДЦ, Учения по откату', 'work.org: Бюджет на второй ДЦ']);
    expect(headingsWith([P, W], [])).toEqual([]);
  });
  it('often with; the summary; a name Org takes', () => {
    const found = headingsWith([P, W], ['infra']);
    expect(oftenWith(found, ['infra'])).toEqual([{ tag: 'dc', n: 3 }, { tag: 'budget', n: 1 }, { tag: 'work', n: 1 }]);
    expect(foundText(found)).toBe('5 заголовков в 2 файлах');
    expect(foundText([{ hits: [found[1].hits[0]] }])).toBe('1 заголовок в 1 файле');
    expect(tagOk('dc_2@#%') && !tagOk('a b') && !tagOk('a:b') && !tagOk('')).toBe(true);
    expect(bareTag(' :infra: ')).toBe('infra');
  });
});

describe('renaming and removing a tag (ТЗ 38 B)', () => {
  const T = ['#+FILETAGS: :infra:work:', '* Инфраструктура        :infra:', '** TODO Переезд :infra:platform:', '#+BEGIN_SRC org', '* пример :infra:', '#+END_SRC', '* Другое :dc:', ''].join('\n');
  const lines = (t: string) => parseHeadings(t, DEFAULT_WORKFLOW).map((h) => h.line);
  it('renamed in the headings (the spaces kept; twice — once) and in #+FILETAGS; a block untouched', () => {
    const r = retag(T, lines(T), 'INFRA', 'platform');
    expect(r.n).toBe(2);
    expect(r.file).toBe(true);
    expect(r.text).toBe(['#+FILETAGS: :platform:work:', '* Инфраструктура        :platform:', '** TODO Переезд :platform:', '#+BEGIN_SRC org', '* пример :infra:', '#+END_SRC', '* Другое :dc:', ''].join('\n'));
  });
  it('removed: the last tag of a heading takes its spaces with it', () => {
    const r = retag(T, lines(T), 'infra', null);
    expect(r.text.split('\n').slice(0, 3)).toEqual(['#+FILETAGS: :work:', '* Инфраструктура', '** TODO Переезд :platform:']);
    expect(retag('#+FILETAGS: :infra:\n', [], 'infra', null).text).toBe('#+FILETAGS:\n');
  });
  it('the files by how many change', () => {
    expect(perFile([{ name: 'a.org', n: 1 }, { name: 'b.org', n: 9 }, { name: 'c.org', n: 5 }, { name: 'd.org', n: 3 }, { name: 'e.org', n: 2 }, { name: 'f.org', n: 2 }, { name: 'g.org', n: 0 }]))
      .toBe('b.org 9 · c.org 5 · d.org 3 · e.org 2 · ещё 2 файла');
  });
});
