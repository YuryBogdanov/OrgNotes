import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseManifest } from './manifest';

// The template of a plugin (templates/plugin, roadmap 2.3) carries a copy of the API's types: the same as the app's.
describe('the template of a plugin', () => {
  it('its copy of @panopticon/api is the app\'s', () => {
    const app = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const copy = readFileSync(new URL('../../templates/plugin/panopticon-api.ts', import.meta.url), 'utf8');
    expect(copy).toBe(app);
  });
  it('its manifest is right', () => {
    const r = parseManifest(JSON.parse(readFileSync(new URL('../../templates/plugin/manifest.json', import.meta.url), 'utf8')));
    expect(r.ok ? r.manifest.id : r.problems).toBe('example');
  });
});
