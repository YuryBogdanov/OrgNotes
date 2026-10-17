import { expect, test, type Page } from '@playwright/test';
import { openApp, settingsSheet } from './helpers';

// ТЗ 43.2: the compatibility layer — the bridged settings and the editor's menu (moved to <body>) draw with the new
// tokens: the old variables given by them; `data-ui="next"` on the layer.

const css = (page: Page, sel: string, prop: string) => page.locator(sel).first().evaluate((e, p) => getComputedStyle(e).getPropertyValue(p).trim(), prop);

async function open(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO Задача\nтекст\n' }, ready: false });
  await expect(page.locator('.next[data-ui="next"] .cm-content')).toBeVisible();
}

for (const scheme of ['light', 'dark'] as const)
  test(`the settings in the layer: the old variables are the new tokens (${scheme})`, async ({ page }) => {
    await open(page, scheme);
    await page.keyboard.press('Meta+,');
    await expect(settingsSheet(page)).toBeVisible();
    const pal = '[role="dialog"][aria-label="Настройки"]';
    expect(await page.locator(pal).evaluate((e) => !!e.closest('.compat[data-ui="next"]'))).toBe(true);
    const lampink = scheme === 'light' ? '#8a5f0e' : '#f2c66d';
    expect(await css(page, pal, '--acc')).toBe(await css(page, pal, '--lampink'));
    expect(await css(page, pal, '--lampink')).toBe(lampink);
    expect(await css(page, pal, '--field')).toBe(await css(page, pal, '--chip'));
    expect(await css(page, pal, '--p-blue')).toBe(scheme === 'light' ? '#1f5fbf' : '#8ab8ff');
  });

test('the editor\'s menu, moved to <body>, has the new tokens too', async ({ page }) => {
  await open(page, 'dark');
  await page.locator('.cm-line', { hasText: 'текст' }).click({ button: 'right' });
  const menu = page.getByRole('menu').first();
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((e) => !!e.closest('.next'))).toBe(false); // out of the window's frame
  // its ground: the old `--bg` at 92% — the dark «Синька»'s #101c2c, not the old theme's #1e1e22
  expect(await menu.evaluate((e) => getComputedStyle(e).getPropertyValue('--bg').trim())).toBe('#101c2c');
  expect(await menu.evaluate((e) => getComputedStyle(e).backgroundColor)).toContain('0.062745 0.109804 0.172549');
  expect(await css(page, '[role="menu"]', '--acc')).toBe('#f2c66d'); // the lamp's ink
});
