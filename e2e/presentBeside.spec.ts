import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// fix-59-1 §2: «Показать в тексте» — the file beside the slides; closed by its ×, by ⎋ in it, by the item again
// («Скрыть текст» ✓ while open); it follows the slide chosen, unless pinned.

const P = '/mock/deck.org';
const DECK = ['#+PRESENT: 16:9', '* Первый', 'раз', '* Второй', 'два', '* Третий', 'три', ''].join('\n');
const thumbs = (page: Page) => page.getByRole('listbox', { name: 'Слайды' }).getByRole('option');
const side = (page: Page) => page.getByRole('region', { name: 'Файл сбоку' });
async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { [P]: DECK }, ready: false, viewport: { width: 1500, height: 900 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
  await expect(page.locator('.pr-holder .pr-slide')).toBeVisible();
}
async function showText(page: Page, i: number) {
  await thumbs(page).nth(i).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Показать в тексте' }).click();
  await expect(side(page)).toBeVisible();
}

test('its ×, ⎋ in it and «Скрыть текст» close it; the presentation beside it stays clickable', async ({ page }) => {
  await open(page);
  await showText(page, 0);
  await side(page).getByRole('button', { name: 'Закрыть файл сбоку' }).click();
  await expect(side(page)).toHaveCount(0);
  await showText(page, 0);
  await side(page).locator('.cm-content').click();
  await page.keyboard.press('Escape');
  await expect(side(page)).toHaveCount(0);
  await showText(page, 0);
  await thumbs(page).nth(0).click({ button: 'right' });
  const hide = page.getByRole('menuitem', { name: 'Скрыть текст' });
  await expect(hide).toBeVisible();
  await hide.click();
  await expect(side(page)).toHaveCount(0);
});

test('it follows the slide chosen; pinned, it stays', async ({ page }) => {
  await open(page);
  await showText(page, 0);
  await thumbs(page).nth(1).click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/beside.svelte.ts' as string)).besideNow()?.line)).toBe(3);
  await side(page).getByRole('button', { name: 'следует за выбором' }).click(); // pinned
  await thumbs(page).nth(2).click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(async () => (await import('/src/beside.svelte.ts' as string)).besideNow()?.line)).toBe(3);
});
