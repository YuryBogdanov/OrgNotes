import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 43.1: the new sidebar — the core's sections and the plugins'; a section's panel under the line with the head of
// its group; «Сегодня» opens its tab and keeps the panel; the keys of the old navigator; the section kept on this Mac;
// a plugin turned off — «Файлы».

const F = { '/mock/a.org': '* TODO Задача :работа:\n', '/mock/b.org': '* Заметка\n' };
const secs = (page: Page) => page.getByRole('navigation', { name: 'Разделы', exact: true });
const plug = (page: Page) => page.getByRole('navigation', { name: 'Разделы плагинов' });
const head = (page: Page) => page.locator('[data-ui="next"] .side .grp.head .pt');

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
}

test('the sections: the core\'s, «Входящие» with the Inbox plugin, the plugins\' group; «Файлы» by default', async ({ page }) => {
  await open(page);
  await expect(secs(page).getByRole('button')).toHaveText([/Сегодня/, /Файлы\s*2/, /Входящие/, /Агенда/, /Теги/, /Поиск/]);
  await expect(plug(page).getByRole('button', { name: /Долгие дела/ })).toBeVisible();
  await expect(plug(page).getByRole('button', { name: /Календарь/ })).toBeVisible();
  await expect(head(page)).toHaveText('Файлы');
  await expect(page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem')).toHaveCount(2);
  await expect(secs(page).getByRole('button', { name: /Файлы/ })).toHaveAttribute('aria-current', 'true');
});

test('a click picks the panel; kept after a reload; the keys of the old navigator', async ({ page }) => {
  await open(page);
  await secs(page).getByRole('button', { name: /Агенда/ }).click();
  await expect(head(page)).toHaveText('Агенда');
  await expect(page.getByRole('navigation', { name: 'Список агенд' })).toBeVisible();
  await plug(page).getByRole('button', { name: /Долгие дела/ }).click();
  await expect(head(page)).toHaveText('Долгие дела');
  await expect(page.getByRole('region', { name: 'Панель: Долгие дела' }).getByRole('navigation', { name: 'Долгие дела' })).toBeVisible();
  await page.reload();
  await expect(head(page)).toHaveText('Долгие дела');
  await page.keyboard.press('Control+Meta+8');
  await expect(head(page)).toHaveText('Теги');
  await page.keyboard.press('Control+Meta+1');
  await expect(head(page)).toHaveText('Файлы');
  await page.keyboard.press('Control+Meta+6');
  await expect(head(page)).toHaveText('Поиск');
});

test('«Сегодня» is a section with its panel (ТЗ 50.3): the date under its head, ⇧⌘H in its title', async ({ page }) => {
  await open(page);
  const today = secs(page).getByRole('button', { name: /Сегодня/ });
  await today.click();
  await expect(head(page)).toHaveText('Сегодня');
  await expect(today).toHaveAttribute('aria-current', 'true');
  await expect(today).toHaveAttribute('title', /⇧⌘H/);
  await expect(page.locator('aside.side .grp.head .sub')).toHaveText(/^[а-я]+, \d+ [а-я]+ · неделя \d+$/);
});

test('a plugin turned off while its section is picked: «Файлы»; on again — its section is back', async ({ page }) => {
  await open(page);
  await plug(page).getByRole('button', { name: /Календарь/ }).click();
  await expect(head(page)).toHaveText('Календарь');
  const set = (on: boolean) => page.evaluate(async (v) => (await import('/src/api/host.svelte.ts' as string)).plugins.setEnabled('calendar', v), on);
  await set(false);
  await expect(plug(page).getByRole('button', { name: /Календарь/ })).toHaveCount(0);
  await expect(head(page)).toHaveText('Файлы');
  await set(true);
  await expect(plug(page).getByRole('button', { name: /Календарь/ })).toBeVisible();
});
