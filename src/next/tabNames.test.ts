import { describe, expect, it } from 'vitest';
import { tabNames } from './tabNames';

describe('the names of the file tabs (ТЗ 44 §11)', () => {
  it('the name without `.org`, no hint while unique', () => {
    expect(tabNames(['Команда/Безопасность/Ольга Петрова.org', 'Midterm.org'])).toEqual([
      { name: 'Ольга Петрова', hint: '' },
      { name: 'Midterm', hint: '' },
    ]);
  });
  it('the same names: the nearest folder that tells them apart', () => {
    expect(tabNames(['Команда/Безопасность/Ольга Петрова.org', 'Команда/Платформа/Ольга Петрова.org']).map((x) => x.hint)).toEqual(['Безопасность', 'Платформа']);
  });
  it('the nearest the same: the next one up', () => {
    expect(tabNames(['A/1on1/gleb.org', 'B/1on1/gleb.org']).map((x) => x.hint)).toEqual(['A', 'B']);
  });
  it('a file in the root: «корень»', () => {
    expect(tabNames(['inbox.org', 'Архив/inbox.org']).map((x) => x.hint)).toEqual(['корень', 'Архив']);
  });
  it('the same file in two tabs is not a clash', () => {
    expect(tabNames(['a/x.org', 'a/x.org']).map((x) => x.hint)).toEqual(['', '']);
  });
  it('three of a name: each its own', () => {
    expect(tabNames(['p/q/n.org', 'r/q/n.org', 's/n.org']).map((x) => x.hint)).toEqual(['p', 'r', 's']);
  });
});
