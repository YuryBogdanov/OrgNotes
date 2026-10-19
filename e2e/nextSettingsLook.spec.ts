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
  await expect(step.locator('.dot')).toHaveCount(0);
  const links = s.locator('.row').filter({ hasText: 'Ссылки на заголовки' });
  await links.getByRole('radio', { name: 'По названию' }).click();
  await expect(links).toContainText('ссылка ломается');
});

// ТЗ 57.3: the places «Светлая тема» / «Тёмная тема» take any theme; the gallery of the app's themes
test('«Оформление»: any theme in either place; the cards — the place in effect, the chips, the menu; the window takes the theme', async ({ page }) => {
  const s = await open(page, 'Оформление');
  const cards = s.getByRole('radiogroup', { name: 'Темы' });
  await expect(cards.getByRole('radio').first()).toHaveAccessibleName('Бумага');
  await expect(cards.getByRole('radio', { name: 'Бумага' })).toHaveAttribute('aria-checked', 'true');
  const card = (n: string) => s.locator('.thcard').filter({ has: page.getByRole('radio', { name: n, exact: true }) });
  await expect(card('Бумага').locator('.sub')).toHaveText('светлая · встроенная');
  await expect(card('Бумага').locator('.pl')).toHaveText('светлая ✓');
  await expect(card('Синька').locator('.pl')).toHaveText('тёмная ✓');
  await expect(card('Бумага').locator('.dots i')).toHaveCount(6);
  // a click: the place in effect (the light one) — «Синька» in the light place, the window dark
  await cards.getByRole('radio', { name: 'Синька', exact: true }).click();
  await expect(cards.getByRole('radio', { name: 'Синька', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(card('Синька').locator('.pl')).toHaveText(['светлая ✓', 'тёмная ✓']);
  await expect(s.getByRole('button', { name: /^Светлая тема:/ })).toContainText('Синька');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.next')!).getPropertyValue('--bg').trim())).toBe('#101c2c');
  expect(await page.evaluate(() => document.documentElement.dataset.appearance)).toBe('dark');
  // the menu: «Поставить для светлого» back to «Бумага»; a built-in one cannot be renamed or deleted
  await cards.getByRole('radio', { name: 'Бумага' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Переименовать' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Удалить' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Поставить для светлого' }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.next')!).getPropertyValue('--bg').trim())).toBe('#f8f6f0');
  // the dark place by its menu: any theme, a light one too
  await s.getByRole('button', { name: /^Тёмная тема:/ }).click();
  await page.getByRole('menuitem', { name: 'Классическая светлая' }).click();
  await expect(card('Классическая светлая').locator('.pl')).toHaveText('тёмная ✓');
  await s.getByRole('radiogroup', { name: 'Оформление' }).getByRole('radio', { name: 'Тёмное' }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.next')!).getPropertyValue('--bg').trim())).toBe('#ffffff');
  // «Дублировать и изменить…»: «… — копия» opens in the editor; ‹ back, its card is own: renamed in place
  await s.getByRole('radiogroup', { name: 'Оформление' }).getByRole('radio', { name: 'Светлое' }).click();
  await cards.getByRole('radio', { name: 'Бумага' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Дублировать и изменить…' }).click();
  await expect(s.getByRole('region', { name: 'Редактор темы' })).toBeVisible();
  await s.getByRole('button', { name: /‹/ }).first().click();
  await expect(card('Бумага — копия').locator('.sub')).toHaveText('светлая · своя');
  await expect(card('Бумага — копия').locator('.pl')).toHaveText('светлая ✓');
  await cards.getByRole('radio', { name: 'Бумага — копия' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Переименовать' }).click();
  const rn = s.getByRole('textbox', { name: 'Название темы' });
  await expect(rn).toBeFocused();
  await rn.fill('Сепия');
  await rn.press('Enter');
  await expect(cards.getByRole('radio', { name: 'Сепия' })).toBeVisible();
  // ⎋ in the menu: the menu goes, the sheet stays
  await cards.getByRole('radio', { name: 'Сепия' }).click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(s).toBeVisible();
});
