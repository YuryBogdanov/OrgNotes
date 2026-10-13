import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A call of the window's API the capabilities do not allow is refused by Tauri without a sound: the traffic lights of
// full screen did nothing (`setFullscreen`), nor a double click on the toolbar (`toggleMaximize`). Every call made by
// the window must be allowed.

const SRC = new URL('.', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|svelte)$/.test(n) && !n.endsWith('.test.ts') ? [p] : [];
  });
/** Calls on the current window (`getCurrentWindow().setFullscreen(…)`, `(await win()).setSize(…)`). */
function calls(): Set<string> {
  const out = new Set<string>();
  for (const f of files(SRC)) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/getCurrentWindow\(\)\s*\)?\s*\.\s*([a-zA-Z]+)\(/g)) out.add(m[1]);
    for (const m of t.matchAll(/\(await win\(\)\)\.([a-zA-Z]+)\(/g)) out.add(m[1]);
  }
  return out;
}
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

describe('the capabilities of the window', () => {
  it('allow every call the window makes', () => {
    const caps = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8')).permissions as string[];
    const found = calls();
    expect(found).toContain('setFullscreen');
    const missing = [...found].filter((c) => !caps.includes(`core:window:allow-${kebab(c)}`));
    expect(missing).toEqual([]);
  });
});
