import { expect, test } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 47.1: the new interface's fonts for the plugins' screens — `--font-display` (Yeseva One), `--font-mono` (IBM Plex
// Mono) in the compatibility layer around a plugin's panel; `ctx.ui.look` says which interface the window has.

test('a plugin\'s panel in the new interface has --font-display and --font-mono; ui.look is «next»', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* A\n' }, ready: false });
  await pluginsReady(page);
  await page.getByRole('navigation', { name: 'Разделы плагинов' }).getByRole('button', { name: 'Долгие дела' }).click();
  const v = await page.locator('.compat').first().evaluate((e) => {
    const s = getComputedStyle(e);
    return [s.getPropertyValue('--font-display'), s.getPropertyValue('--font-mono')];
  });
  expect(v[0]).toContain('Yeseva One');
  expect(v[1]).toContain('IBM Plex Mono');
  const look = await page.evaluate(async () => {
    const { plugins } = await import('/src/api/host.svelte.ts' as string);
    return (plugins as any).ctxOf((plugins as any).manifest('long-matters')).ui.look;
  });
  expect(look).toBe('next');
});
