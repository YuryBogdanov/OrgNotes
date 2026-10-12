import { describe, expect, it } from 'vitest';
import { keysOf, optOf, optValue, whereOfGroup, type Group } from './settingsSchema';

const g = (fields: Group['fields']): Group => ({ caption: 'X', fields });

describe('settings by schema (roadmap 0.6)', () => {
  it('splits the keys by where they are kept; a pair gives both', () => {
    const s = { groups: [g([{ key: 'a', type: 'switch', where: 'folder', label: 'A' }, { key: 'from', key2: 'to', type: 'pair', where: 'local', label: 'Ч', labels: ['С', 'До'], options: () => [[], []] }])] };
    expect(keysOf(s, 'folder')).toEqual(['a']);
    expect(keysOf(s, 'local')).toEqual(['from', 'to']);
  });
  it('says where a group is kept only when all its fields are in one place', () => {
    expect(whereOfGroup(g([{ key: 'a', type: 'switch', where: 'local', label: 'A' }]))).toBe('local');
    expect(whereOfGroup(g([{ key: 'a', type: 'switch', where: 'local', label: 'A' }, { key: 'b', type: 'switch', where: 'folder', label: 'B' }]))).toBeNull();
  });
  it('a menu keeps the option\'s type: numbers, texts, unset', () => {
    const opts = [{ value: null, label: '—' }, { value: 21, label: '21 день' }, { value: 'TODO', label: 'TODO' }];
    expect(opts.map((o) => optValue(o.value))).toEqual(['', '21', 'TODO']);
    expect(optOf(opts, '21')).toBe(21);
    expect(optOf(opts, '')).toBeNull();
    expect(optOf(opts, 'TODO')).toBe('TODO');
  });
});
