import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 44.1 (§1, §3.4): the new interface's own menu — the window's (a tab's, the files' tree) and the sidebar panels'.
// Rows of 28 pt on `card`; the row chosen on `lamp`; ↑↓ choose, ↩ runs, → opens a submenu (a hover after 150 ms), ←
// closes it, ⎋ closes the menu.

const F = { '/mock/a.org': '* TODO Задача :работа:\n', '/mock/b.org': '* Заметка :дом:\n' };
async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
}

test('the files\' tree: the new menu, its look; ↓↓ ↩ runs the row; ⎋ closes', async ({ page }) => {
  await open(page);
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'a' }).click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((e) => !e.closest('.compat'))).toBe(true); // not the bridge
  expect(await menu.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('10px');
  const first = menu.getByRole('menuitem').first();
  expect(Math.round((await first.boundingBox())!.height)).toBe(28);
  await page.keyboard.press('ArrowDown');
  await expect(menu.locator('button.cur')).toHaveCount(1);
  expect(await menu.locator('button.cur').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(227, 170, 60)'); // `lamp`
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  // ↓ to «Переименовать» and ↩: the name's field in the tree
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'a' }).click({ button: 'right' });
  const items = await page.getByRole('menu').getByRole('menuitem').allTextContents();
  const at = items.findIndex((t) => t.includes('Переименовать'));
  for (let i = 0; i <= at; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Новое имя' })).toBeVisible();
});

test('a submenu: → opens it with the keys, ← back, ↩ runs; a hover opens it too', async ({ page }) => {
  await open(page);
  await page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: /Теги/ }).click();
  await page.getByRole('listbox', { name: 'Теги' }).getByRole('option', { name: /работа/ }).click({ button: 'right' });
  const items = await page.getByRole('menu').getByRole('menuitem').allTextContents();
  const at = items.findIndex((t) => t.includes('Цвет тега'));
  for (let i = 0; i <= at; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menu')).toHaveCount(2);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('menu')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); // the first colour
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect.poll(() => page.locator('.tp .row', { hasText: 'работа' }).locator('i').evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgba(21, 36, 58, 0.63)');
  // a hover opens it after a moment
  await page.getByRole('listbox', { name: 'Теги' }).getByRole('option', { name: /дом/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Цвет тега/ }).hover();
  await expect(page.getByRole('menu')).toHaveCount(2);
});
