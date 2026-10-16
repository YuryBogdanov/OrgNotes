import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';
import { settingsSheet as sheet } from './helpers';

// Roadmap 1.4: the Emacs themes are a plugin of data («Темы из Emacs», JSON only). Off: its themes leave the choice,
// a chosen one gives way to Panopticon; on: back. A chosen plugin's theme shows from the start (cached).

const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector('.cm-editor')!).backgroundColor);

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { if (!localStorage.getItem('appearance')) localStorage.setItem('appearance', 'dark'); });
  await installTauriMock(page, { '/mock/Work.org': '* TODO Бюджет\n' });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}

test('the pack is a built-in plugin of data; off — its themes go and the chosen one gives way; on — back', async ({ page }) => {
  await open(page);
  await openSettingsSheet(page, 'Оформление');
  const dark = sheet(page).getByRole('radiogroup', { name: 'Тема при тёмном оформлении' });
  await dark.getByRole('radio', { name: 'Nord' }).click();
  await expect.poll(() => bg(page)).toBe('rgb(46, 52, 64)');
  // the chosen plugin's theme is there from the start
  await page.reload();
  await expect(page.locator('.cm-content').first()).toBeVisible();
  expect(await bg(page)).toBe('rgb(46, 52, 64)');
  await openSettingsSheet(page, 'Плагины');
  const pack = sheet(page).getByRole('group', { name: 'Темы из Emacs' });
  await expect(pack).toContainText('встроенный');
  await expect(pack).toContainText('Плагин без кода');
  await expect(pack.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await pack.getByRole('switch').click();
  await expect(pack.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => bg(page)).toBe('rgb(30, 30, 34)'); // Panopticon тёмная
  await sheet(page).getByRole('tab', { name: 'Оформление' }).click();
  expect(await dark.getByRole('radio').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Panopticon тёмная', 'Синька — тёмная']);
  await expect(dark.getByRole('radio', { name: 'Panopticon тёмная' })).toHaveAttribute('aria-checked', 'true');
  // after a restart: still off, still Panopticon
  await page.reload();
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await expect.poll(() => bg(page)).toBe('rgb(30, 30, 34)');
  await openSettingsSheet(page, 'Плагины');
  await sheet(page).getByRole('group', { name: 'Темы из Emacs' }).getByRole('switch').click();
  await sheet(page).getByRole('tab', { name: 'Оформление' }).click();
  await expect(dark.getByRole('radio')).toHaveCount(6);
});
