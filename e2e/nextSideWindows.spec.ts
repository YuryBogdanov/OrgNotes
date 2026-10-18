import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ 52.1: the mini window (#mini) and the quick entry (#capture) follow the flag of the new interface — on their
// root the new tokens by the appearance, `data-ui="next"`, the interface's fonts; the flag switched in the main
// window (the shared storage) reloads them; without it they are the old ones.

async function open(page: Page, hash: '#mini' | '#capture', next: boolean, scheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: scheme });
  await page.addInitScript((n) => {
    if (n && !sessionStorage.getItem('flipped')) localStorage.setItem('ui:next', '1');
  }, next);
  await installTauriMock(page, {});
  await page.goto('/' + hash);
}
const root = (page: Page) => page.locator('.side-win[data-ui="next"]');

for (const hash of ['#mini', '#capture'] as const) {
  test(`${hash}: the new root with the tokens and the fonts; the dark appearance followed`, async ({ page }) => {
    await open(page, hash, true);
    await expect(root(page)).toHaveCount(1); // (the quick entry hides itself on losing the focus: present, maybe hidden)
    expect(await root(page).evaluate((e) => getComputedStyle(e).getPropertyValue('--lamp').trim())).toBe('#e3aa3c');
    expect(await root(page).evaluate((e) => getComputedStyle(e).getPropertyValue('--mono'))).toContain('Plex Mono');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => root(page).evaluate((e) => getComputedStyle(e).getPropertyValue('--lamp').trim())).toBe('#f2c66d');
  });

  test(`${hash}: the old window without the flag; the flag switched elsewhere reloads it into the new one`, async ({ page, context }) => {
    await open(page, hash, false);
    await expect(root(page)).toHaveCount(0);
    // the main window turns it on: another page of the same origin writes the flag
    const main = await context.newPage();
    await installTauriMock(main, {});
    await main.goto('/');
    await main.evaluate(() => localStorage.setItem('ui:next', '1'));
    await expect(root(page)).toHaveCount(1); // (the quick entry hides itself on losing the focus: present, maybe hidden)
    await main.close();
  });
}
