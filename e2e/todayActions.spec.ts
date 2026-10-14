import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { FILES, iso, shift } from './todayFixture';

// ТЗ 34, part B: the rows of «Сегодня» are one list of tasks — a click chooses, a double click or ↩ opens, ↑ ↓ go
// from block to block; the menu and the keys act on the chosen task; a changed row stays until ⌘R.

const disk = (page: Page, p: string) => page.evaluate((x) => (window as any).__disk[x] as string, p);
const screen = (page: Page) => page.getByRole('region', { name: 'Сегодня', exact: true });
const block = (page: Page, name: string) => screen(page).getByRole('region', { name });
const tabs = (page: Page) => page.locator('.pane').first().getByRole('tab');
const sel = (page: Page) => screen(page).locator('[data-k].sel');

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installTauriMock(page, FILES(), { today: true });
  await page.goto('/');
  await expect(screen(page)).toBeVisible();
}

test('a click chooses (a ring while the screen has the focus); ↑ ↓ go over the blocks; ↩ opens in a tab; ⎋', async ({ page }) => {
  await open(page);
  const hr = block(page, 'Задачи').getByText('Ответить HR по вакансии SRE');
  await hr.click();
  await expect(sel(page)).toContainText('Ответить HR');
  await expect(sel(page)).toHaveCSS('box-shadow', /inset/);
  await expect(tabs(page)).toHaveCount(2); // nothing opened
  // the last row of «Главное» → down → the first of «Агенда на сегодня» (the screen's order)
  await block(page, 'Главное на сегодня').getByText('Вопросы к ревью биллинга').click();
  await page.keyboard.press('ArrowDown');
  await expect(sel(page)).toContainText('Стендап платформы');
  await page.keyboard.press('ArrowUp');
  await expect(sel(page)).toContainText('Вопросы к ревью биллинга');
  await page.keyboard.press('Escape');
  await expect(sel(page)).toHaveCount(0);
  await hr.click();
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-activeLine')).toContainText('Ответить HR');
  await expect(tabs(page).first()).toHaveText(/Сегодня/);
});

test('the menu and the keys on the chosen task; the row stays dimmed until ⌘R; ⌘Z', async ({ page }) => {
  await open(page);
  const tasks = block(page, 'Задачи');
  await tasks.getByText('Ответить HR по вакансии SRE').click({ button: 'right' });
  const menu = page.locator('.menu').first();
  await expect(menu.getByRole('menuitem', { name: 'Открыть во второй панели' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Статус' }).hover();
  await page.locator('.menu').nth(1).getByRole('menuitem', { name: 'DONE' }).click();
  await expect.poll(() => disk(page, '/mock/inbox.org')).toContain('* DONE Ответить HR по вакансии SRE');
  const row = tasks.locator('.trow', { hasText: 'Ответить HR' });
  await expect(row).toHaveClass(/stale/);
  await expect(row).toHaveClass(/sel/);
  await expect(page.locator('.ltoast')).toContainText('«Ответить HR по вакансии SRE» — DONE');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page, '/mock/inbox.org')).toContain('* TODO Ответить HR по вакансии SRE');
  await expect(row).not.toHaveClass(/stale/);
  // ⇧↑: the priority; ⇧→ ×3: done; ⌘R: the row goes
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(() => disk(page, '/mock/inbox.org')).toContain('* TODO [#B] Ответить HR');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => disk(page, '/mock/inbox.org')).toContain('* DONE [#B] Ответить HR');
  await expect(row).toHaveClass(/gone/);
  await page.keyboard.press('Meta+r');
  await expect(tasks.locator('.trow', { hasText: 'Ответить HR' })).toHaveCount(0);
});

test('«Просрочено»: ⌥⇧→ moves the date the row tells; its chips still work with one click', async ({ page }) => {
  await open(page);
  const late = block(page, 'Просрочено');
  await late.getByText('Ревью перформанса Олега').click();
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect.poll(() => disk(page, '/mock/work.org')).toContain(`DEADLINE: <${iso(shift(-2))}`);
  await expect(late.locator('.orow', { hasText: 'Ревью перформанса Олега' })).toBeVisible(); // still overdue, stays
  await late.locator('.orow', { hasText: 'Написать Ане' }).getByRole('button', { name: 'Завтра' }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toContain(`SCHEDULED: <${iso(shift(1))}`);
});
