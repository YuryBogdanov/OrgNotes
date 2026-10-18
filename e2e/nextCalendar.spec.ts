import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { FILES, NOW } from './calendarFixture';

// ТЗ 47.2: «Календарь» in the new interface — no old layout: the header of the new screens (the range in IBM Plex
// Mono, the title in Yeseva One), the month framed, the chosen day in a column on the right (its sections fold); the
// sidebar's panel — the layers and the files ticked (the grid follows at once), «БЕЗ ДАТЫ · N»; from «Агенда»'s
// «Неделя» the calendar's week of the day, «‹ К агенде» back on the same day.

const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);
const cal = (page: Page) => page.locator('.cal.next');
const side = (page: Page) => cal(page).getByRole('complementary', { name: 'Выбранный день' });
const panel = (page: Page) => page.getByRole('navigation', { name: 'Календарь: слои и файлы' });
const cell = (page: Page, day: string) => cal(page).locator(`.cell[data-day="${day}"]`);

async function open(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, FILES());
  await page.goto('/');
  await pluginsReady(page);
  await page.getByRole('navigation', { name: 'Разделы плагинов' }).getByRole('button', { name: 'Календарь' }).click();
  await page.keyboard.press('Meta+3');
  await expect(cal(page)).toBeVisible();
}

test('the month in the new look: the kicker and the Yeseva title, the frame, today in the lamp, the column of the chosen day', async ({ page }) => {
  await open(page);
  await expect(cal(page).locator('.kick')).toHaveText('Четверг, 1 – суббота, 31 октября');
  await expect(cal(page).locator('h1')).toHaveText('Октябрь 2026');
  expect(await cal(page).locator('h1').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Yeseva One');
  expect(await cal(page).locator('.kick').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('IBM Plex Mono');
  expect(await cal(page).locator('.frame').evaluate((e) => getComputedStyle(e).borderTopLeftRadius)).toBe('8px');
  await expect(cell(page, '2026-10-12').locator('.num.today')).toHaveText('12');
  await expect(cal(page).getByRole('button', { name: 'К агенде' })).toHaveCount(0);
  // the chosen day: its date, its entries as cards, «+ Задача» the main button; «Впереди» the deadlines after it
  await expect(side(page).locator('.ndt')).toContainText('Понедельник, 12 октября');
  await expect(side(page).locator('.ncard').first()).toContainText('Планёрка с тимлидами');
  await expect(side(page).locator('.nbtns button.main')).toHaveText('+ Задача');
  await expect(side(page).locator('.nah').first()).toContainText('16 окт');
  // a section folds by its head
  await side(page).getByRole('button', { name: /^Выбранный день/ }).click();
  await expect(side(page).locator('.ncards')).toHaveCount(0);
  await side(page).getByRole('button', { name: /^Выбранный день/ }).click();
  // another day chosen: the column follows
  await cell(page, '2026-10-14').click();
  await expect(side(page).locator('.ndt')).toContainText('Среда, 14 октября');
  await expect(side(page).locator('.ncards .ncard').first()).toContainText('Синк с CTO');
});

test('the sidebar\'s panel: the ticks of the layers and the files change the grid at once; «БЕЗ ДАТЫ · N»', async ({ page }) => {
  await open(page);
  await expect(panel(page).locator('.cap')).toContainText(['ПОКАЗЫВАТЬ', 'ФАЙЛЫ']);
  await expect(panel(page).locator('.cap').last()).toHaveText(/^БЕЗ ДАТЫ · \d+$/);
  const n = await cell(page, '2026-10-14').locator('.ch').count();
  await panel(page).locator('label', { hasText: 'События' }).click();
  await expect(cell(page, '2026-10-14').locator('.ch')).toHaveCount(n - 1);
  await panel(page).locator('label', { hasText: 'События' }).click();
  await expect(cell(page, '2026-10-14').locator('.ch')).toHaveCount(n);
  await panel(page).locator('label', { hasText: 'journal' }).click();
  await expect(cal(page).locator('.ch', { hasText: 'Планёрка' })).toHaveCount(0);
  await expect(panel(page).locator('label', { hasText: 'work' }).locator('.n')).toHaveText(/^\d+$/);
});

test('the week: the day heads, «весь день», the hours in IBM Plex Mono, the events with their stripe, the line of now', async ({ page }) => {
  await open(page);
  await cal(page).getByRole('tab', { name: 'Неделя' }).click();
  await expect(cal(page).locator('h1')).toHaveText('Неделя 42');
  await expect(cal(page).locator('.wn.today')).toHaveText('12');
  expect(await cal(page).locator('.hcol span').first().evaluate((e) => getComputedStyle(e).fontFamily)).toContain('IBM Plex Mono');
  const ev = cal(page).locator('.evb', { hasText: 'Планёрка' });
  await expect(ev).toBeVisible();
  expect(await ev.evaluate((e) => getComputedStyle(e).boxShadow)).toContain('inset');
  await expect(cal(page).locator('.nowline')).toHaveCount(1);
});

test('from «Агенда»: «Неделя» opens the calendar\'s week of the day, «‹ К агенде» goes back on the same day', async ({ page }) => {
  await open(page);
  await store(page, 'store.agendaInTab("2026-10-20")');
  const agenda = page.getByRole('region', { name: 'Агенда', exact: true });
  await expect(agenda).toBeVisible();
  await expect(agenda.locator('.kick')).toContainText('Неделя 43');
  await agenda.getByRole('radiogroup', { name: 'Вид' }).getByRole('radio', { name: 'Неделя' }).click();
  await expect(cal(page)).toBeVisible();
  await expect(cal(page).locator('h1')).toHaveText('Неделя 43');
  await cal(page).getByRole('button', { name: '‹ К агенде' }).click();
  await expect(agenda).toBeVisible();
  await expect(agenda.locator('.kick')).toContainText('Неделя 43');
  expect(await store(page, 'const p = store.layout.panes[0]; return p.tabs[p.active].data.date')).toBe('2026-10-20');
});
