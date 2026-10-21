import { describe, expect, it } from 'vitest';
import { parseHeadings, workflow } from '@panopticon/api/org';
import { autoLayout, blocksOf, deckOf, gridBoxes, imageLink, isDeck, resolveImage } from './model';

const WF = workflow({ open: ['TODO', 'NEXT'], done: ['DONE'] });
const deck = (t: string) => deckOf(t, parseHeadings(t, WF));

const FILE = [
  '#+TITLE: Ищем тимлида в Платформу',
  '#+PRESENT: 16:9',
  '',
  '* Ищем тимлида в Платформу',
  ':PROPERTIES:',
  ':LAYOUT: title',
  ':KICKER: Команда платформы · октябрь 2026',
  ':END:',
  'Юрий Богданов, руководитель направления',
  '',
  '* TODO Кого ищем :team:',
  ':PROPERTIES:',
  ':KICKER: Команда',
  ':END:',
  '- 6 человек: бэкенд и инфраструктура',
  '- Главное на полгода — переезд хранилища',
  '[[file:img/team.png]]',
  '** Заметки',
  'Сказать про переезд честно:',
  'срок Q1.',
  '* Черновик :noexport:',
  'не показывать',
  '* COMMENT Старое',
  '* Что будет делать',
  ':PROPERTIES:',
  ':LAYOUT: free',
  ':END:',
  '** Люди',
  ':PROPERTIES:',
  ':BOX: 7 40 40 26',
  ':STYLE: card',
  ':END:',
  '1-1, найм, рост.',
  '** Схема',
  ':PROPERTIES:',
  ':FIT: contain',
  ':END:',
  '[[img/roadmap.png]]',
  '* Цитата',
  '#+begin_quote',
  'Лучше меньше,',
  'да лучше.',
  '#+end_quote',
  '— Ленин',
  '',
].join('\n');

describe('a deck', () => {
  it('its title, ratio, slides — level 1, noexport and COMMENT left out; status and tags not on the slide', () => {
    const d = deck(FILE);
    expect(d.title).toBe('Ищем тимлида в Платформу');
    expect(d.ratio).toBe('16:9');
    expect(d.slides.map((s) => s.title)).toEqual(['Ищем тимлида в Платформу', 'Кого ищем', 'Что будет делать', 'Цитата']);
    expect(deck('#+PRESENT: 4:3\n* A\n').ratio).toBe('4:3');
    expect(isDeck(FILE)).toBe(true);
    expect(isDeck('* A\n')).toBe(false);
  });
  it('the layouts: set, else by the content (§3.1)', () => {
    const [a, b, c, q] = deck(FILE).slides;
    expect([a.set, a.layout, a.kicker]).toEqual(['title', 'title', 'Команда платформы · октябрь 2026']);
    expect([b.set, b.layout]).toEqual([null, 'text-image']);
    expect(c.layout).toBe('free');
    expect(q.layout).toBe('quote');
    expect(autoLayout(true, [])).toBe('title');
    expect(autoLayout(false, [{ kind: 'image', path: 'a.png' }])).toBe('image');
    expect(autoLayout(false, [{ kind: 'p', text: 'x' }])).toBe('text');
  });
  it('the notes: the subheading «Заметки», not on the slide', () => {
    const b = deck(FILE).slides[1];
    expect(b.notes).toMatchObject({ title: 'Заметки', text: 'Сказать про переезд честно:\nсрок Q1.' });
    expect(b.blocks.map((x) => x.kind)).toEqual(['list', 'image']);
  });
  it('the blocks of a free slide: BOX, STYLE, FIT; none — null', () => {
    const c = deck(FILE).slides[2];
    expect(c.boxes.map((x) => [x.title, x.box, x.style, x.fit])).toEqual([
      ['Люди', [7, 40, 40, 26], 'card', 'cover'],
      ['Схема', null, 'plain', 'contain'],
    ]);
  });
});

describe('the text of a slide', () => {
  it('paragraphs, lists of two levels, a table, a rule, code; drawers and comments left out', () => {
    const b = blocksOf(['Первый абзац', 'продолжение.', '', '- раз', '  - два', '  ещё', '1. три', '-----', '| a | b |', '|---+---|', '| 1 | 2 |', '# комментарий', '#+begin_src js', '  x = 1', '#+end_src']);
    expect(b).toEqual([
      { kind: 'p', text: 'Первый абзац продолжение.' },
      { kind: 'list', items: [{ level: 1, ordered: false, text: 'раз' }, { level: 2, ordered: false, text: 'два ещё' }, { level: 1, ordered: true, text: 'три' }] },
      { kind: 'hr' },
      { kind: 'table', rows: [['a', 'b'], ['1', '2']] },
      { kind: 'code', text: 'x = 1' },
    ]);
  });
  it('an image link alone; its path from the file\'s folder', () => {
    expect(['[[file:img/a.png]]', '[[./img/a.png]]', '[[img/a.png][подпись]]', '[[https://x.ru/a.png]]', '[[a.org]]'].map(imageLink)).toEqual(['img/a.png', './img/a.png', 'img/a.png', null, null]);
    expect(resolveImage('Проекты/deck.org', './img/a.png')).toBe('Проекты/img/a.png');
    expect(resolveImage('Проекты/deck.org', '../img/a.png')).toBe('img/a.png');
    expect(resolveImage('deck.org', '../a.png')).toBeNull();
  });
  it('blocks with no BOX: two columns under the title', () => {
    expect(gridBoxes(3)).toEqual([[7, 30, 41, 27], [52, 30, 41, 27], [7, 61, 41, 27]]);
  });
});
