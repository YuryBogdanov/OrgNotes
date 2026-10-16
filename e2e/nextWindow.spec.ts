import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 42.3: the window of the new interface — the sidebar (the files' tree: folders fold, a click opens, ⌥-click — a
// tab of its own, the menu of a row; the folder's line), its width by dragging; the toolbar (the file and its path,
// «Искать везде» ⌘K — the palette, «+» — a new note, the sidebar's button and ⌘0).

const FILES = { '/mock/Midterm.org': '* A\n', '/mock/inbox.org': '* B\n', '/mock/1on1/boris.org': '* C\n', '/mock/1on1/vera.org': '* D\n' };
const tree = (page: Page) => page.getByRole('tree', { name: 'Файлы' });
const item = (page: Page, name: string) => tree(page).getByRole('treeitem', { name, exact: true });
const tabs = (page: Page) => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.layout.panes[0].tabs.map((t: any) => t.path?.split('/').pop()));

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: FILES, ready: false });
  await expect(page.locator('[data-ui="next"]')).toBeVisible();
  await expect(tree(page)).toBeVisible();
}

test('the tree: folders first and folded, a click opens a file (the toolbar says which), ⌥-click — a tab of its own', async ({ page }) => {
  await open(page);
  await expect(page.getByLabel('Боковая панель').locator('.grp.head')).toContainText('Файлы4');
  await expect(tree(page).getByRole('treeitem')).toHaveText(['1on1', 'inbox', 'Midterm']);
  await item(page, '1on1').click();
  await expect(item(page, '1on1')).toHaveAttribute('aria-expanded', 'true');
  await expect(tree(page).getByRole('treeitem')).toHaveText(['1on1', 'boris', 'vera', 'inbox', 'Midterm']);
  await item(page, 'inbox').click();
  await expect(page.locator('.bar .name')).toHaveText('inbox.org');
  await expect(page.locator('.bar .path')).toHaveText('/mock/inbox.org');
  await expect(item(page, 'inbox')).toHaveAttribute('aria-selected', 'true');
  const before = (await tabs(page)).length;
  await item(page, 'boris').click({ modifiers: ['Alt'] });
  await expect.poll(async () => (await tabs(page)).length).toBe(before + 1);
  await expect.poll(() => tabs(page)).toContain('boris.org');
});

test('the menu of a row and of the empty space; a new file is named in the tree', async ({ page }) => {
  await open(page);
  await item(page, 'inbox').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Переименовать' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Переименовать' }).click();
  await page.getByRole('textbox', { name: 'Новое имя' }).fill('входящие');
  await page.keyboard.press('Enter');
  await expect(item(page, 'входящие')).toBeVisible();
  // «+» in the toolbar: a new note named in the tree
  await page.getByRole('button', { name: 'Новая заметка' }).click();
  await page.getByRole('textbox', { name: 'Имя файла' }).fill('план');
  await page.keyboard.press('Enter');
  await expect(item(page, 'план')).toBeVisible();
});

test('the toolbar: ⌘K and «Искать везде» open the palette; ⌘0 and its button hide the sidebar; the width is kept', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Искать везде/ }).click();
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+0');
  await expect(tree(page)).toBeHidden();
  await page.getByRole('button', { name: 'Боковая панель' }).click();
  await expect(tree(page)).toBeVisible();
  // the edge: 236 → 300, kept after a reload; never under 200
  const box = (await page.locator('aside.side').boundingBox())!;
  expect(Math.round(box.width)).toBe(236);
  await page.mouse.move(box.x + box.width - 1, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 63, box.y + 300, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await page.locator('aside.side').boundingBox())!.width)).toBe(300);
  await page.reload();
  await expect.poll(async () => Math.round((await page.locator('aside.side').boundingBox())!.width)).toBe(300);
});

test('the folder\'s line: the folder and its gear opens the settings', async ({ page }) => {
  await open(page);
  const line = page.locator('aside.side .folder');
  await expect(line).toContainText('/mock');
  await line.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('dialog', { name: 'Настройки' })).toBeVisible();
});
