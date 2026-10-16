import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 42.10 (§5.8): «Сузить до заголовка» ⌃X N S / «Показать весь файл» ⌃X N W — in both interfaces: the editor shows
// the subtree of the heading under the caret, the strip says so; kept with the tab after a reload; the heading gone,
// the narrowing goes; the new interface's «Структура» shows only the subtree.

const DOC = ['* Роадмап', 'текст роадмапа', '* Переезд хранилища', '** Бенчмарк', 'детали', '* Готово', ''].join('\n');
const visible = (page: Page) => page.locator('.cm-line').allInnerTexts();
async function narrowAt(page: Page, text: string) {
  await page.locator('.cm-line', { hasText: text }).click();
  await page.keyboard.press('Control+x');
  await page.keyboard.press('n');
  await page.keyboard.press('s');
}

test('the old interface: ⌃X N S and ⌃X N W; kept after a reload; the heading gone — the whole file', async ({ page }) => {
  await openApp(page, { files: { '/mock/a.org': DOC } });
  await narrowAt(page, 'Бенчмарк');
  await expect(page.locator('.narrowbar')).toContainText('Сужено');
  await expect(page.locator('.narrowbar')).toContainText('Переезд хранилища › Бенчмарк');
  await expect.poll(async () => (await visible(page)).join('|')).not.toContain('Роадмап');
  await page.reload();
  await expect(page.locator('.narrowbar')).toContainText('Бенчмарк');
  await page.locator('.cm-line', { hasText: 'детали' }).click();
  await page.keyboard.press('Control+x');
  await page.keyboard.press('n');
  await page.keyboard.press('w');
  await expect(page.locator('.narrowbar')).toHaveCount(0);
  await expect.poll(async () => (await visible(page)).join('|')).toContain('Роадмап');
  // the heading removed on disk: the narrowing goes
  await narrowAt(page, 'Бенчмарк');
  await expect(page.locator('.narrowbar')).toBeVisible();
  await page.evaluate((t) => (window as any).__setDisk('/mock/a.org', t), DOC.replace('** Бенчмарк\n', ''));
  await expect(page.locator('.narrowbar')).toHaveCount(0);
});

test('the new interface: the strip of §5.8, «Структура» of the subtree; the editor\'s menu and the palette', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': DOC }, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('[data-ui="next"] .cm-content')).toBeVisible();
  await page.locator('.cm-line', { hasText: 'Переезд хранилища' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Сузить до заголовка/ }).click();
  const strip = page.getByRole('status', { name: 'Сужено' });
  await expect(strip).toContainText('a › Переезд хранилища');
  await expect(strip).toContainText('⌃X N W');
  await expect(page.getByRole('complementary', { name: 'Структура' }).locator('.row .t')).toHaveText(['Переезд хранилища', 'Бенчмарк']);
  await strip.getByRole('button', { name: 'Показать весь файл' }).click();
  await expect(strip).toHaveCount(0);
  await page.locator('.cm-line', { hasText: 'Роадмап' }).first().click();
  await page.keyboard.press('Meta+k');
  await page.keyboard.type('сузить');
  await page.getByRole('option', { name: /^Сузить до заголовка/ }).click();
  await expect(page.getByRole('status', { name: 'Сужено' })).toContainText('a › Роадмап');
});
