import { expect, test, type Page } from '@playwright/test';
import { diskAll as disk, openApp } from './helpers';

// ТЗ 44.2 (§2.1, ТЗ 16): «Перенести» in the new interface's palette — the plate «Переносим», step 1 a file, step 2 the
// label «Перенести › файл», the pinned «Перенести на 1-й уровень», the file's tree with «станет N-м уровнем»; ⌫ back;
// a choice moves the heading.

const WORK = '* Q4 2026\n** TODO Подготовить бюджет 2027\nСвести заявки.\n** NEXT План найма\n';
const GLEB = '* 1-1\n** Повестка\n*** Вопросы\n* Цели\n';
const dlg = (page: Page) => page.getByRole('dialog', { name: 'Перенести заголовок' });

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/work.org': WORK, '/mock/1on1/gleb.org': GLEB }, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'work' }).click();
  await page.locator('.cm-line', { hasText: 'Подготовить бюджет' }).click();
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('перенести');
  await page.keyboard.press('Enter');
  await expect(dlg(page)).toBeVisible();
}

test('the new look: the plate, the files, the label of step 2, the pinned row, the tree; ⌫ back to the files', async ({ page }) => {
  await open(page);
  expect(await dlg(page).evaluate((e) => !e.closest('.compat'))).toBe(true);
  expect(Math.round((await dlg(page).boundingBox())!.width)).toBe(680);
  await expect(dlg(page).locator('.plate')).toContainText('Переносим');
  await expect(dlg(page).locator('.plate .kw')).toHaveText('TODO');
  await expect(dlg(page).locator('.tok')).toHaveText(/Перенести/);
  await page.keyboard.type('gleb');
  await page.keyboard.press('Enter');
  await expect(dlg(page).locator('.tok')).toHaveText(/Перенести › 1on1 \/ gleb/);
  const pin = dlg(page).locator('.row.pin');
  await expect(pin).toContainText('Перенести на 1-й уровень');
  await expect(pin).toContainText('в конец gleb');
  expect(await pin.evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe('dashed');
  await page.keyboard.press('ArrowDown'); // «1-1»
  await expect(dlg(page).locator('.node.on .will')).toHaveText('станет 2-м уровнем');
  await page.keyboard.press('Backspace');
  await expect(dlg(page).getByRole('listbox', { name: 'Файлы' })).toBeVisible();
});

test('a heading chosen: the subtree moves there', async ({ page }) => {
  await open(page);
  await page.keyboard.type('gleb');
  await page.keyboard.press('Enter');
  await dlg(page).locator('.node', { hasText: 'Цели' }).click();
  await expect(dlg(page)).toHaveCount(0);
  await expect.poll(async () => (await disk(page))['/mock/1on1/gleb.org']).toContain('* Цели\n** TODO Подготовить бюджет 2027\nСвести заявки.\n');
  await expect.poll(async () => (await disk(page))['/mock/work.org']).not.toContain('Подготовить бюджет');
});
