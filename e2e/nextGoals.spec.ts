import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';
import { FILES, NOW } from './goalsFixture';

// ТЗ 47.4: «Цели квартала» in the new interface — the sidebar's panel (the card «Мои цели» with «N цели · отметка …
// назад», «Обзор квартала», «КОМАНДА» with the silent dot, «+ Добавить ещё цели» dashed, no hint), the header of the
// new screens («4 КВАРТАЛ 2026 · …», «Цели квартала», «‹ Q3 · Q4 2026 · Q1 ›», «Отчёт за квартал», «+ Новая цель»), the
// tiles in Yeseva One (a click filters, `lampsoft`), the list by people (the avatar, «Платформа · 1on1/…», the rows).

const panel = (page: Page) => page.getByRole('navigation', { name: 'Цели' });
const view = (page: Page) => page.locator('.goals.next').filter({ has: page.locator('.nh') });

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: FILES(), now: NOW, ready: false, viewport: { width: 1440, height: 900 } });
  await pluginsReady(page);
  await page.getByRole('navigation', { name: 'Разделы плагинов' }).getByRole('button', { name: 'Цели' }).click();
  await panel(page).getByRole('button', { name: /Обзор квартала/ }).click();
  await expect(view(page)).toBeVisible();
}

test('the panel: «Мои цели» a card with the last mark, «КОМАНДА» with the silent dots, «+ Добавить ещё цели»; no hint', async ({ page }) => {
  await open(page);
  await expect(panel(page).locator('.mine .mt span')).toHaveText(/^\d+ цел\S* · отметка .+$/);
  await expect(panel(page).locator('.cap')).toHaveText('КОМАНДА');
  await expect(panel(page).locator('.row .dot').first()).toBeVisible();
  await expect(panel(page).locator('.add')).toContainText('Добавить ещё цели');
  expect(await panel(page).locator('.add').evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe('dashed');
  await expect(panel(page).locator('.hint')).toHaveCount(0);
});

test('the tab: the kicker of the quarter, «Цели квартала» in Yeseva One, the quarters, the tools; the tiles filter; the list by people', async ({ page }) => {
  await open(page);
  await expect(view(page).locator('.kick')).toHaveText(/^4 квартал 2026 · 1 окт – 31 дек · осталось \d+ дн/);
  await expect(view(page).locator('h1')).toHaveText('Цели квартала');
  expect(await view(page).locator('h1').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Yeseva One');
  await expect(view(page).locator('.nq .cur.now')).toHaveText('Q4 2026');
  await expect(view(page).locator('.tools .main')).toHaveText('+ Новая цель');
  await expect(view(page).getByRole('button', { name: 'Отчёт за квартал' })).toBeVisible();
  const tiles = view(page).locator('.tile');
  await expect(tiles).toHaveCount(4);
  expect(await tiles.first().locator('b').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Yeseva One');
  // the people: the avatar, the name, «Квартальные задачи · Работа/Тимлиды/petrov», «Разобрать цели»
  const petrov = view(page).getByRole('region', { name: 'Петров Алексей' });
  await expect(petrov.locator('.gs')).toHaveText('Квартальные задачи · Работа/Тимлиды/petrov');
  await expect(petrov.getByRole('button', { name: 'Разобрать цели' })).toBeVisible();
  await expect(petrov.locator('.note.silent')).toHaveCount(1);
  // the tile «молчат…» filters: only the silent goals, the tile lit
  await tiles.nth(3).click();
  await expect(tiles.nth(3)).toHaveClass(/on/);
  await expect(view(page).locator('.row')).toHaveCount(3);
  await tiles.nth(3).click();
  await expect(view(page).locator('.row').first()).toBeVisible();
  // a closed goal at 60%
  expect(await view(page).locator('.row.closed > .tt').first().evaluate((e) => getComputedStyle(e).opacity)).toBe('0.6');
});

// ТЗ 47.5: the wheel — the same people and the same silent goals as the list; a segment chooses the person (their
// goals on the right, «Разобрать цели», «Открыть файл»), a dot opens its goal; the view is kept with the tab.
test('«Колесо»: the silent ones as the list counts them; a segment — the person\'s goals; a dot opens the goal; kept with the tab', async ({ page }) => {
  await open(page);
  const silent = await view(page).locator('.tile').nth(3).locator('b').textContent();
  await view(page).getByRole('tab', { name: 'Колесо' }).click();
  const wheel = view(page).locator('.wheel');
  await expect(wheel).toBeVisible();
  await expect(view(page).locator('.tile')).toHaveCount(0);
  await expect(wheel.locator('.hn')).toHaveText(silent!);
  await expect(wheel.locator('.dot.silent')).toHaveCount(Number(silent));
  await expect(wheel.locator('.seg')).toHaveCount(4); // «Я» and the team
  await expect(wheel.locator('text.name')).toContainText(['Я']);
  await expect(wheel.locator('.col')).toContainText('Нажмите на сегмент');
  await wheel.getByRole('button', { name: /^Петров Алексей:/ }).click();
  await expect(wheel.locator('.col .who b')).toHaveText('Петров Алексей');
  await expect(wheel.locator('.col').getByRole('button', { name: 'Разобрать цели' })).toBeVisible();
  await expect(wheel.locator('.ray')).toHaveCount(1);
  // the tab keeps the wheel
  expect(await page.evaluate(async () => {
    const { store } = await import('/src/store.svelte.ts' as string);
    const p = store.layout.panes[0];
    return p.tabs[p.active].data;
  })).toBe('*~wheel');
  // a dot: its goal in the file
  await wheel.locator('.dot.silent').first().click();
  await expect(page.locator('.cm-content')).toBeVisible();
});
