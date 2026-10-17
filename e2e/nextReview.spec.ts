import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { FILES } from './reviewFixture';

// ТЗ 45.5 (§4): the Inbox's review in the new interface — the core's new frame (not the old one in the layer): the
// queue on the left with the progress and what became of each card; the card — the plugin's chips, the narrowed
// editor (its heading the title); one row of equal buttons, two lines each (the action; the status
// and the key); ⌘1 from the card's text marks it done and the queue says «DONE»; «Перенести…» the main one.

const IB = '/mock/inbox.org';
const disk = (page: Page, p = IB) => page.evaluate((p) => (window as any).__disk[p] as string, p);
const rv = (page: Page) => page.locator('.rv.review');

async function start(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  await pluginsReady(page);
  await page.keyboard.press('Shift+Meta+r');
  await expect(rv(page).getByRole('article', { name: 'Карточка разбора' })).toBeVisible();
}

test('the frame: the queue, the card, the row of actions — new, the plugin\'s parts in the layer', async ({ page }) => {
  await start(page);
  expect(await rv(page).evaluate((e) => !e.closest('.compat'))).toBe(true);
  const q = rv(page).getByRole('navigation', { name: 'Очередь разбора' });
  await expect(q.locator('.qs')).toHaveText('1 из 5 · inbox');
  await expect(q.locator('.qr')).toHaveCount(5);
  await expect(q.locator('.qr.cur .qt')).toHaveText('Продлить страховку авто');
  const card = rv(page).getByRole('article', { name: 'Карточка разбора' });
  await expect(card.locator('.cm-line').first()).toContainText('Продлить страховку авто'); // the narrowed editor's heading is the title
  expect(await card.locator('.cm-editor').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)'); // on the card's ground
  await expect(card.locator('.ph .age')).toBeVisible(); // the plugin's chip of its age
  await expect(card.locator('.ph .k')).toBeHidden(); // «Задача 1 из 5»: the queue says it
  // the row: «← Назад» and the plugin's buttons, one row, the five of the same width
  const btns = rv(page).locator('.pbar > .a:visible, .pbar .dwrap > .a');
  const boxes = await Promise.all((await btns.all()).map((b) => b.boundingBox()));
  expect(new Set(boxes.map((b) => Math.round(b!.y))).size).toBe(1);
  const ws = boxes.map((b) => Math.round(b!.width));
  expect(Math.max(...ws) - Math.min(...ws)).toBeLessThanOrEqual(1);
  await expect(rv(page).locator('.pbar .done-b .s')).toHaveText(/DONE\s*⌘1/); // «DONE · ⌘1»: the dot is the style's
});

test('⌘1 from the card\'s text: DONE written, the next card; the queue says «DONE» and fades it', async ({ page }) => {
  await start(page);
  await rv(page).locator('.cm-content').click();
  await page.keyboard.press('Meta+1');
  await expect.poll(() => disk(page)).toContain('* DONE Продлить страховку авто');
  const q = rv(page).getByRole('navigation', { name: 'Очередь разбора' });
  await expect(q.locator('.qr').first()).toHaveClass(/handled/);
  await expect(q.locator('.qr').first().locator('.qn')).toHaveText('DONE');
  await expect(q.locator('.qs')).toHaveText('2 из 5 · inbox');
});

test('a narrow window: the buttons stay in one row, the status line goes', async ({ page }) => {
  await start(page, 1100);
  const btns = rv(page).locator('.pbar > .a:visible, .pbar .dwrap > .a');
  const ys = new Set((await Promise.all((await btns.all()).map((b) => b.boundingBox()))).map((b) => Math.round(b!.y)));
  expect(ys.size).toBe(1);
});
