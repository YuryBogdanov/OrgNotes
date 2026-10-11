import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, parseHeadings } from './org';
import { caretAfter, fileRows, initialOpen, keyOf, moveTo, moveWithin, place, plural, relevel, treeRows } from './refile';

const hs = (t: string) => parseHeadings(t, DEFAULT_WORKFLOW);

const FINANCE = [
  '#+TITLE: Финансы',
  '* Бюджеты',
  '** Бюджет 2026',
  '*** Заявки',
  '*** Расходы',
  '** DONE Бюджет 2025 :archive:',
  '*** Итоги',
  '** Шаблоны и правила',
  '* Отчётность',
  '** Квартальные отчёты',
  '*** TODO Отчёт за Q3 :report:',
  '*** NEXT Отчёт за Q4 :report:',
  '** Аудит 2026',
  '* Закупки',
  '** Отчёты поставщиков',
  '',
].join('\n');

describe('step 1: files', () => {
  const files = [
    { path: '/n/Работа/Финансы/finance.org', name: 'Работа/Финансы/finance.org' },
    { path: '/n/Работа/work.org', name: 'Работа/work.org' },
    { path: '/n/inbox.org', name: 'inbox.org' },
    { path: '/n/Команда/hiring.org', name: 'Команда/hiring.org' },
    { path: '/n/journal.org', name: 'journal.org' },
  ];
  it('recent first (up to 5, gone ones skipped), then all the others by path; the excluded file is left out', () => {
    const r = fileRows(files, { q: '', exclude: '/n/inbox.org', recent: ['/n/journal.org', '/n/gone.org', '/n/Работа/Финансы/finance.org', '/n/journal.org'], root: 'notes' });
    expect(r.map((x) => [x.group, x.label, x.sub])).toEqual([
      ['НЕДАВНИЕ', 'journal', 'notes'],
      ['НЕДАВНИЕ', 'finance', 'Работа › Финансы'],
      ['ВСЕ ФАЙЛЫ', 'hiring', 'Команда'],
      ['ВСЕ ФАЙЛЫ', 'work', 'Работа'],
    ]);
  });
  it('a query: one group, a match in the name above a match in the path; the own file is marked', () => {
    const r = fileRows(files, { q: 'раб', recent: [], root: 'notes', self: '/n/Работа/work.org' });
    expect(r.map((x) => x.label)).toEqual(['finance', 'work']); // both only by the path «Работа»
    const w = fileRows(files, { q: 'fin', recent: [], root: 'notes' });
    expect(w[0]).toMatchObject({ label: 'finance', group: 'ФАЙЛЫ', at: [0, 1, 2] });
    expect(fileRows(files, { q: 'wor', recent: [], root: 'n', self: '/n/Работа/work.org' })[0].self).toBe(true);
    expect(fileRows(files, { q: 'zzz', recent: [], root: 'n' })).toEqual([]);
  });
});

describe('step 2: the tree', () => {
  const h = hs(FINANCE);
  const title = (i: number) => h[i].title;
  it('at first the 1st level is open, and the way to the last place moved to', () => {
    const open = initialOpen(h);
    const { rows } = treeRows(h, open, '');
    expect(rows.map((r) => [title(r.i), r.depth, r.open, r.kids])).toEqual([
      ['Бюджеты', 0, true, 3],
      ['Бюджет 2026', 1, false, 2],
      ['Бюджет 2025', 1, false, 1],
      ['Шаблоны и правила', 1, false, 0],
      ['Отчётность', 0, true, 2],
      ['Квартальные отчёты', 1, false, 2],
      ['Аудит 2026', 1, false, 0],
      ['Закупки', 0, true, 1],
      ['Отчёты поставщиков', 1, false, 0],
    ]);
    const deep = treeRows(h, initialOpen(h, keyOf(h[9])), '').rows.map((r) => title(r.i));
    expect(deep).toContain('Отчёт за Q3');
  });
  it('a search: matches with their ancestors, the ancestors dimmed, everything on the way open', () => {
    const { rows, matches } = treeRows(h, new Set(), 'отч');
    expect(matches).toBe(5);
    expect(rows.map((r) => [title(r.i), r.dim, r.open])).toEqual([
      ['Отчётность', false, true],
      ['Квартальные отчёты', false, true],
      ['Отчёт за Q3', false, false],
      ['Отчёт за Q4', false, false],
      ['Закупки', true, true],
      ['Отчёты поставщиков', false, false],
    ]);
    expect(rows[1].at).toEqual([12, 13, 14]);
  });
  it('the heading being moved and what is inside it cannot be chosen', () => {
    const { rows } = treeRows(h, new Set([keyOf(h[0]), keyOf(h[1])]), '', { line: h[1].line, end: h[1].end });
    expect(rows.filter((r) => r.blocked).map((r) => title(r.i))).toEqual(['Бюджет 2026', 'Заявки', 'Расходы']);
  });
  it('plurals', () => {
    expect([1, 2, 5, 11, 21, 22].map((n) => plural(n, 'совпадение', 'совпадения', 'совпадений'))).toEqual(['совпадение', 'совпадения', 'совпадений', 'совпадений', 'совпадение', 'совпадения']);
  });
});

