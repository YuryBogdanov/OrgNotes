import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { FILES, NOW } from './todayFixture';

// ТЗ 50.4: the panel «Сегодня» — by a file, the compact day (the progress, every block of the screen short — fix
// #311 —, the screen's data); by the tab «Сегодня», its contents (a row a block, a click scrolls to it, the one at the top lit,
// «Настроить блоки…»). A task ticked on the screen is so in the panel at once.

const panel = (page: Page) => page.getByRole('region', { name: 'Панель: Сегодня' });
const screen = (page: Page) => page.getByRole('region', { name: 'Сегодня', exact: true });
async function open(page: Page) {
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await installTauriMock(page, FILES(), { today: false });
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem').last().click();
  await page.keyboard.press('Shift+Meta+h');
  await expect(panel(page)).toBeVisible();
}

test('by a file: the compact day — the progress, «Главное», the meetings (the past ones struck), the overdue with their days', async ({ page }) => {
  await open(page);
  await expect(panel(page).locator('.pl')).toContainText(/^Сделано \d+ из \d+/);
  await expect(panel(page).getByRole('progressbar', { name: 'Сделано за день' })).toBeVisible();
  const main = panel(page).getByRole('region', { name: 'Главное' });
  await expect(main.locator('.row')).toHaveText([/Бюджет на нагрузочное/, /Вопросы к ревью биллинга/]);
  await expect(main.locator('.row .cap').first()).toHaveText('TODO');
  const meet = panel(page).getByRole('region', { name: 'Агенда на сегодня' });
  await expect(meet.locator('.row').first()).toHaveClass(/past/);
  await expect(meet.locator('.row .tm').first()).toHaveCSS('font-family', /Plex Mono/);
  const late = panel(page).getByRole('region', { name: 'Просрочено' });
  await expect(late.locator('.gh')).toHaveCSS('color', 'rgb(196, 67, 47)');
  await expect(late.locator('.row').first().locator('.late')).toHaveText(/^\d+ дн\.$/);
  await expect(panel(page).getByRole('button', { name: 'Полная версия' })).toBeVisible();
  // fix #311: every block of the screen in its order — the note in a line of the monospace, «Задачи» too
  const order = await panel(page).locator('.body > .grp').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  for (const b of ['Главное', 'Задачи', 'Агенда на сегодня', 'Просрочено']) expect(order).toContain(b);
  await expect(panel(page).getByRole('region', { name: 'Задачи' }).locator('.row').first()).toBeVisible();
  // a row: a click chooses it, a double click opens its heading in the file
  const row = main.locator('.row').first();
  await row.click();
  await expect(row).toHaveClass(/sel/);
  await row.dblclick();
  await expect(page.locator('.cm-activeLine')).toContainText('Бюджет на нагрузочное');
});

test('the same data as the screen: a task ticked there is done in the panel at once', async ({ page }) => {
  await open(page);
  await panel(page).getByRole('button', { name: 'Полная версия' }).click();
  await expect(screen(page)).toBeVisible();
  // the panel is the screen's contents now; back to the file to see the compact day
  await screen(page).getByRole('checkbox', { name: 'Выполнено: Бюджет на нагрузочное' }).click();
  await page.getByRole('tab').first().click();
  await expect(panel(page).getByRole('region', { name: 'Главное' }).locator('.row').first()).toHaveClass(/done/);
  await expect(panel(page).locator('.pl')).toContainText(/^Сделано [1-9]/);
});

test('by the tab «Сегодня»: the contents — the blocks in the screen\'s order with their numbers; a click scrolls; the top one lit', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Shift+Meta+h');
  await expect(screen(page)).toBeVisible();
  const toc = panel(page).getByRole('navigation', { name: 'На экране' });
  await expect(toc.locator('.trow .tn')).toHaveText(['Записка со вчера', 'Главное', 'Агенда на сегодня', '1-1 сегодня', 'Задачи', 'Просрочено']);
  await expect(toc.locator('.trow', { hasText: 'Главное' }).locator('.tc')).toHaveText(/^\d+ из \d+$/);
  await expect(toc.locator('.trow', { hasText: 'Просрочено' }).locator('.tc')).toHaveClass(/alert/);
  await expect(toc.locator('.trow').first()).toHaveClass(/on/);
  await page.setViewportSize({ width: 1400, height: 420 }); // the screen much taller than the window
  await toc.locator('.trow', { hasText: 'Просрочено' }).click();
  // scrolled to it (as far as the screen goes: the last block may not reach its top)
  await expect.poll(() => screen(page).evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  await expect(screen(page).getByRole('region', { name: 'Просрочено' })).toBeInViewport();
  await expect(toc.locator('.trow').first()).not.toHaveClass(/on/);
  await expect(panel(page).getByRole('button', { name: 'Полная версия' })).toHaveCount(0);
  await toc.getByRole('button', { name: 'Настроить блоки…' }).click();
  await expect(page.getByRole('dialog', { name: 'Настройки' })).toBeVisible();
});

// fix #311, #312: the tasks of the day are in the compact day even with no task files and no meetings; in «Завершить
// день» a long status keeps its column — the title starts after it
test('the day\'s tasks in the compact day; «IN-PROGRESS» in «Завершить день» does not run into its title', async ({ page }) => {
  const { openApp } = await import('./helpers');
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, {
    files: { '/mock/work.org': '#+TODO: TODO IN-PROGRESS | DONE\n* IN-PROGRESS Миграция биллинга\nSCHEDULED: <2026-10-16 Fri>\n* TODO Ревью роадмапа\nSCHEDULED: <2026-10-16 Fri>\n' },
    now: new Date(2026, 9, 16, 19), ready: false, viewport: { width: 1400, height: 820 },
  });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
  await page.keyboard.press('Shift+Meta+h');
  const ag = panel(page).getByRole('region', { name: 'Агенда на сегодня' });
  await expect(ag.locator('.row')).toHaveText([/Миграция биллинга/, /Ревью роадмапа/]);
  await expect(panel(page).locator('.empty')).toHaveCount(0);
  await page.evaluate(async () => (await import('/src/todayState.svelte.ts' as string)).today.openEndDay());
  const left = page.getByRole('region', { name: 'Не успел' });
  const row = left.locator('.row', { hasText: 'Миграция биллинга' });
  const cap = (await row.locator('.cap').boundingBox())!;
  const title = (await row.locator('.t').boundingBox())!;
  expect(title.x).toBeGreaterThanOrEqual(cap.x + cap.width);
  // the options under the row start where the titles do
  const opts = (await left.locator('.opts').first().boundingBox())!;
  expect(Math.abs(opts.x - title.x)).toBeLessThanOrEqual(1);
});
