import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { FILES, NOW, WORK } from './calendarFixture';

// ТЗ 34, part C2: the calendar is a list of tasks — a click on a chip chooses it (a ring), a double click or ↩ opens
// it; ↑ ↓ go over the entries of its day; the core's menu and keys act on it, the chip goes to its new day at once;
// the day panel shows the task with «Выполнено» and «Перенести…»; «Без даты» chooses too.

async function open(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await pluginsReady(page);
  await page.keyboard.press('Meta+3');
  await expect(cal(page)).toBeVisible();
}
const cal = (page: Page) => page.locator('section.pane.active .cal');
const cell = (page: Page, day: string) => cal(page).locator(`.cell[data-day="${day}"]`);
const chip = (page: Page, day: string, text: string) => cell(page, day).locator('.ch', { hasText: text });
const panel = (page: Page) => page.getByRole('region', { name: 'Выбранный день' });
const disk = (page: Page) => page.evaluate((x) => (window as any).__disk[x] as string, WORK);

test('a click chooses a chip (its day too), the panel shows the task; ↑ ↓ in the day; ↩ opens; a click on the day lets it go', async ({ page }) => {
  await open(page);
  const c = chip(page, '2026-10-14', 'Подготовить бюджет 2027');
  await c.click();
  await expect(c).toHaveClass(/picked/);
  await expect(c).toHaveCSS('box-shadow', /inset/);
  await expect(cell(page, '2026-10-14')).toHaveClass(/sel/);
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('Календарь'); // nothing opened
  const task = panel(page).getByLabel('Выбранная задача');
  await expect(task).toContainText('Подготовить бюджет 2027');
  await expect(task.getByRole('button', { name: 'Выполнено' })).toBeVisible();
  await expect(task.getByRole('button', { name: 'Перенести…' })).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(chip(page, '2026-10-14', 'Синк с CTO')).toHaveClass(/picked/);
  await page.keyboard.press('ArrowDown');
  await expect(c).toHaveClass(/picked/);
  await cell(page, '2026-10-14').locator('.num').click();
  await expect(cal(page).locator('.picked')).toHaveCount(0);
  await c.click();
  await page.keyboard.press('Enter');
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('work');
  await expect(page.locator('section.pane.active .cm-activeLine')).toContainText('Подготовить бюджет 2027');
});

test('the core\'s menu on a chip: «Завтра» moves it to its new day at once; ⌥⇧→; «Выполнено» of the panel; ⌘Z', async ({ page }) => {
  await open(page);
  await chip(page, '2026-10-12', 'Свести расходы').click({ button: 'right' });
  const menu = page.locator('.menu').first();
  await menu.getByRole('menuitem', { name: 'Запланировать' }).hover();
  await page.locator('.menu').nth(1).getByRole('menuitem', { name: 'Завтра' }).click(); // tomorrow of NOW: the 13th
  await expect.poll(() => disk(page)).toContain('** NEXT Свести расходы по направлениям\nSCHEDULED: <2026-10-13 Вт>');
  await expect(chip(page, '2026-10-13', 'Свести расходы')).toHaveClass(/picked/); // there at once, still chosen
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect.poll(() => disk(page)).toContain('SCHEDULED: <2026-10-14 Ср>');
  await expect(chip(page, '2026-10-14', 'Свести расходы')).toBeVisible();
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page)).toContain('SCHEDULED: <2026-10-13 Вт>');
  await panel(page).getByLabel('Выбранная задача').getByRole('button', { name: 'Выполнено' }).click();
  await expect.poll(() => disk(page)).toContain('** DONE Свести расходы по направлениям');
});

test('«… ещё N» and «Без даты»: a click chooses, the core\'s menu there too', async ({ page }) => {
  await open(page);
  await cell(page, '2026-10-16').locator('.more').click();
  const list = page.getByRole('dialog', { name: 'Записи на день' });
  await list.getByRole('option', { name: /Отчёт за Q3/ }).click();
  await expect(list.getByRole('option', { name: /Отчёт за Q3/ })).toHaveClass(/picked/);
  await expect(panel(page).getByLabel('Выбранная задача')).toContainText('Отчёт за Q3');
  await page.keyboard.press('Escape');
  const ud = page.locator('.calnav .ud', { hasText: 'План найма на Q4' });
  await ud.click();
  await expect(ud).toHaveClass(/picked/);
  await ud.click({ button: 'right' });
  await page.locator('.menu').first().getByRole('menuitem', { name: 'Запланировать' }).hover();
  await page.locator('.menu').nth(1).getByRole('menuitem', { name: 'Сегодня' }).click();
  await expect.poll(() => disk(page)).toContain('** TODO План найма на Q4\nSCHEDULED: <2026-10-12 Пн>');
  await expect(chip(page, '2026-10-12', 'План найма на Q4')).toBeVisible();
});
