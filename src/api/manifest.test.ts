import { describe, expect, it } from 'vitest';
import { incompatible, parseManifest, satisfies } from './manifest';

const base = { id: 'hello', name: 'Привет', version: '1.0.0', api: '^1.0' };

describe('versions', () => {
  it('reads the ranges manifests write', () => {
    expect(satisfies('1.2.0', '^1.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.0')).toBe(false);
    expect(satisfies('1.0.5', '~1.0.0')).toBe(true);
    expect(satisfies('1.1.0', '~1.0.0')).toBe(false);
    expect(satisfies('1.0.0', '1')).toBe(true);
    expect(satisfies('0.9.0', '>=1.0.0')).toBe(false);
    expect(satisfies('0.3.1', '^0.3')).toBe(true);
    expect(satisfies('0.4.0', '^0.3')).toBe(false);
  });
  it('says why a plugin cannot run', () => {
    expect(incompatible({ api: '^2.0' }, '1.0.0', '1.0.0')).toBe('нужно API 2.0, в приложении 1.0.0');
    expect(incompatible({ api: '^1.0', minAppVersion: '1.2.0' }, '1.0.0', '1.0.0')).toBe('нужно приложение 1.2.0 или новее, установлено 1.0.0');
    expect(incompatible({ api: '^1.0' }, '1.0.0', '1.0.0')).toBeNull();
  });
});

describe('parseManifest', () => {
  it('reads a whole manifest; a reserved key is left out with a warning', () => {
    const r = parseManifest({
      ...base, permissions: ['index.read'],
      contributes: {
        commands: [{ id: 'hello.greet', title: 'Привет', keys: ['⌃⌘H', '⌘S'] }],
        navSections: [{ id: 'hello', title: 'Привет', icon: 'M0 0', key: 'hello.greet' }],
        views: [{ id: 'hello.board', title: 'Доска' }],
        settings: [{ section: 'Привет', groups: [{ caption: 'X', fields: [{ key: 'n', type: 'switch', label: 'N', where: 'local' }] }] }],
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.contributes.commands[0].keys).toEqual(['⌃⌘H']);
    expect(r.manifest.warnings).toEqual(['⌘S у «Привет» занято приложением']);
    expect(r.manifest.contributes.views[0].icon).toBeTruthy();
  });
  it('says every problem at once', () => {
    const r = parseManifest({ id: 'Hello World', version: 'x', permissions: ['root'], net: ['a.ru'], contributes: { commands: [{ id: 'other.x', title: 'X' }, { id: 'other.x', title: 'Y' }] } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toEqual(expect.arrayContaining([
      expect.stringContaining('id —'), 'нет name', expect.stringContaining('version'), expect.stringContaining('нет api'),
      'неизвестное право «root»', 'net — хосты без права net', expect.stringContaining('повторяется'),
    ]));
  });
  it('the ids of the contributions start with the plugin\'s', () => {
    const r = parseManifest({ ...base, contributes: { commands: [{ id: 'goals.open', title: 'X' }] } });
    expect(r.ok ? [] : r.problems).toEqual(['команда «goals.open»: id начинается с «hello.»']);
  });
});
