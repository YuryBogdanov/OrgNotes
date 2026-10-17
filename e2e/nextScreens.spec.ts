import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 43.4: the core's screens and the plugins' tabs in the new interface — old components through the bridges, in
// the compatibility layer: «Сегодня» pinned first, its icon alone; the agenda; a plugin's view; the agenda builder
// over the window. The toolbar names the screen, its crumbs under it; «Оформление / Исходник» over a text only. No
// colour of the old theme in them.

const F = { '/mock/work.org': '* TODO Отчёт\nSCHEDULED: <2026-10-16 Пт>\n* WAIT Миграция :long:\n' };
const NOW = new Date(2026, 9, 16, 11);
const OLD = ['rgb(10, 100, 214)', 'rgb(10, 88, 194)', 'rgb(108, 180, 255)']; // the old theme's accent and blue

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, now: NOW, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
}
/** Every colour drawn inside an element: none of the old theme's. */
const foreign = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((root, old) => {
    const bad: string[] = [];
    for (const e of [root, ...root.querySelectorAll('*')]) {
      const cs = getComputedStyle(e);
      for (const c of [cs.color, cs.backgroundColor, cs.borderTopColor]) if (old.includes(c)) bad.push(`${e.tagName}.${e.className}: ${c}`);
    }
    return bad;
  }, OLD);
const bar = (page: Page) => page.locator('.next[data-ui="next"] header.bar');
const mode = (page: Page) => page.getByRole('radiogroup', { name: 'Вид текста' });

test('«Сегодня»: the pinned first tab, its icon alone; the toolbar — «Сегодня» and the day; its own screen (ТЗ 45), no old colours', async ({ page }) => {
  await open(page);
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'work' }).click();
  await expect(mode(page)).toBeVisible();
  await page.keyboard.press('Shift+Meta+h');
  const today = page.locator('.today[role="region"][aria-label="Сегодня"]');
  await expect(today).toBeVisible();
  expect(await today.evaluate((e) => !e.closest('.compat'))).toBe(true); // drawn by the new interface now (ТЗ 45.1)
  const first = page.getByRole('tablist', { name: 'Вкладки' }).getByRole('tab').first();
  await expect(first).toHaveAttribute('aria-label', 'Сегодня');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(first.locator('.lbl')).toHaveCount(0);
  await expect(bar(page).locator('.name')).toHaveText('Сегодня');
  await expect(bar(page).locator('.path')).toHaveText('пятница, 16 октября');
  await expect(mode(page)).toHaveCount(0);
  expect(await foreign(page, '.today[role="region"]')).toEqual([]);
});

test('the agenda: its tab from the sidebar\'s list, in the layer; the builder over the window', async ({ page }) => {
  await open(page);
  await page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: /Агенда/ }).click();
  const list = page.getByRole('navigation', { name: 'Список агенд' });
  await list.getByRole('button').first().click();
  await expect(bar(page).locator('.name')).toHaveText('Агенда');
  await expect(page.locator('.next .area .compat')).toHaveCount(1);
  expect(await foreign(page, '.next .area')).toEqual([]);
  expect(await foreign(page, '[aria-label="Панель: Агенда"]')).toEqual([]);
  await list.getByRole('button', { name: /Новая агенда/ }).click();
  const builder = page.getByRole('dialog', { name: 'Конструктор агенды' });
  await expect(builder).toBeVisible();
  expect(await builder.evaluate((e) => !!e.closest('.compat[data-ui="next"]'))).toBe(true);
  expect(await page.locator('.next > .win').evaluate((e) => (e as HTMLElement).inert)).toBe(true);
});

test('a plugin\'s view: «Долгие дела» in the layer; the toolbar names it', async ({ page }) => {
  await open(page);
  await page.getByRole('navigation', { name: 'Разделы плагинов' }).getByRole('button', { name: /Долгие дела/ }).click();
  await page.getByRole('button', { name: 'Открыть список ›' }).click();
  const grid = page.getByRole('grid', { name: 'Долгие дела' });
  await expect(grid).toBeVisible();
  expect(await grid.evaluate((e) => !!e.closest('.compat[data-ui="next"]'))).toBe(true);
  await expect(bar(page).locator('.name')).toHaveText('Долгие дела');
  await expect(mode(page)).toHaveCount(0);
  expect(await foreign(page, '.next .area')).toEqual([]);
});
