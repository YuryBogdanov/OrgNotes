import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 54.3: «Основные» and «Оформление» of the new interface — the folder with its files, the interface, the levels as
// segments with the dot of a change, the links; the appearance, the light themes as cards (a right click — the
// theme's menu, «Дублировать» renames the copy in place), the dark one's as a menu.

const F: Record<string, string> = { '/mock/Midterm.org': '* TODO Переезд\n', '/mock/inbox.org': '* Почитать\n' };
async function open(page: Page, section: string) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1400, height: 900 } });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
  await page.keyboard.press('Meta+,');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await s.getByRole('tab', { name: section, exact: true }).click();
  return s;
}

test('«Основные»: the folder, the interface, the levels, the links', async ({ page }) => {
  const s = await open(page, 'Основные');
  await expect(s.locator('section.grp .cap')).toHaveText(['Рабочая папка', 'Интерфейс', 'Заголовки', 'Ссылки'], { ignoreCase: true });
  await expect(s.locator('.row').first()).toContainText('/mock');
  await expect(s.locator('.row').first()).toContainText(/2 файла · \d+ Б/);
  const step = s.locator('.row').filter({ hasText: 'Шаг отступа' });
  await expect(step.locator('.dot')).toHaveCount(0);
  await step.getByRole('radio', { name: 'Больше' }).click();
  await expect(step.getByRole('radio', { name: 'Больше' })).toHaveAttribute('aria-checked', 'true');
  await expect(step.locator('.dot')).toHaveCount(1);
  const links = s.locator('.row').filter({ hasText: 'Ссылки на заголовки' });
  await links.getByRole('radio', { name: 'По названию' }).click();
  await expect(links).toContainText('ссылка ломается');
});

test('«Оформление»: the appearance, the light themes\' cards and their menu, the dark one\'s menu', async ({ page }) => {
  const s = await open(page, 'Оформление');
  await s.getByRole('radiogroup', { name: 'Оформление' }).getByRole('radio', { name: 'Тёмное' }).click();
  await expect(s.getByRole('radiogroup', { name: 'Оформление' }).getByRole('radio', { name: 'Тёмное' })).toHaveAttribute('aria-checked', 'true');
  await s.getByRole('radiogroup', { name: 'Оформление' }).getByRole('radio', { name: 'Светлое' }).click();
  const cards = s.getByRole('radiogroup', { name: 'Тема при светлом оформлении' });
  const first = cards.getByRole('radio').first();
  await first.click();
  await expect(first).toHaveAttribute('aria-checked', 'true');
  // a right click: the theme's menu; «Дублировать» — the copy's name in a field
  await first.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Переименовать' })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Дублировать' }).click();
  const rn = s.getByRole('textbox', { name: 'Название темы' });
  await expect(rn).toBeFocused();
  await rn.fill('Моя');
  await rn.press('Enter');
  await expect(cards.getByRole('radio', { name: 'Моя' })).toBeVisible();
  // ⎋ in the menu: the menu goes, the sheet stays
  await cards.getByRole('radio', { name: 'Моя' }).click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(s).toBeVisible();
  // the dark one's theme: a menu
  const dark = s.getByRole('button', { name: /^Тема при тёмном оформлении:/ });
  await dark.click();
  const items = page.getByRole('menuitem');
  const name = (await items.nth(1).textContent())!.trim();
  await items.nth(1).click();
  await expect(dark).toContainText(name);
});
