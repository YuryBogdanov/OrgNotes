import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// #103: a command of the palette on a heading at the bottom of a long file left the editor scrolled to its top — the
// focus given back to the editor (`focus()` on a tall element) scrolled it into view from its start.

const W = '/mock/big.org';
const TEXT = Array.from({ length: 300 }, (_, i) => `* Раздел ${i}\nтекст\nещё текст\nи ещё`).join('\n') + '\n* TODO Последний\n';
const scrollTop = (page: Page) => page.locator('.cm-scroller').first().evaluate((e) => e.scrollTop);

async function atBottom(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { [W]: TEXT });
  await page.goto('/');
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('Meta+ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.cm-activeLine')).toContainText('Последний');
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(10000);
  return scrollTop(page);
}

test('«Сменить статус…» from the palette keeps the place in a long file', async ({ page }) => {
  const before = await atBottom(page);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+t');
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).toBeVisible();
  await page.keyboard.type('DONE');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-activeLine')).toContainText('DONE Последний');
  await page.waitForTimeout(300);
  expect(Math.abs((await scrollTop(page)) - before)).toBeLessThan(100);
});

test('«Запланировать…» from the palette keeps the place in a long file', async ({ page }) => {
  const before = await atBottom(page);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('s');
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate((p) => (window as any).__disk[p] as string, W)).toMatch(/\* TODO Последний\nSCHEDULED: </);
  await page.waitForTimeout(300);
  expect(Math.abs((await scrollTop(page)) - before)).toBeLessThan(100);
});
