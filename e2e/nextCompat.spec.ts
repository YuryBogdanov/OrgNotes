import { expect, test, type Page } from '@playwright/test';
import { openApp, settingsSheet } from './helpers';

// ТЗ 43.2: the compatibility layer — the bridged settings draw with the new tokens: the old variables given by them;
// `data-ui="next"` on the layer. (The editor's menu is the new interface's own since ТЗ 44.3.)

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
