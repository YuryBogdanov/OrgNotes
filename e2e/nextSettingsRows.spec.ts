import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 54.2: a schema's section in the new rows — groups with their captions and cards, a row per field (a switch, a
// menu, segments, a file, the plugin's own under its name), a dot by a changed value; the plugin's head with «включён».

const F: Record<string, string> = { '/mock/Midterm.org': '* TODO Переезд\n' };
async function open(page: Page, section: string) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1400, height: 900 } });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
  await page.keyboard.press('Meta+,');
  await page.getByRole('tab', { name: section, exact: true }).click();
  return page.getByRole('dialog', { name: 'Настройки' });
}

test('a plugin\'s section: its head, the groups, the rows; a menu, a switch, the dot of a changed value', async ({ page }) => {
  const s = await open(page, 'Долгие дела');
  await expect(s.getByRole('group', { name: 'Плагин «Долгие дела»' })).toContainText('встроенный');
  await expect(s.getByRole('group', { name: 'Плагин «Долгие дела»' }).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await expect(s.locator('section.grp .cap')).toHaveText(['Источники', 'Проверка', '«Сегодня»', 'Редактор'], { ignoreCase: true });
  // the plugin's own field under its name, across the row
  await expect(s.locator('.row.wide').filter({ hasText: 'Где долгие дела' }).getByText('+ Источник')).toBeVisible();
  // a menu: no dot of a change (fix #315: only «Клавиши» marks them)
  const norm = s.locator('.row').filter({ hasText: 'Норма проверки' });
  await expect(norm.locator('.dot')).toHaveCount(0);
  await norm.getByRole('button', { name: /Норма проверки/ }).click();
  await page.getByRole('menuitem', { name: /7 дней/ }).click();
  await expect(norm.getByRole('button', { name: /Норма проверки/ })).toContainText('7 дней');
  await expect(norm.locator('.dot')).toHaveCount(0);
  // ⎋ in a menu closes the menu, not the sheet
  await norm.getByRole('button', { name: /Норма проверки/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(s).toBeVisible();
  // a switch
  const block = s.locator('.row').filter({ hasText: 'Блок в «Сегодня»' }).getByRole('switch');
  await expect(block).toHaveAttribute('aria-checked', 'true');
  await block.click();
  await expect(block).toHaveAttribute('aria-checked', 'false');
});

test('segments and a file with «Выбрать…» (Календарь)', async ({ page }) => {
  const s = await open(page, 'Календарь');
  const view = s.locator('.row').filter({ hasText: 'Вид по умолчанию' });
  await view.getByRole('radio', { name: 'Неделя' }).click();
  await expect(view.getByRole('radio', { name: 'Неделя' })).toHaveAttribute('aria-checked', 'true');
  const file = s.locator('.row').filter({ hasText: 'Файл для задач' });
  await file.getByRole('button', { name: /Выбрать/ }).click();
  await page.keyboard.type('Midterm');
  await page.keyboard.press('Enter');
  await expect(file).toContainText('Midterm');
});
