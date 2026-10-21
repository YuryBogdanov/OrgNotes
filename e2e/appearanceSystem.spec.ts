import { expect, test, type Page } from '@playwright/test';
import { log, openApp } from './helpers';

// «Системное» (the user's bug, after ТЗ 57): the window follows macOS — WebKit's `prefers-color-scheme` is the window's,
// so a window made dark by a dark theme in the light place read as «macOS is dark», took the dark place's theme, went
// light, and so on each frame. Now: under «Системное» the window is told nothing but «as macOS» (null); macOS going
// dark switches the place; a dark theme in the light place is drawn with no loop. A chosen appearance sets the window.

const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);
const looks = async (page: Page) => (await log(page)).filter((e) => e[0] === 'window_theme').map((e) => e[1]);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* A\n' } });
});

test('«Системное»: the window as macOS; macOS dark — the dark place\'s theme', async ({ page }) => {
  expect(await store(page, 'return store.appearanceChoice')).toBe('system');
  await expect.poll(() => looks(page)).toEqual([null]);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => store(page, 'return store.appearance')).toBe('dark');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  expect(await looks(page)).toEqual([null]);
});

test('a dark theme in the light place under «Системное»: drawn once, no loop', async ({ page }) => {
  await store(page, "store.setThemeName('light', 'Синька')");
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await page.waitForTimeout(500);
  const flips = await page.evaluate(() => new Promise<number>((done) => {
    let n = 0;
    const o = new MutationObserver(() => n++);
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-appearance'] });
    setTimeout(() => (o.disconnect(), done(n)), 1000);
  }));
  expect(flips).toBe(0);
  expect(await store(page, 'return store.appearance')).toBe('light'); // the place: macOS is light
  expect(await looks(page)).toEqual([null]);
});

test('a chosen appearance sets the window to its theme\'s own light or dark', async ({ page }) => {
  await store(page, "store.setAppearance('dark')");
  await expect.poll(() => looks(page)).toEqual([null, 'dark']);
  await store(page, "store.setAppearance('light'); store.setThemeName('light', 'Синька')");
  await expect.poll(async () => (await looks(page)).at(-1)).toBe('dark'); // Синька in the light place: dark
  await store(page, "store.setAppearance('system')");
  await expect.poll(async () => (await looks(page)).at(-1)).toBe(null);
});
