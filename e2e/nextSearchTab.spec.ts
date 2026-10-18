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

// ТЗ 53.2: the results with their context — the line before and after, numbered; neighbours under one heading in one
// block; the heading's status and path over it; four blocks, then «Ещё N в <файл> ›»; a file changed since; nothing found
const MANY = ['* NEXT Переезд', ...Array.from({ length: 6 }, (_, i) => [`** Шаг ${i + 1}`, `переезд, этап ${i + 1}`]).flat(), ''].join('\n');
test('a block: its status and path, the lines around the match numbered; near matches one block; «Ещё N»; changed; nothing', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { ...F, '/mock/many.org': MANY }, ready: false, viewport: { width: 1400, height: 860 } });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
  await searchInPanel(page, 'переезд');
  await field(page).press('Meta+Enter');
  const mid = page.locator('.stab').getByRole('region', { name: 'Midterm' });
  const blocks = mid.getByRole('option');
  await expect(blocks).toHaveCount(2); // the heading with its line after; the match under «Риски»
  await expect(blocks.first().locator('.cap')).toHaveText('NEXT');
  await expect(blocks.first().locator('.ln .no')).toHaveText(['1', '2']);
  await expect(blocks.first().locator('.ln.hd .tx')).toHaveText('Переезд хранилища');
  await expect(blocks.nth(1).locator('.wh')).toHaveText('Переезд хранилища › Риски');
  await expect(mid.locator('.file .fd')).toHaveText('корень');
  await expect(page.locator('.stab').getByRole('region', { name: 'plan' }).locator('.file .fd')).toHaveText('work');
  // six matches, one a heading's: four blocks first
  const many = page.locator('.stab').getByRole('region', { name: 'many' });
  await expect(many.getByRole('option')).toHaveCount(4);
  await many.getByRole('button', { name: /^Ещё \d+ в many ›$/ }).click();
  await expect(many.getByRole('option')).toHaveCount(7);
  // the file changed since: «изменён — ↩ обновить»
  await page.evaluate(async () => { const { store } = await import('/src/store.svelte.ts' as string); store.setText('* NEXT Переезд хранилища\nновая строка\n', '/mock/Midterm.org'); });
  await expect(mid.locator('.stale')).toHaveText('изменён — ↩ обновить');
  const q = page.locator('.stab').getByRole('textbox', { name: 'Запрос' });
  await q.fill('нетнигде');
  await q.press('Enter');
  await expect(page.locator('.stab .none')).toHaveText('Ничего не найдено');
});
