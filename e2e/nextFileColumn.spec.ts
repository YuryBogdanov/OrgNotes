import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// fix #296: the file's cards stay at the column's top, «Структура» scrolls under them; the cards higher than 45 % of
// the column — all but the first folded to their heads. fix #299: the board's card — its description the card's
// whole width, wrapped, the button under it, a plain one.

const MID = ['#+TODO: TODO NEXT WAIT | DONE', ...Array.from({ length: 40 }, (_, i) => `* TODO Дело номер ${i + 1}\nтекст`), ''].join('\n');
const col = (page: Page) => page.getByRole('complementary', { name: 'Структура' });
async function open(page: Page, height: number) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/Midterm.org': MID }, now: new Date(2026, 9, 16, 11), ready: false, viewport: { width: 1440, height } });
  await pluginsReady(page);
  await expect(col(page).locator('.fcard, [data-card]').first()).toBeVisible();
}

test('the cards do not scroll with «Структура»; the board\'s card wraps its description, the button under it', async ({ page }) => {
  await open(page, 1100);
  const cards = col(page).locator('.cards');
  const top = (await cards.boundingBox())!.y;
  const list = col(page).locator('.list');
  expect(await list.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  await list.evaluate((e) => (e.scrollTop = 400));
  await expect.poll(() => list.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  expect((await cards.boundingBox())!.y).toBe(top);
  const kb = col(page).locator('.kb-fcard');
  await expect(kb).toBeVisible();
  const text = (await kb.locator('> span').boundingBox())!;
  const btn = (await kb.getByRole('button', { name: /Открыть доской/ }).boundingBox())!;
  expect(btn.y).toBeGreaterThanOrEqual(text.y + text.height - 1);
  await expect(kb.getByRole('button', { name: /Открыть доской/ })).not.toHaveClass(/main/);
});

test('a short window: the cards over 45 % of the column — all but the first folded', async ({ page }) => {
  await open(page, 1100);
  const n = await col(page).locator('.cards > *').count();
  test.skip(n < 2, 'one card only');
  await page.setViewportSize({ width: 1440, height: 520 });
  const folded = col(page).locator('.cards > *').nth(1).locator('[aria-expanded="false"]');
  await expect(folded.first()).toBeVisible();
  await expect(col(page).locator('.cards > *').first().locator('[aria-expanded="true"]').first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await expect(col(page).locator('.cards > *').nth(1).locator('[aria-expanded="true"]').first()).toBeVisible();
});
