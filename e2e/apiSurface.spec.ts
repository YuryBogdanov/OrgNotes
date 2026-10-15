import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { openApp } from './helpers';

// Tech sprint 3.1: the API the plugins get (`ctx`) is the same before and after the host is cut into modules. The
// shape of a ctx — every namespace, every function, every value's type — made for a plugin with every right and with
// none, against the snapshot in e2e/fixtures/apiSurface.json. A change to the API changes the snapshot on purpose:
// delete the file and run the test again to write it anew.

const SNAP = new URL('./fixtures/apiSurface.json', import.meta.url);

async function surface(page: Page, permissions: string[]) {
  return page.evaluate(async (perms) => {
    const { plugins } = await import('/src/api/host.svelte.ts' as string);
    const m = { ...plugins.manifest('hello'), permissions: perms, net: perms.includes('net') ? ['example.com'] : [] };
    const ctx = (plugins as any).ctxOf(m);
    const shape = (v: unknown, depth: number): unknown => {
      if (typeof v === 'function') return 'function';
      if (v === null || typeof v !== 'object' || Array.isArray(v) || depth > 4) return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape((v as Record<string, unknown>)[k], depth + 1)]));
    };
    return shape(ctx, 0);
  }, permissions);
}

test('the API of a plugin keeps its shape', async ({ page }) => {
  await openApp(page, { files: { '/mock/a.org': '* TODO A\n' }, plugins: { hello: ['index.read', 'files.edit'] } });
  const now = {
    all: await surface(page, ['index.read', 'files.read', 'files.edit', 'clipboard', 'net', 'process']),
    none: await surface(page, []),
  };
  if (!existsSync(SNAP)) writeFileSync(SNAP, JSON.stringify(now, null, 2) + '\n');
  expect(now).toEqual(JSON.parse(readFileSync(SNAP, 'utf8')));
});
