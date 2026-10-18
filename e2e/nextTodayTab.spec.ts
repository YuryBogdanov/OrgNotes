import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { FILES, NOW } from './todayFixture';

// ТЗ 50.3: no pinned tab in the new interface — «Сегодня» is a tab as any (closed, not first, the sun at the active
// one); the section «Сегодня» has its panel; ⇧⌘H shows the panel, again — the full version; the palette has both;
// shown at the start of the day — the full version, as the pinned tab was.

const screen = (page: Page) => page.getByRole('region', { name: 'Сегодня', exact: true });
const tabs = (page: Page) => page.getByRole('tab');
const head = (page: Page) => page.locator('aside.side .grp.head .pt');

async function open(page: Page, show = true) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await installTauriMock(page, FILES(), { today: show }); // not shown yet today — it comes by itself
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
}

test('shown at the start of the day: the full version, a tab as any — no pin, «×» closes it', async ({ page }) => {
  await open(page);
  await expect(screen(page)).toBeVisible();
  const t = tabs(page).filter({ hasText: 'Сегодня' });
  await expect(t).toHaveCount(1);
  await expect(t).not.toHaveClass(/pin/);
  await t.hover();
  await t.getByRole('button', { name: /Закрыть/ }).click();
  await expect(tabs(page).filter({ hasText: 'Сегодня' })).toHaveCount(0);
  await expect(screen(page)).toHaveCount(0);
});

test('⇧⌘H: the panel «Сегодня»; again — its tab after the active one; the panel then has no «Полная версия»', async ({ page }) => {
  await open(page, false);
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  await expect(tabs(page).filter({ hasText: 'Сегодня' })).toHaveCount(0);
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem').last().click();
  await page.keyboard.press('Shift+Meta+h');
  await expect(head(page)).toHaveText('Сегодня');
  await expect(tabs(page).filter({ hasText: 'Сегодня' })).toHaveCount(0);
  const panel = page.getByRole('region', { name: 'Панель: Сегодня' });
  await expect(panel.getByRole('button', { name: 'Полная версия' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Завершить день' })).toBeVisible();
  await page.keyboard.press('Shift+Meta+h');
  await expect(screen(page)).toBeVisible();
  const names = await tabs(page).allTextContents();
  expect(names.findIndex((n) => n.includes('Сегодня'))).toBe(names.length - 1); // after the file, not first
  await expect(panel.getByRole('button', { name: 'Полная версия' })).toHaveCount(0);
});

test('the palette: «Сегодня» — the panel, «Сегодня — полная версия» — the tab', async ({ page }) => {
  await open(page, false);
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  const run = async (q: string, name: string | RegExp) => {
    await page.keyboard.press('Meta+k');
    await page.keyboard.type(q);
    await page.getByRole('option', { name }).first().click();
  };
  await run('сегодня', /^Сегодня — полная версия/);
  await expect(screen(page)).toBeVisible();
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem').last().click();
  await run('сегодня', /^Сегодня(?! —)/);
  await expect(head(page)).toHaveText('Сегодня');
});
