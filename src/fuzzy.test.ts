import { describe, expect, it } from 'vitest';
import { fuzzy, runs } from './fuzzy';

describe('fuzzy matching', () => {
  it('finds letters in order, ignoring case and ё', () => {
    expect(fuzzy('соз', 'Создать файл…')!.at).toEqual([0, 1, 2]);
    expect(fuzzy('сф', 'Создать файл…')!.at).toEqual([0, 8]);
    expect(fuzzy('ЕЛКА', 'ёлка')).not.toBeNull();
    expect(fuzzy('xyz', 'Создать файл…')).toBeNull();
    expect(fuzzy('фс', 'Создать файл…')).toBeNull(); // order matters
  });
  it('prefers a match at a word start, then the compact one', () => {
    const a = fuzzy('ст', 'Сменить статус…')!;
    expect(a.wordStart).toBe(true);
    expect(a.at).toEqual([8, 9]); // «ст» in «статус», not С…т across the words
    expect(fuzzy('дед', 'Поставить дедлайн…')!.at).toEqual([10, 11, 12]);
  });
  it('cuts the text into runs for bold', () => {
    expect(runs('Создать', [0, 1, 2])).toEqual([{ s: 'Соз', hit: true }, { s: 'дать', hit: false }]);
  });
});
