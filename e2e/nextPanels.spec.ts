import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 43.5: the core's panels of the new sidebar in its style — «Агенда» (the built-in, «Мои агенды», «Новая агенда…»),
// «Теги» (find, by count / А–Я, mono names, a click / ⌘-click, the menu), «Поиск» (Aa, .*, only headings; the
// results by file; ↓ ↩ opens the match with the editor's find).

const F = {
  '/mock/a.org': '* TODO Миграция v1 :работа:срочно:\nВерсия v12 уходит.\n* Найм :работа:\n',
  '/mock/b.org': '* Отпуск :дом:\nбилеты v3\n',
};
const sec = (page: Page, n: RegExp) => page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: n });

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
}

test('«Агенда»: the built-in opens the agenda\'s tab, marked; «Новая агенда…» — the builder', async ({ page }) => {
  await open(page);
  await sec(page, /Агенда/).click();
  const list = page.getByRole('navigation', { name: 'Список агенд' });
  await expect(list).toContainText('Встроенные');
  await expect(list).toContainText('Своих агенд пока нет');
  // the built-in ones (ТЗ 45 §3.1): «Агенда» with its «30 дней», «Неделя», «Сегодня», «Все задачи»
  await expect(list.getByRole('button').filter({ has: page.locator('.nm') }).locator('.nm')).toHaveText(['Агенда', 'Неделя', 'Сегодня', 'Все задачи']);
  await list.getByRole('button', { name: /^Агенда/ }).click();
  await expect(page.locator('header.bar .name')).toHaveText('Агенда');
  await expect(list.getByRole('button', { name: /^Агенда/ })).toHaveAttribute('aria-current', 'true');
  await list.getByRole('button', { name: 'Новая агенда…' }).click();
  await expect(page.getByRole('dialog', { name: 'Конструктор агенды' })).toBeVisible();
});

test('«Теги»: by count, mono names; find; А–Я; a click — the tab «Тег», ⌘-click adds; the menu', async ({ page }) => {
  await open(page);
  await sec(page, /Теги/).click();
  const tags = page.getByRole('listbox', { name: 'Теги' });
  await expect(tags.locator('.nm')).toHaveText(['работа', 'дом', 'срочно']);
  await expect(tags.locator('.n').first()).toHaveText('2');
  expect(await tags.locator('.nm').first().evaluate((e) => getComputedStyle(e).fontFamily)).toContain('IBM Plex Mono');
  await page.getByRole('radio', { name: 'А–Я' }).click();
  await expect(tags.locator('.nm')).toHaveText(['дом', 'работа', 'срочно']);
  await page.getByRole('textbox', { name: 'Найти тег' }).fill('р');
  await expect(tags.locator('.nm')).toHaveText(['работа', 'срочно']); // «р» in both, not in «дом»
  await tags.getByRole('option', { name: /работа/ }).click();
  await expect(page.locator('header.bar .name')).toHaveText('Теги');
  await expect(page.locator('header.bar .path')).toHaveText(':работа:');
  await tags.getByRole('option', { name: /срочно/ }).click({ modifiers: ['Meta'] });
  await expect(page.locator('header.bar .path')).toHaveText(':работа: и :срочно:');
  await tags.getByRole('option', { name: /срочно/ }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Переименовать во всех файлах…' })).toBeVisible();
});

test('«Поиск»: ↩ in every file, by file; «.*» and «только заголовки»; ↓ ↩ opens the match', async ({ page }) => {
  await open(page);
  await sec(page, /Поиск/).click();
  const q = page.getByRole('textbox', { name: 'Поиск по всем файлам' });
  await q.fill('v\\d+');
  await q.press('Enter');
  const res = page.getByRole('listbox', { name: 'Результаты поиска' });
  await expect(page.locator('.sp .sum')).toHaveText('Ничего не найдено');
  await page.getByRole('button', { name: '.*' }).click();
  await expect(res.locator('.file .fn')).toHaveText(['a', 'b']);
  await expect(res.locator('mark')).toHaveText(['v1', 'v12', 'v3']);
  await expect(res.locator('.hit').nth(1).locator('.wh')).toHaveText('Миграция v1');
  await page.getByRole('button', { name: 'только заголовки' }).click();
  await expect(res.locator('mark')).toHaveText(['v1']);
  await page.getByRole('button', { name: 'только заголовки' }).click();
  await q.press('ArrowDown');
  await res.press('ArrowDown');
  await res.press('Enter');
  await expect(page.locator('header.bar .name')).toHaveText('a');
  const panel = page.getByRole('search', { name: 'Поиск в файле' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('2 из 2');
});
