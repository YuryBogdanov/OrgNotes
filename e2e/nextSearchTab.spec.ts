import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 53.1: the results of the search in a tab — from the panel (⌘↩, «Открыть все во вкладке»), from the palette,
// ⇧⌘F twice; one tab a window; «Поиск: <запрос>»; its header and field; the panel's query and options; not kept after
// a restart.

const F: Record<string, string> = {
  '/mock/Midterm.org': '* NEXT Переезд хранилища\nокно переезда 12 ноября\n** Риски\n- переезд контура биллинга\n',
  '/mock/work/plan.org': '* TODO План переезда\nпереезд в ноябре\n',
};
async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1400, height: 860 } });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
}
const tab = (page: Page) => page.getByRole('tab', { name: /^Поиск/ });
const field = (page: Page) => page.getByRole('textbox', { name: 'Поиск по всем файлам' });
async function searchInPanel(page: Page, q: string) {
  await page.keyboard.press('Shift+Meta+f');
  await field(page).fill(q);
  await field(page).press('Enter');
  await expect(page.locator('.sp .sum')).toContainText('совпадени');
}

test('⌘↩ in the panel: the tab «Поиск: переезд» with the same results; its header, field and count', async ({ page }) => {
  await open(page);
  await searchInPanel(page, 'переезд');
  await field(page).press('Meta+Enter');
  await expect(tab(page)).toHaveAttribute('aria-label', 'Поиск: переезд');
  const st = page.locator('.stab');
  await expect(st.locator('.kick')).toHaveText('Поиск по всем файлам');
  await expect(st.locator('h1')).toHaveText('«переезд»');
  expect(await st.locator('h1').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Yeseva');
  await expect(st.getByRole('textbox', { name: 'Запрос' })).toHaveValue('переезд');
  await expect(st.locator('.cnt')).toHaveText('5 совпадений в 2 файлах');
  await expect(st.getByRole('button', { name: 'Слово' })).toBeVisible();
  await expect(page.locator('header.bar .path')).toHaveText('5 совпадений в 2 файлах');
});

test('one tab a window; ⇧⌘F twice; «Открыть все во вкладке»; the palette; not kept after a restart', async ({ page }) => {
  await open(page);
  await searchInPanel(page, 'переезд');
  await page.getByRole('button', { name: /Открыть все во вкладке/ }).click();
  await expect(tab(page)).toHaveCount(1);
  await page.getByRole('tab').first().click();
  await page.keyboard.press('Shift+Meta+f'); // the panel is shown: the tab again, not a second one
  await expect(tab(page)).toHaveCount(1);
  await expect(tab(page)).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab').first().click();
  await page.keyboard.press('Meta+k');
  await page.keyboard.type('результаты во вкладке');
  await page.getByRole('option', { name: /Поиск: открыть результаты во вкладке/ }).click();
  await expect(tab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page)).toHaveCount(1);
  await page.reload();
  await expect(page.locator('aside.side .rail')).toBeVisible();
  await expect(page.getByRole('tab').first()).toBeVisible();
  await expect(tab(page)).toHaveCount(0);
});

test('a new query run in the tab updates the same tab', async ({ page }) => {
  await open(page);
  await searchInPanel(page, 'переезд');
  await field(page).press('Meta+Enter');
  const q = page.locator('.stab').getByRole('textbox', { name: 'Запрос' });
  await q.fill('ноябр');
  await q.press('Enter');
  await expect(tab(page)).toHaveAttribute('aria-label', 'Поиск: ноябр');
  await expect(page.locator('.stab h1')).toHaveText('«ноябр»');
  await expect(tab(page)).toHaveCount(1);
});
