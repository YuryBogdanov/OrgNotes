import { describe, expect, it } from 'vitest';
import { displayName, displayPath, withOrg } from './names';

describe('file names without .org', () => {
  it('drops only the final .org', () => {
    expect(displayName('Регулярные встречи/Планёрка тимлидов.org')).toBe('Планёрка тимлидов');
    expect(displayName('report.v2.org')).toBe('report.v2');
    expect(displayName('notes.txt')).toBe('notes.txt');
    expect(displayPath('Команда/Рост/Сергей Белов.org')).toEqual(['Команда', 'Рост', 'Сергей Белов']);
  });
  it('adds .org once', () => {
    expect(withOrg('Привет')).toBe('Привет.org');
    expect(withOrg('Привет.org')).toBe('Привет.org');
    expect(withOrg('report.v2')).toBe('report.v2.org');
  });
});
