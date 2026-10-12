import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// Rust checks a plugin's rights by the manifests it has built in (lib.rs BUILTIN_MANIFESTS): every built-in plugin
// must be listed there.
describe('the built-in plugins in Rust', () => {
  it('every src/plugins/<id>/manifest.json is in BUILTIN_MANIFESTS', () => {
    const rs = readFileSync(new URL('../../src-tauri/src/lib.rs', import.meta.url), 'utf8');
    const dirs = readdirSync(new URL('../plugins/', import.meta.url), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    for (const d of dirs) expect(rs, d).toContain(`include_str!("../../src/plugins/${d}/manifest.json")`);
  });
});
