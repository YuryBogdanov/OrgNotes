import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 54.8: the theme's editor in the new interface — «Новая тема» opens it over «Оформление»: the groups of colours,
// a row's colour picker (its hex applies at once), ⎋ closes the picker first, «‹ Оформление» back; the example in the
// new editor.

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO Задача\n' }, ready: false, viewport: { width: 1440, height: 900 } });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
  await page.keyboard.press('Meta+,');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await s.getByRole('tab', { name: 'Оформление', exact: true }).click();
  return s;
}

test('«Новая тема»: the editor, a colour by its hex, ⎋ the picker first, back to «Оформление»', async ({ page }) => {
  const s = await open(page);
  await s.getByRole('button', { name: 'Новая тема' }).click();
  const ed = s.getByRole('region', { name: 'Редактор темы' });
  await expect(ed).toBeVisible();
  await expect(s.locator('header .t2')).toHaveText('Оформление › Тема редактора');
  await expect(ed.getByRole('region', { name: 'Основа' })).toBeVisible();
  await expect(ed.locator('.pvbody .cm-content')).toContainText('Подготовить бюджет 2027');
  const bg = ed.locator('.row[data-key="bg"]');
  await bg.click();
  const hex = page.getByRole('dialog', { name: 'Цвет' }).getByRole('textbox', { name: 'HEX' });
  await hex.fill('#123456');
  await hex.press('Enter');
  await expect(bg).toContainText('#123456');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Цвет' })).toHaveCount(0);
  await expect(ed).toBeVisible();
  await ed.getByRole('button', { name: '‹ Оформление' }).click();
  await expect(s.locator('h1')).toHaveText('Оформление');
});
