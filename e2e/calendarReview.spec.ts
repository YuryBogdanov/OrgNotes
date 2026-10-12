import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { FILES, NOW } from './calendarFixture';

// ТЗ 24, part 3: the calendar under the card of the Inbox review — folded by default, ⌘K, the month of the task's
// date with a dashed frame, two entries in a cell and «… ещё N» with «— эта задача».

const INBOX = `* TODO Подготовить презентацию для CTO
DEADLINE: <2026-10-16 Пт>
* TODO Позвонить юристу
DEADLINE: <2026-11-03 Вт>
`;
async function start(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installTauriMock(page, { ...FILES(), '/mock/inbox.org': INBOX, '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'inbox.org', reviewOrder: 'old' } }) });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Inbox' }).click();
  await page.locator('.inbox').getByRole('button', { name: 'Разобрать' }).click();
  await expect(page.locator('.review .card')).toBeVisible();
}
const toggle = (page: Page) => page.locator('.rcal .toggle');
const cal = (page: Page) => page.getByRole('region', { name: 'Календарь' });
const cell = (page: Page, day: string) => cal(page).locator(`.cell[data-day="${day}"]`);
const cardTitle = (page: Page) => page.locator('.review .card .cm-line').first();

test('folded by default with the month and the count; ⌘K and the button show it; it stays from card to card', async ({ page }) => {
  await start(page);
  await expect(cardTitle(page)).toContainText('презентацию');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page)).toContainText(/Показать календарь\s*Октябрь 2026 · \d+ запис/);
  await expect(cal(page)).toHaveCount(0);
  await page.keyboard.press('Meta+k');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle(page)).toContainText('Скрыть календарь');
  await expect(cal(page)).toContainText('Показываются запланированные задачи, дедлайны и события из всех файлов');
  await page.keyboard.press('Meta+5'); // skip: the next card, the calendar stays open
  await expect(cardTitle(page)).toContainText('юристу');
  await expect(cal(page)).toBeVisible();
  await toggle(page).click();
  await expect(cal(page)).toHaveCount(0);
});

test("the month of the task's date, its cell framed; two entries and «… ещё N» marking «— эта задача»; leafing holds until the next card", async ({ page }) => {
  await start(page);
  await toggle(page).click();
  await expect(cal(page).locator('header b')).toHaveText('Октябрь 2026');
  await expect(cal(page).locator('.cell.mark')).toHaveAttribute('data-day', '2026-10-16');
  const c16 = cell(page, '2026-10-16');
  await expect(c16.locator('.ch')).toHaveCount(2);
  await expect(c16.locator('.more')).toHaveText(/… ещё \d+/);
  await c16.locator('.more').click();
  const list = page.getByRole('dialog', { name: 'Записи на день' });
  await expect(list.locator('.mine')).toContainText('Подготовить презентацию для CTO — эта задача');
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await cal(page).getByRole('button', { name: 'Назад' }).click();
  await expect(cal(page).locator('header b')).toHaveText('Сентябрь 2026');
  await page.keyboard.press('Meta+5');
  await expect(cal(page).locator('header b')).toHaveText('Ноябрь 2026');
  await expect(cal(page).locator('.cell.mark')).toHaveAttribute('data-day', '2026-11-03');
  await expect(cell(page, '2026-11-03').locator('.ch.mine')).toHaveCount(1);
});

test('a new review starts folded again; ⌘K is in «Клавиши»', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Meta+k');
  await expect(cal(page)).toBeVisible();
  await page.keyboard.press('Meta+5');
  await page.keyboard.press('Meta+5');
  await page.getByRole('button', { name: 'Разобрать пропущенные' }).click();
  await expect(cardTitle(page)).toContainText('презентацию');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Meta+,');
  await page.getByRole('tab', { name: 'Клавиши' }).click();
  await expect(page.getByRole('dialog', { name: 'Настройки' })).toContainText('Разбор: Показать / скрыть календарь');
});
