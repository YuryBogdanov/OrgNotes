import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { openApp } from './helpers';
import { FILES, NOW } from './calendarFixture';

// ТЗ 56.5: the plugins — `ui.taskList` without `otherLabel` gets the file beside from the core (the calendar, ⌥↩; its
// column of the chosen day hidden meanwhile), `ui.openBeside` for a plugin's own screen («Долгие дела» ⌥↩, the
// calendar's ⌥-click), false outside a tab of the plugin's views.

const side = (page: Page) => page.getByRole('region', { name: 'Файл сбоку' });

test('the calendar: ⌥↩ on an entry — its file beside (the core, no change of the plugin); ⌥-click; the column hidden', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, FILES());
  await page.goto('/');
  await pluginsReady(page);
  await page.getByRole('navigation', { name: 'Разделы плагинов' }).getByRole('button', { name: 'Календарь' }).click();
  await page.keyboard.press('Meta+3');
  const cal = page.locator('.cal.next');
  await expect(cal).toBeVisible();
  await cal.locator('.cell[data-day="2026-10-14"] .ch', { hasText: 'Подготовить бюджет' }).first().click();
  await page.keyboard.press('Alt+Enter');
  await expect(side(page)).toBeVisible();
  await expect(side(page).locator('header')).toContainText('Подготовить бюджет 2027');
  await expect(cal.getByRole('complementary', { name: 'Выбранный день' })).toBeHidden();
  await cal.locator('.cell[data-day="2026-10-14"] .ch', { hasText: 'Синк с CTO' }).first().click({ modifiers: ['Alt'] });
  await expect(side(page).locator('header')).toContainText('Синк с CTO');
  await page.keyboard.press('Escape');
  await expect(side(page)).toHaveCount(0);
  await expect(cal.getByRole('complementary', { name: 'Выбранный день' })).toBeVisible();
});

test('«Долгие дела»: ⌥↩ on a matter — `ui.openBeside`; false in a file tab', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/Midterm.org': '* NEXT Миграция биллинга\nсрок — ноябрь\n* NEXT Обновить SLA\n' }, now: new Date(2026, 9, 16, 11), ready: false, viewport: { width: 1440, height: 900 } });
  await pluginsReady(page);
  // in a file's tab: false
  expect(await page.evaluate(async () => {
    const { plugins } = await import('/src/api/host.svelte.ts' as string);
    return (plugins as any).ctxOf(plugins.manifest('long-matters')).ui.openBeside({ path: 'Midterm.org', line: 0 });
  })).toBe(false);
  await page.keyboard.press('Control+Meta+9');
  await page.getByRole('button', { name: 'Открыть список ›' }).click();
  const view = page.locator('.lmv.next');
  await expect(view).toBeVisible();
  await view.locator('.row', { hasText: 'Обновить SLA' }).first().click();
  await page.keyboard.press('Alt+Enter');
  await expect(side(page)).toBeVisible();
  await expect(side(page).locator('header')).toContainText('Обновить SLA');
  await expect(side(page).locator('.cm-sub.top')).toContainText('Обновить SLA');
  await view.locator('.row', { hasText: 'Миграция биллинга' }).first().click({ modifiers: ['Alt'] });
  await expect(side(page).locator('header')).toContainText('Миграция биллинга');
});
