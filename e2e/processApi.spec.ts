import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 55.1: `ctx.process.pty` — only with the right «process»; the process's output comes to its handle (what came
// before `onData` too), its end with the code; `kill`; a plugin turned off ends its processes; quitting with live ones
// asks «Завершить N процессов в терминале?».

test('a pty: spawned with the right, its output and end; none without the right', async ({ page }) => {
  await openApp(page, { files: { '/mock/a.org': '* TODO A\n' } });
  const r = await page.evaluate(async () => {
    const { plugins } = await import('/src/api/host.svelte.ts' as string);
    const none = (plugins as any).ctxOf({ ...plugins.manifest('hello'), permissions: [] });
    const ctx = (plugins as any).ctxOf({ ...plugins.manifest('hello'), permissions: ['process'] });
    const p = await ctx.process.pty({ cols: 80, rows: 24 });
    let out = '';
    p.onData((d: string) => (out += d));
    const ended = new Promise((res) => p.onExit((c: number | null) => res(c)));
    p.write('echo привет\r');
    await new Promise((res) => setTimeout(res, 50));
    p.write('exit\r');
    const code = await ended;
    return { none: 'process' in none, out, code, log: (window as any).__log.filter((x: unknown[]) => String(x[0]).startsWith('pty')).map((x: unknown[]) => x.slice(0, 2)) };
  });
  expect(r.none).toBe(false);
  expect(r.out).toContain('echo привет\r\nпривет\r\n');
  expect(r.code).toBe(0);
  expect(r.log[0]).toEqual(['pty_spawn', 'hello']);
});

test('quitting with a live process asks first; «Отмена» keeps the app, «Завершить и выйти» quits', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO A\n' }, ready: false });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
  await page.evaluate(async () => {
    const { plugins } = await import('/src/api/host.svelte.ts' as string);
    const ctx = (plugins as any).ctxOf({ ...plugins.manifest('hello'), permissions: ['process'] });
    await ctx.process.pty({ cols: 80, rows: 24 });
    await ctx.process.pty({ cols: 80, rows: 24 });
  });
  await page.evaluate(() => (window as any).__emitEvent('quit-requested', null));
  const sh = page.getByRole('alertdialog', { name: 'Выход' });
  await expect(sh).toContainText('Завершить 2 процесса в терминале?');
  await sh.getByRole('button', { name: 'Отмена' }).click();
  await expect(sh).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__log.some((x: unknown[]) => x[0] === 'quit'))).toBe(false);
  await page.evaluate(() => (window as any).__emitEvent('quit-requested', null));
  await sh.getByRole('button', { name: 'Завершить и выйти' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__log.some((x: unknown[]) => x[0] === 'quit'))).toBe(true);
});

test('a plugin turned off: its processes end', async ({ page }) => {
  await openApp(page, { files: { '/mock/a.org': '* TODO A\n' }, plugins: { hello: ['index.read'] } });
  const r = await page.evaluate(async () => {
    const { plugins } = await import('/src/api/host.svelte.ts' as string);
    const ctx = (plugins as any).ctxOf({ ...plugins.manifest('hello'), permissions: ['process'] });
    const p = await ctx.process.pty({ cols: 80, rows: 24 });
    const ended = new Promise((res) => p.onExit((c: number | null) => res(c)));
    await plugins.setEnabled('hello', false);
    return { code: await ended, log: (window as any).__log.filter((x: unknown[]) => x[0] === 'pty_kill_plugin') };
  });
  expect(r.log).toEqual([['pty_kill_plugin', 'hello']]);
  expect(r.code).toBeNull();
});
