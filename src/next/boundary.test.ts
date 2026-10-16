import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

// ТЗ 42 §2: the boundary of the new interface — `npm run lint` fails on an old component imported in `src/next/`
// (not through bridges.ts), and on `src/next/` imported by the old code.

const eslint = new ESLint();
const errors = async (code: string, filePath: string) => (await eslint.lintText(code, { filePath }))[0].messages.filter((m) => m.ruleId === 'no-restricted-imports').length;

describe('the boundary of src/next', () => {
  it('next/ takes the modules of src/, not the old components', async () => {
    expect(await errors("import { store } from '../store.svelte';\nimport { org } from '../org';\nvoid store; void org;\n", 'src/next/Probe.ts')).toBe(0);
    expect(await errors("import S from '../Settings.svelte';\nvoid S;\n", 'src/next/Probe.ts')).toBe(1);
    expect(await errors("import P from '../plugins/inbox/Panel.svelte';\nvoid P;\n", 'src/next/Probe.ts')).toBe(1);
  });
  it('bridges.ts may; the old code never imports next/', async () => {
    expect(await errors("export { default as S } from '../Settings.svelte';\n", 'src/next/bridges.ts')).toBe(0);
    expect(await errors("import N from './next/App.svelte';\nvoid N;\n", 'src/Probe.ts')).toBe(1);
  });
});
