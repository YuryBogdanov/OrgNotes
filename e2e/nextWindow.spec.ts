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
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  await expect(tree(page)).toBeVisible();
}

test('the tree: folders first and folded, a click opens a file (the toolbar says which), ⌥-click — a tab of its own', async ({ page }) => {
  await open(page);
  await expect(page.getByLabel('Боковая панель').locator('.grp.head .pt')).toHaveText('Файлы');
  // fix-50: how many files and where — the panel's line, no badge on the bar
  await expect(page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: /Файлы/ }).locator('.bd')).toHaveCount(0);
  await expect(page.getByLabel('Боковая панель').locator('.grp.head .sub')).toHaveText('4 файла · /mock');
  await expect(tree(page).getByRole('treeitem')).toHaveText(['1on1', 'inbox', 'Midterm']);
  await item(page, '1on1').click();
  await expect(item(page, '1on1')).toHaveAttribute('aria-expanded', 'true');
  await expect(tree(page).getByRole('treeitem')).toHaveText(['1on1', 'boris', 'vera', 'inbox', 'Midterm']);
  await item(page, 'inbox').click();
  await expect(page.locator('.bar .name')).toHaveText('inbox');
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
  // the panel's edge (ТЗ 50 §2): 260 → 300, kept after a reload; never under 200; the rail 52 aside
  const pane = page.locator('aside.side .pane');
  // shown again in 180 ms: the rail 52, the panel 260, the line
  await expect.poll(async () => Math.round((await page.locator('aside.side').boundingBox())!.width)).toBe(313);
  const box = (await pane.boundingBox())!;
  expect(Math.round(box.width)).toBe(260);
  expect(Math.round((await page.locator('aside.side .rail').boundingBox())!.width)).toBe(52);
  await page.mouse.move(box.x + box.width - 1, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 39, box.y + 300, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await pane.boundingBox())!.width)).toBe(300);
  await page.reload();
  await expect.poll(async () => Math.round((await pane.boundingBox())!.width)).toBe(300);
});

test('the folder\'s line: the folder; the gear in the rail opens the settings', async ({ page }) => {
  await open(page);
  const line = page.locator('aside.side .folder');
  await expect(line).toContainText('/mock');
  await expect(line.getByRole('button')).toHaveCount(0);
  await page.locator('aside.side .rail').getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('dialog', { name: 'Настройки' })).toBeVisible();
});
