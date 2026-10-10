import { describe, expect, it } from 'vitest';
import { displayName, displayPath, inTabs, noteName, withOrg } from './names';

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

describe('the name of a new note', () => {
  it('is its first non-empty line without stars', () => {
    expect(noteName('\n  \n** TODO Идеи для ретро\nтекст')).toBe('TODO Идеи для ретро');
    expect(noteName('просто текст')).toBe('просто текст');
    expect(noteName(' \n\t\n')).toBe('Без названия');
    expect(noteName('***')).toBe('Без названия');
  });
  it('is cut to 40 characters with an ellipsis', () => {
    const n = noteName('Очень длинная первая строка заметки, которая не помещается в заголовок');
    expect([...n].length).toBe(40);
    expect(n.endsWith('…')).toBe(true);
    expect(noteName('x'.repeat(40))).toBe('x'.repeat(40));
  });
  it('counts tabs in Russian', () => {
    expect(inTabs(2)).toBe('2 вкладках');
    expect(inTabs(5)).toBe('5 вкладках');
    expect(inTabs(11)).toBe('11 вкладках');
    expect(inTabs(21)).toBe('21 вкладке');
  });
});
