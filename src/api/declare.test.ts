import { describe, expect, it } from 'vitest';
import { builtinEntries, installedEntries } from './declare';

const m = (o: object = {}) => JSON.stringify({ id: 'jira', name: 'Jira', version: '1.0.0', api: '^1.0', ...o });

describe('the installed plugins', () => {
  it('come in off; on when chosen; what is wrong is said', () => {
    const list = [
      { dir: 'jira', manifest: m() },
      { dir: 'bad', manifest: '{' },
      { dir: 'empty', manifest: null },
      { dir: 'other', manifest: m({ id: 'other', name: 'Иное', api: '^2.0' }) },
      { dir: 'wrong-dir', manifest: m({ id: 'named' , name: 'Имя' }) },
      { dir: 'hello', manifest: m({ id: 'hello', name: 'Свой привет' }) },
    ];
    const off = installedEntries(list, builtinEntries, {});
    const by = (d: string) => off.find((e) => e.dir === d)!;
    expect(by('jira')).toMatchObject({ enabled: false, problems: [] });
    expect(by('bad').problems).toEqual(['manifest.json — не JSON']);
    expect(by('empty').problems).toEqual(['в папке нет manifest.json']);
    expect(by('other').problems).toEqual(['нужно API 2.0, в приложении 1.7.0']);
    expect(by('wrong-dir').problems).toEqual(['id «named» не совпадает с папкой «wrong-dir»']);
    expect(by('hello').problems).toEqual(['id «hello» занят встроенным плагином']);
    expect(installedEntries(list, builtinEntries, { jira: true, other: true }).filter((e) => e.enabled).map((e) => e.dir)).toEqual(['jira']);
  });
  it('the built-in example is there, off by default', () => {
    expect(builtinEntries.find((e) => e.dir === 'hello')).toMatchObject({ builtin: true, enabled: false, problems: [] });
  });
});
