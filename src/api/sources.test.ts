import { describe, expect, it } from 'vitest';
import { cmpVersion, codeUrl, newerTag, parseSource, shortUrl, sourceLabel } from './sources';

describe('the source of a plugin (ТЗ 37)', () => {
  it('reads .source.json of the catalog and of git; anything else is a plugin put by hand', () => {
    expect(parseSource('{"kind":"catalog","repo":"a/b","version":"0.3.0","installed":1}')).toEqual({ kind: 'catalog', repo: 'a/b', version: '0.3.0' });
    expect(parseSource('{"kind":"git","url":"git@h:t/o.git","track":"branch","ref":"main","commit":"abc","checkUpdates":false}')).toEqual({ kind: 'git', url: 'git@h:t/o.git', track: 'branch', ref: 'main', commit: 'abc', checkUpdates: false });
    expect(parseSource(null)).toBeNull();
    expect(parseSource('{"kind":"zip"}')).toBeNull();
    expect(parseSource('not json')).toBeNull();
  });
  it('versions: «v» aside, a pre-release below its release; the newest release tag newer than the installed', () => {
    expect(cmpVersion('v2.0.10', '2.0.9')).toBeGreaterThan(0);
    expect(cmpVersion('1.2', '1.2.0')).toBe(0);
    expect(cmpVersion('2.0.0-beta', '2.0.0')).toBeLessThan(0);
    expect(cmpVersion('nightly', '0.0.1')).toBeLessThan(0);
    const tags: [string, string][] = [['v2.1.0-rc1', 'a'], ['v2.0.1', 'b'], ['v1.9.0', 'c'], ['nightly', 'd']];
    expect(newerTag(tags, '2.0.0')).toBe('v2.0.1');
    expect(newerTag(tags, '2.0.1')).toBeNull();
  });
  it('a link as the list shows it, and its page', () => {
    expect(shortUrl('git@git.company.local:team/panopticon-okr.git')).toBe('git.company.local/team/panopticon-okr');
    expect(shortUrl('https://git.company.local/team/panopticon-okr.git')).toBe('git.company.local/team/panopticon-okr');
    expect(shortUrl('ssh://git@host:2222/a/b.git')).toBe('host/a/b');
    expect(sourceLabel({ kind: 'catalog', repo: 'a/b', version: '1' })).toBe('из каталога');
    expect(sourceLabel(null)).toBe('из папки');
    expect(codeUrl({ kind: 'catalog', repo: 'YuryBogdanov/panopticon-week', version: '1' })).toBe('https://github.com/YuryBogdanov/panopticon-week');
    expect(codeUrl({ kind: 'git', url: 'git@github.com:a/b.git', track: 'tag', ref: 'v1', commit: '', checkUpdates: true })).toBe('https://github.com/a/b');
  });
});
