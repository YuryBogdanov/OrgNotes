import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { RICH_ENABLED } from '../src/nextFlags';

// ТЗ 57.5: a theme's four fonts — the menu (the bundled ones, a rule, the families of the Mac with a field, each in
// its own font, «нет кириллицы»); the window takes them; «Шрифт текста» is the theme's text font, a built-in theme
// offers its copy first.

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
const v = (page: Page, n: string) => page.evaluate((x) => getComputedStyle(document.querySelector('.next')!).getPropertyValue(x).trim(), n);

test('the editor\'s «Шрифты»: the Mac\'s families in the menu, found by a field; the window\'s titles, interface and monospace follow', async ({ page }) => {
  const s = await open(page);
  await s.getByRole('button', { name: '+ Новая тема' }).click();
  const fonts = s.getByRole('region', { name: 'Шрифты' });
  await expect(fonts.locator('.row')).toHaveCount(3); // «Текст файла» hidden with «Оформление» (fix-49)
  await expect(fonts.getByRole('button', { name: /^Текст файла:/ })).toHaveCount(0);
  const title = fonts.getByRole('button', { name: /^Заголовки экранов:/ });
  await expect(title).toHaveAccessibleName('Заголовки экранов: Yeseva One');
  await title.click();
  const list = page.getByRole('listbox', { name: 'Заголовки экранов' });
  await expect(list.locator('.fm-n')).toHaveText(['Yeseva One', 'Cormorant Garamond', 'IBM Plex Mono', 'Системный', 'Georgia', 'Helvetica Neue', 'Menlo', 'Zapfino']);
  await expect(list.getByRole('option', { name: /Zapfino/ }).locator('.fm-nc')).toHaveText('нет кириллицы');
  await expect(list.getByRole('option', { selected: true })).toContainText('Yeseva One');
  await expect(list.locator('.fm-sep')).toHaveCount(1);
  expect(await list.getByRole('option', { name: /Georgia/ }).evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Georgia');
  await page.getByRole('textbox', { name: 'Найти шрифт' }).fill('geo');
  await expect(list.locator('.fm-n')).toHaveText(['Georgia']);
  await page.keyboard.press('Enter');
  await expect.poll(() => v(page, '--title')).toContain('Georgia');
  await fonts.getByRole('button', { name: /^Моноширинный:/ }).click();
  await page.getByRole('listbox', { name: 'Моноширинный' }).getByRole('option', { name: /Menlo/ }).click();
  await expect.poll(() => v(page, '--mono')).toContain('Menlo');
  await fonts.getByRole('button', { name: /^Интерфейс:/ }).click();
  await page.keyboard.press('Escape'); // the menu first, the editor stays
  await expect(page.getByRole('listbox', { name: 'Интерфейс' })).toHaveCount(0);
  await expect(s.getByRole('region', { name: 'Редактор темы' })).toBeVisible();
});

test('«Шрифт текста»: a built-in theme is copied first; an own theme takes it at once', async ({ page }) => {
  test.skip(!RICH_ENABLED, '«Оформление» выключено (fix-49)');
  const s = await open(page);
  const row = s.getByRole('button', { name: /^Шрифт текста:/ });
  await expect(row).toHaveAccessibleName('Шрифт текста: Cormorant Garamond');
  await row.click();
  await page.getByRole('listbox', { name: 'Шрифт текста' }).getByRole('option', { name: /Georgia/ }).click();
  const ask = page.getByRole('alertdialog', { name: 'Шрифт встроенной темы' });
  await expect(ask).toContainText('копия «Бумага — копия»');
  await ask.getByRole('button', { name: 'Дублировать и изменить' }).click();
  const ed = s.getByRole('region', { name: 'Редактор темы' });
  await expect(ed.locator('h1')).toHaveText('Тема «Бумага — копия»');
  await expect(ed.getByRole('button', { name: /^Текст файла:/ })).toHaveAccessibleName('Текст файла: Georgia');
  await expect.poll(() => v(page, '--text')).toContain('Georgia');
  expect(await page.evaluate(() => document.querySelector('.next')!.getAttribute('data-font'))).toBe('system');
  // the copy is own: «Шрифт текста» changes it at once
  await ed.getByRole('button', { name: '‹ Все темы' }).click();
  await s.getByRole('button', { name: /^Шрифт текста:/ }).click();
  await page.getByRole('listbox', { name: 'Шрифт текста' }).getByRole('option', { name: /Cormorant/ }).click();
  await expect(page.getByRole('alertdialog', { name: 'Шрифт встроенной темы' })).toHaveCount(0);
  await expect.poll(() => v(page, '--text')).toContain('Cormorant');
  expect(await page.evaluate(() => document.querySelector('.next')!.getAttribute('data-font'))).toBe('serif');
});
