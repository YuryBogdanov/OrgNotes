import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPAT, compatVars } from './compat';
import { BLUEPRINT, PAPER } from '../appTheme';
import { TOKENS } from './tokens';
import { NAMED } from '../themes';

// ТЗ 43 §5.2: every variable app.css defines has its line in the layer — a new one there must say what it is in the
// new interface, or an old screen there draws with nothing.
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const defined = [...new Set([...css.matchAll(/(?:^|[;{\s])--([a-zA-Z][\w-]*)\s*:/g)].map((m) => m[1]))].filter((v) => !v.startsWith('ed-') && !v.startsWith('p-'));

describe('the compatibility layer (ТЗ 43 §5)', () => {
  it('has a line for every variable of app.css', () => {
    expect(defined.length).toBeGreaterThan(40);
    expect(defined.filter((v) => !(v in COMPAT))).toEqual([]);
  });
  it('a variable kept by name is a token of the new interface', () => {
    for (const [k, v] of Object.entries(COMPAT)) if (v === null) expect(k in TOKENS.light, k).toBe(true);
  });
  it('refers only to tokens there are', () => {
    for (const v of Object.values(COMPAT)) for (const m of (v ?? '').matchAll(/var\(--([\w-]+)\)/g)) expect(m[1] in TOKENS.light, m[1]).toBe(true);
  });
  it('gives the named colours of the theme: all of them (ТЗ 57)', () => {
    for (const t of [PAPER, BLUEPRINT]) for (const n of NAMED) expect(compatVars(t)).toContain(`--p-${n}:${t.palette[n]}`);
    expect(compatVars(BLUEPRINT)).toContain('--p-blue:#8ab8ff');
  });
});
