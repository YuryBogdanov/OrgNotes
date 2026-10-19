import { expect, test } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 57.6: the plugins on the theme — `theme.changed` comes for another theme of the same light (not only light ↔
// dark), the layer's palette and fonts are the theme's; a font the Mac lacks gives way to the role's own.

test('«theme.changed» for another light theme; the plugins\' layer takes its palette and its fonts', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO Задача\n' }, ready: false, viewport: { width: 1280, height: 800 } });
  await pluginsReady(page);
  await page.evaluate(async () => {
    const { plugins } = await import('/src/api/host.svelte.ts' as string);
    const ctx = (plugins as any).ctxOf(plugins.manifest('hello'));
    (window as any).__themes = [];
    ctx.events.on('theme.changed', (e: { appearance: string }) => (window as any).__themes.push(e.appearance));
  });
  const store = (code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);
  await store("store.setThemeName('light', 'Классическая светлая')");
  await expect.poll(() => page.evaluate(() => (window as any).__themes)).toEqual(['light']);
  // an own theme with its fonts: the layer's (the plugins' panels and tabs) follow
  await store(`
    const c = await store.copyTheme(store.theme, 'С шрифтами', 'light');
    store.setThemeApp(c.name, { ...c.app, palette: { ...c.app.palette, teal: '#00aa99' }, fonts: { ...c.app.fonts, title: 'Georgia', mono: 'Нет такого' } });
  `);
  await expect.poll(() => page.evaluate(() => (window as any).__themes.length)).toBeGreaterThan(1);
  const layer = page.locator('.compat[data-ui="next"]').first();
  await expect(layer).toBeAttached();
  const v = (n: string) => layer.evaluate((e, x) => getComputedStyle(e).getPropertyValue(x).trim(), n);
  await expect.poll(() => v('--p-teal')).toBe('#00aa99');
  expect(await v('--font-display')).toContain('Georgia');
  expect(await v('--font-mono')).toMatch(/^["']Нет такого["'], ["']IBM Plex Mono["']/); // missing: the role's own after it
});
