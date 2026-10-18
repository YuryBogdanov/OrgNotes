import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 53.1: the results of the search in a tab — from the panel (⌘↩, «Открыть все во вкладке»), from the palette,
// ⇧⌘F twice; one tab a window; «Поиск: <запрос>»; its header and field; the panel's query and options; not kept after
// a restart.

const F: Record<string, string> = {
  '/mock/Midterm.org': '* NEXT Переезд хранилища\nокно переезда 12 ноября\n** Риски\n- переезд контура биллинга\n',
  '/mock/work/plan.org': '* TODO План переезда\nпереезд в ноябре\n',
};
async function open(page: Page, files = F) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files, ready: false, viewport: { width: 1400, height: 860 } });
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

// ТЗ 53.3: the filters choose from what was found; the numbers of each over the others; a new query drops them.
const T: Record<string, string> = {
  '/mock/Midterm.org': '* NEXT Переезд хранилища :infra:\nокно переезда 12 ноября\n** Риски :risk:\n- переезд контура биллинга\n',
  '/mock/work/plan.org': '#+FILETAGS: :work:\n* TODO План переезда\nпереезд в ноябре\n* Заметки\nпереезд потом\n',
};
test('filters: files, statuses (ИЛИ), tags (И, inherited), the count «N из M», «Сбросить»; «Где искать» runs again', async ({ page }) => {
  await open(page, T);
  await searchInPanel(page, 'переезд');
  await field(page).press('Meta+Enter');
  const st = page.locator('.stab');
  const fl = st.getByRole('complementary', { name: 'Фильтры' });
  await expect(st.locator('.cnt')).toHaveText('6 совпадений в 2 файлах');
  await expect(fl.getByRole('button', { name: 'Сбросить', exact: true })).toHaveCount(0);
  // the statuses: NEXT 2, TODO 2, «без статуса» 2 (Риски, Заметки) — last
  const chips = fl.getByRole('group', { name: 'Статус' }).getByRole('button');
  await expect(chips).toHaveText(['NEXT2', 'TODO2', 'без статуса2']);
  // the tags, with the inherited ones: infra 3 (Переезд, its text, Риски), work 3 (the file's), risk 1
  const tags = fl.getByRole('group', { name: 'Теги' }).getByRole('button');
  await expect(tags).toHaveText(['infra3', 'work3', 'risk1']);
  await tags.filter({ hasText: 'work' }).click();
  await expect(st.locator('.cnt')).toHaveText('3 из 6 — с фильтрами');
  await expect(st.locator('section.grp')).toHaveCount(1);
  await expect(chips).toHaveText(['TODO2', 'без статуса1']); // over the tag, not over itself
  await expect(tags).toHaveText(['work3', 'infra3', 'risk1']); // the chosen first; the tags' numbers without the tags
  await tags.filter({ hasText: 'work' }).click();
  await tags.filter({ hasText: 'infra' }).click();
  await expect(st.locator('.cnt')).toHaveText('3 из 6 — с фильтрами');
  await tags.filter({ hasText: 'risk' }).click(); // И
  await expect(st.locator('.cnt')).toHaveText('1 из 6 — с фильтрами');
  await fl.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(st.locator('.cnt')).toHaveText('6 совпадений в 2 файлах');
  // statuses ИЛИ
  await chips.filter({ hasText: 'NEXT' }).click();
  await chips.filter({ hasText: 'TODO' }).click();
  await expect(st.locator('.cnt')).toHaveText('4 из 6 — с фильтрами');
  await expect(st.locator('section.grp .n')).toHaveText(['2', '2']);
  // a file taken off: its group goes
  await fl.getByRole('group', { name: 'Файлы' }).getByText('plan').click();
  await expect(st.locator('.cnt')).toHaveText('2 из 6 — с фильтрами');
  await expect(st.locator('section.grp')).toHaveCount(1);
  // nothing with the filters
  await chips.filter({ hasText: 'NEXT' }).click();
  await expect(st.locator('.none')).toContainText('С фильтрами ничего не найдено');
  await st.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(st.locator('section.grp')).toHaveCount(2);
  // «Где искать» — the panel's scope: the search runs again, the filters stay
  await chips.filter({ hasText: 'TODO' }).click();
  await fl.getByRole('radio', { name: 'Заголовки' }).click();
  await expect(st.locator('.cnt')).toHaveText('1 из 2 — с фильтрами');
  await expect(fl.getByRole('radio', { name: 'Заголовки' })).toHaveAttribute('aria-checked', 'true');
  // a new query drops the filters, not the scope
  await st.getByRole('textbox', { name: 'Запрос' }).fill('риски');
  await st.getByRole('textbox', { name: 'Запрос' }).press('Enter');
  await expect(st.locator('.cnt')).toHaveText('1 совпадение в 1 файле');
  await expect(fl.getByRole('radio', { name: 'Заголовки' })).toHaveAttribute('aria-checked', 'true');
  await expect(chips).toHaveText(['без статуса1']);
});