describe('moving the text', () => {
  const SRC = ['* Q4 2026', '** TODO [#A] Бюджет 2027 :budget:', 'DEADLINE: <2026-10-24 Sat>', ':PROPERTIES:', ':CREATED: [2026-10-01 Wed 10:00]', ':END:', '#+BEGIN_SRC', '* не заголовок', '#+END_SRC', '', '*** DONE Заявки', '**** Детали', '** Найм', ''].join('\n');
  const s = hs(SRC);
  it('levels follow the new root; only real headings change, the rest goes as it was', () => {
    const tree = SRC.split('\n').slice(s[1].line, s[1].end);
    expect(relevel(tree, 2, 3)).toEqual(['*** TODO [#A] Бюджет 2027 :budget:', 'DEADLINE: <2026-10-24 Sat>', ':PROPERTIES:', ':CREATED: [2026-10-01 Wed 10:00]', ':END:', '#+BEGIN_SRC', '* не заголовок', '#+END_SRC', '', '**** DONE Заявки', '***** Детали']);
    expect(relevel(tree, 2, 1)[9]).toBe('** DONE Заявки');
  });
  it('under a heading: the last child, after its last descendant and before the blank lines ending it', () => {
    const d = hs(FINANCE);
    const r = moveTo(SRC, s[1], FINANCE, d[0]); // under «Бюджеты» (level 1)
    const out = r.dst.split('\n');
    expect(out[r.line]).toBe('** TODO [#A] Бюджет 2027 :budget:');
    expect(out[r.line - 1]).toBe('** Шаблоны и правила');
    expect(out[r.line + 9]).toBe('*** DONE Заявки');
    expect(out[r.line + 11]).toBe('* Отчётность');
    expect(r.src).toBe('* Q4 2026\n** Найм\n');
  });
  it('to the 1st level: at the end of the file, a line break before it ensured', () => {
    const r = moveTo(SRC, s[2], '* Архив', null);
    expect(r.dst).toBe('* Архив\n* DONE Заявки\n** Детали\n');
    expect(r.line).toBe(1);
    expect(place('', ['* A'], null)).toEqual({ text: '* A\n', line: 0 });
    // under the last heading of a file without a final line break
    expect(place('* A\ntext', ['** B'], { line: 0, end: 2 })).toEqual({ text: '* A\ntext\n** B\n', line: 2 });
    // blank lines ending the target's subtree stay after the new child
    expect(place('* A\n** x\n\n* B\n', ['** C'], { line: 0, end: 3 }).text).toBe('* A\n** x\n** C\n\n* B\n');
  });
  it('within one file: up, down, under its own ancestor, to the end; never inside itself', () => {
    const t = '* A\n** a1\n** a2\n*** a2x\n* B\n** b1\n';
    const h = hs(t);
    expect(moveWithin(t, h[1], h[4])).toEqual({ text: '* A\n** a2\n*** a2x\n* B\n** b1\n** a1\n', line: 5 });
    expect(moveWithin(t, h[5], h[0])).toEqual({ text: '* A\n** a1\n** a2\n*** a2x\n** b1\n* B\n', line: 4 });
    expect(moveWithin(t, h[1], h[0]).text).toBe('* A\n** a2\n*** a2x\n** a1\n* B\n** b1\n');
    expect(moveWithin(t, h[2], null)).toEqual({ text: '* A\n** a1\n* B\n** b1\n* a2\n** a2x\n', line: 4 });
    expect(() => moveWithin(t, h[2], h[3])).toThrow();
  });
  it('the caret goes to the next heading in its place, else the one before', () => {
    const t = hs('* A\n* B\n* C\n');
    expect(caretAfter(t, 1)).toBe(1);
    expect(caretAfter(t, 3)).toBe(2);
    expect(caretAfter([], 3)).toBe(0);
  });
});
