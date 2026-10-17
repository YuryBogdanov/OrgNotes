import { API_VERSION } from './index';
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
    expect(by('other').problems).toEqual([`нужно API 2.0, в приложении ${API_VERSION}`]);
    expect(by('wrong-dir').problems).toEqual(['id «named» не совпадает с папкой «wrong-dir»']);
    expect(by('hello').problems).toEqual(['id «hello» занят встроенным плагином']);
    expect(installedEntries(list, builtinEntries, { jira: true, other: true }).filter((e) => e.enabled).map((e) => e.dir)).toEqual(['jira']);
  });
  it('the built-in example is there, off by default', () => {
    expect(builtinEntries.find((e) => e.dir === 'hello')).toMatchObject({ builtin: true, enabled: false, problems: [] });
  });
});

describe('the keys of a card\'s actions (ТЗ 44 §9)', () => {
  it('«⌃C K <letter>» when the command has no keys of its own; a letter taken — none, and whose it is', async () => {
    const { cardChord, declareKeys } = await import('./declare');
    const { parseManifest } = await import('./manifest');
    const { KEY_COMMANDS } = await import('../keys');
    expect(cardChord({ id: 'x.a' })).toBeNull();
    const one = parseManifest({ id: 'cardone', name: 'Первый', version: '1.0.0', api: '^1.14', contributes: { commands: [{ id: 'cardone.a', title: 'Действие', cardKey: 'q' }, { id: 'cardone.b', title: 'Своё', cardKey: 'Z', keys: ['⌃⌥⌘B'] }] } });
    const two = parseManifest({ id: 'cardtwo', name: 'Второй', version: '1.0.0', api: '^1.14', contributes: { commands: [{ id: 'cardtwo.a', title: 'Другое', cardKey: 'Q' }] } });
    if (!one.ok || !two.ok) throw new Error();
    expect(one.manifest.contributes.commands[0].cardKey).toBe('Q');
    declareKeys(one.manifest);
    declareKeys(two.manifest);
    const at = (id: string) => KEY_COMMANDS.find((c) => c.id === id)!;
    expect(at('cardone.a').keys).toEqual(['⌃C K Q']);
    expect(at('cardone.b').keys).toEqual(['⌃⌥⌘B']); // its own keys win
    expect(at('cardtwo.a').keys).toEqual([]);
    expect(at('cardtwo.a').note).toBe('⌃C K Q уже у «Действие»');
    expect(parseManifest({ id: 'bad', name: 'B', version: '1.0.0', api: '^1.14', contributes: { commands: [{ id: 'bad.a', title: 'A', cardKey: 'ab' }] } }).ok).toBe(false);
  });
});
