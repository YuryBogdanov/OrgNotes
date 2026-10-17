import { expect, test, type Page } from '@playwright/test';
import { diskFile as disk, openApp } from './helpers';

// ТЗ 45.3 (§3.2): the built-in «Агенда» in the mode «День» — it opens on today; the week strip; the entries with a time
// as chips, «Запланировано» (a deadline of the day «срок сегодня»), «Просрочено» on today only; «Горизонт» the 30
// days after the day chosen; ← → the day, «.» today, ↑↓ ↩; the box sets the done status; «Неделя» and «Месяц» are the
// calendar's views in the same tab, none without the plugin.

const NOW = new Date(2026, 9, 16, 12, 10); // Fri 16 Oct
const WORK = `* TODO Роадмап Q4
DEADLINE: <2026-10-16 Пт>
* NEXT План переезда
SCHEDULED: <2026-10-16 Пт>
* TODO Синк платформы
SCHEDULED: <2026-10-16 Пт 09:30>
* 1-1 с Борисом <2026-10-16 Пт 12:00-12:45>
* TODO Продлить заявку
DEADLINE: <2026-10-13 Вт>
* TODO План найма
SCHEDULED: <2026-10-19 Пн>
* TODO Миграция индекса
DEADLINE: <2026-10-21 Ср>
* TODO За горизонтом
SCHEDULED: <2026-12-20 Вс>
`;
const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);
const screen = (page: Page) => page.getByRole('region', { name: 'Агенда', exact: true });

async function open(page: Page, plugins: Record<string, string[]> = {}, local: Record<string, string> = {}) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/work.org': WORK }, ...(Object.keys(plugins).length ? { plugins } : {}), local, now: NOW, ready: false, viewport: { width: 1440, height: 900 } });
  await expect.poll(() => store(page, 'return store.loaded')).toBe(true);
  await store(page, 'store.showAgendaHere()');
  await expect(screen(page)).toBeVisible();
}

test('«День» on today: the head, the strip, the timed chips, the planned and the overdue, «Горизонт»', async ({ page }) => {
  await open(page, {}, { 'plugins:enabled': JSON.stringify({ calendar: false }) });
  expect(await screen(page).evaluate((e) => !e.closest('.compat'))).toBe(true);
  await expect(screen(page).locator('.kick')).toHaveText(/Неделя 42 · Октябрь 2026/i);
  await expect(screen(page).locator('h1')).toHaveText('Пятница, 16 октября');
  await expect(screen(page).getByRole('group', { name: 'Неделя' }).getByRole('button', { pressed: true })).toContainText('16');
  await expect(screen(page).getByRole('radiogroup', { name: 'Вид' })).toHaveCount(0); // no calendar plugin
  const timed = screen(page).getByRole('group', { name: 'Со временем' });
  await expect(timed.locator('.tchip')).toHaveText(['09:30 Синк платформы', '●12:00 1-1 с Борисом']); // the dot apart by the chip's gap
  await expect(timed.locator('.tchip').first()).toHaveClass(/past/);
  const planned = screen(page).getByRole('region', { name: 'Запланировано' });
  await expect(planned.locator('.t')).toHaveText(['Роадмап Q4', 'План переезда']);
  await expect(planned.locator('.chip')).toHaveText(['срок сегодня']);
  const late = screen(page).getByRole('region', { name: 'Просрочено' });
  await expect(late.locator('.t')).toHaveText(['Продлить заявку']);
  await expect(late.locator('.chip')).toHaveText(['3 дн.']);
  const hz = screen(page).getByRole('complementary', { name: 'Горизонт' });
  await expect(hz.locator('.hdate')).toHaveText(['ПН 19', 'СР 21 · СРОК']);
  await expect(hz).not.toContainText('За горизонтом');
});

test('← → the day (no overdue off today), «.» back; ↑↓ ↩ open; the box writes DONE', async ({ page }) => {
  await open(page);
  await screen(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(screen(page).locator('h1')).toHaveText('Суббота, 17 октября');
  await expect(screen(page).getByRole('region', { name: 'Просрочено' })).toHaveCount(0);
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight');
  await expect(screen(page).getByRole('region', { name: 'Запланировано' }).locator('.t')).toHaveText(['План найма']);
  await page.keyboard.press('.');
  await expect(screen(page).locator('h1')).toHaveText('Пятница, 16 октября');
  await screen(page).getByRole('checkbox', { name: 'Выполнено: План переезда' }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toContain('* DONE План переезда');
  await screen(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(screen(page).locator('[data-k].sel')).toContainText('Роадмап Q4');
  await page.keyboard.press('Enter');
  await expect(screen(page)).toHaveCount(0);
  await expect(page.locator('.cm-activeLine')).toContainText('Роадмап Q4');
});

test('with the calendar plugin: «Неделя» is the calendar\'s week of the day chosen, in the same tab', async ({ page }) => {
  await open(page, { calendar: ['index.read', 'files.edit'] });
  const tabs = page.getByRole('tablist', { name: 'Вкладки' }).getByRole('tab');
  const n = await tabs.count();
  await screen(page).focus();
  await page.keyboard.press('ArrowRight');
  await screen(page).getByRole('radiogroup', { name: 'Вид' }).getByRole('radio', { name: 'Неделя' }).click();
  await expect(screen(page)).toHaveCount(0);
  await expect(tabs).toHaveCount(n);
  expect(await store(page, 'const p = store.layout.panes[0]; return [p.tabs[p.active].kind, p.tabs[p.active].data.view, p.tabs[p.active].data.date]')).toEqual(['calendar.view', 'week', '2026-10-17']);
});
