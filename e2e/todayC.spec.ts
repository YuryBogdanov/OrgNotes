import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { FILES, NOW, PETROV } from './goalsFixture';

// ТЗ 32 (part C): «1-1 сегодня» — a card for a meeting of the day, with the goals' line and «Разбор целей» from the
// plugin «Цели квартала» (its API: `ui.oneOnOne`); the plugin's block «Цели квартала» (`ui.todayBlock`); the reminder
// to end the day (without macOS's notification — the window's own). «Now» is Mon 12 Oct 2026, 14:00.

const disk = (page: Page, p: string) => page.evaluate((x) => (window as any).__disk[x] as string, p);
const screen = (page: Page) => page.getByRole('region', { name: 'Сегодня', exact: true });

/** Petrov's 1-1 every two weeks on Mondays, the last on 28 Sep with an agreement open. */
function files() {
  const f = FILES() as Record<string, string>;
  f[PETROV] = f[PETROV].replace(
    '* 1-1\n** Встреча 5 окт\n',
    '* 1-1 :1on1:\n<2026-09-28 Пн 15:00-15:45 +2w>\n** [2026-09-28 Пн]\n*** TODO Прислать план онбординга\n*** DONE Договориться про дежурства\n',
  );
  return f;
}
async function open(page: Page, o: { remind?: boolean; at?: Date; extra?: Record<string, string> } = {}) {
  await page.clock.setFixedTime(o.at ?? NOW);
  await page.setViewportSize({ width: 1440, height: 960 });
  await installTauriMock(page, { ...files(), ...(o.extra ?? {}) }, { today: true, remind: o.remind });
  await page.goto('/');
  await expect(screen(page)).toBeVisible();
  await pluginsReady(page);
}

test('«1-1 сегодня»: the person, how often, the last meeting and its open agreements; the goals\' line and «Разбор целей» from the plugin', async ({ page }) => {
  await open(page);
  const card = screen(page).getByRole('region', { name: '1-1 сегодня: Петров Алексей' });
  await expect(card).toContainText('15:00');
  await expect(card).toContainText('Работа/Тимлиды/petrov.org · каждые 2 недели · прошлая — 28 сентября');
  await expect(card).toContainText('Цели: 2 активных, 1 молчит больше 14 дней');
  await expect(card).toContainText('Открытые договорённости с прошлой 1-1: 1');
  await expect(card.getByRole('button', { name: 'Разбор целей' })).toBeVisible();
  await expect(screen(page).getByRole('region', { name: 'Агенда на сегодня' }).locator('.badge')).toHaveText('1-1');

  await card.getByRole('button', { name: 'Новая встреча' }).click();
  await expect.poll(() => disk(page, PETROV)).toContain('* 1-1 :1on1:\n<2026-09-28 Пн 15:00-15:45 +2w>\n** [2026-10-12 Пн]\n\n** [2026-09-28 Пн]');
  await expect(page.locator('.pane').first().getByRole('tab', { selected: true })).toContainText('petrov');
  await page.getByRole('tab', { name: /Сегодня/ }).click();
  await expect(card.getByRole('button', { name: 'Открыть встречу' })).toBeVisible();

  await card.getByRole('button', { name: 'Разбор целей' }).click();
  await expect(page.getByRole('tab', { selected: true }).filter({ hasText: /Разбор|Петров/ }).first()).toBeVisible();
});

test('no meeting today: no card; the tag is the settings\'', async ({ page }) => {
  await open(page, { at: new Date(2026, 9, 13, 14, 0) });
  await expect(screen(page).getByRole('region', { name: /^1-1 сегодня/ })).toHaveCount(0);
});

test('«Цели квартала»: the plugin\'s block — mine first, the time since the last mark, a silent one lit; off with the plugin', async ({ page }) => {
  await open(page);
  const block = screen(page).getByRole('region', { name: 'Цели квартала' });
  await expect(block).toContainText('Q4 · последняя отметка');
  const rows = block.locator('.qg-tr');
  await expect(rows.first()).toContainText('Мои цели');
  const petrov = rows.filter({ hasText: 'Петров Алексей' });
  await expect(petrov).toContainText('2 цели');
  await expect(petrov.locator('.qg-ago')).toHaveText('3 дня назад');
  await expect(petrov.locator('.qg-ago')).toHaveClass(/silent/); // the CI goal: 20 days without a mark
  await expect(petrov).toHaveAttribute('title', /Сократить время сборки CI до 10 минут — 20 дней без отметок/);
  await petrov.click();
  await expect(page.getByRole('tab', { selected: true }).filter({ hasText: 'Петров Алексей' })).toBeVisible();

  // «Настройки → Сегодня» lists it with its hint; turned off there, it leaves the screen
  await page.getByRole('tab', { name: /Сегодня/ }).click();
  await screen(page).getByRole('button', { name: 'Настроить экран' }).click();
  const list = page.getByRole('dialog', { name: 'Настройки' }).getByRole('list', { name: 'Блоки' });
  await expect(list).toContainText('Добавляет плагин «Цели квартала»');
  await list.getByRole('switch', { name: 'Цели квартала' }).click();
  await page.keyboard.press('Escape');
  await expect(screen(page).getByRole('region', { name: 'Цели квартала' })).toHaveCount(0);
});

test('the reminder: on a working day after 17:30 the window asks (no notification of macOS here); its button opens the sheet', async ({ page }) => {
  await open(page, { remind: true, at: new Date(2026, 9, 12, 17, 31) });
  const nudge = page.locator('.toast').filter({ hasText: 'Завершить день?' });
  await expect(nudge).toBeVisible();
  await nudge.getByRole('button', { name: 'Завершить день…' }).click();
  await expect(page.getByRole('dialog', { name: 'Завершить день' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(screen(page)).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('.toast').filter({ hasText: 'Завершить день?' })).toHaveCount(0); // once a day
});

test('the reminder: not before its time, not when the day is ended', async ({ page }) => {
  await open(page, { remind: true, at: new Date(2026, 9, 12, 17, 0) });
  await page.waitForTimeout(500);
  await expect(page.locator('.toast').filter({ hasText: 'Завершить день?' })).toHaveCount(0);

  const p2 = await page.context().browser()!.newPage();
  await open(p2, { remind: true, at: new Date(2026, 9, 12, 18, 0), extra: { '/mock/journal.org': '* 2026\n** 2026-10 Октябрь\n*** 2026-10-12 Пн\n**** На завтра\n- x\n' } });
  await p2.waitForTimeout(500);
  await expect(p2.locator('.toast').filter({ hasText: 'Завершить день?' })).toHaveCount(0);
  await p2.close();
});
