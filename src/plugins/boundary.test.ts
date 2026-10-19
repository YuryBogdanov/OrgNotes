import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

// ТЗ 26 §2: a built-in plugin sees only the API. Its files import `@panopticon/api`, its own files, svelte — nothing
// of the core. This test is the rule (ESLint's import rules do not know which plugin a file belongs to).

const ROOT = resolve(__dirname);
// and a library a plugin bundles itself, as an outside one would (the terminal's xterm, ТЗ 55)
const ALLOWED = [/^@panopticon\/api(\/org)?$/, /^svelte(\/.*)?$/, /^@xterm\/[\w-]+(\/css\/xterm\.css)?$/];
const SOURCE = /\.(ts|js|svelte)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : SOURCE.test(n) && !n.endsWith('.test.ts') ? [p] : [];
  });
}
/** What a source imports (static, dynamic, re-exports). */
export function importsOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|[;\s])(?:import|export)\s+(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}
/** Why an import breaks the rule; null when it does not. */
export function breaks(file: string, spec: string): string | null {
  if (ALLOWED.some((r) => r.test(spec))) return null;
  if (!spec.startsWith('.')) return `«${spec}»: только @panopticon/api, svelte и библиотеки плагина`;
  const plugin = relative(ROOT, file).split(/[\\/]/)[0];
  const target = relative(join(ROOT, plugin), resolve(dirname(file), spec));
  return target.startsWith('..') ? `«${spec}»: файл вне папки плагина` : null;
}

describe('the boundary of the plugins', () => {
  it('a built-in plugin imports only the API, svelte and its own files', () => {
    const wrong = files(ROOT).flatMap((f) => importsOf(readFileSync(f, 'utf8')).map((s) => breaks(f, s)).filter(Boolean).map((w) => `${relative(ROOT, f)}: ${w}`));
    expect(wrong).toEqual([]);
  });
  it('catches the core imported directly', () => {
    const f = join(ROOT, 'hello', 'main.ts');
    const text = "import { store } from '../../store.svelte';\nimport x from 'svelte/store';\nconst m = import('../other/main');\nimport './styles.css';\n";
    expect(importsOf(text).map((s) => breaks(f, s))).toEqual(['«../../store.svelte»: файл вне папки плагина', null, null, '«../other/main»: файл вне папки плагина']); // the dynamic ones last
    expect(breaks(f, '@tauri-apps/api/core')).toBe('«@tauri-apps/api/core»: только @panopticon/api, svelte и библиотеки плагина');
  });
});
