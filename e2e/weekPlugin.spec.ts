import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installTauriMock, pluginsReady } from './tauriMock';

// ТЗ 36: the plugin «Неделя» — an outside plugin (its own repository, panopticon-week next to this one), installed
// from the app's folder of plugins as a user would. Skipped when it is not built there.

const DIST = fileURLToPath(new URL('../../panopticon-week/dist/', import.meta.url));
const built = existsSync(DIST + 'main.js');
test.skip(!built, 'the plugin «Неделя» is not built next to the app (../panopticon-week: npm run build)');

const DAY = new Date().toISOString().slice(0, 10);
// a meeting with its stamp in the title, as the calendar writes it: an event for the API
const WORK = ['* Работа', '** TODO Подготовить слайды', 'DEADLINE: <' + DAY + '>', '** Синк с CTO <' + DAY + ' 11:00>', ''].join('\n');

async function open(page: Page, files: Record<string, string> = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('plugins:enabled', JSON.stringify({ week: true }));
    localStorage.setItem('plugins:trusted', JSON.stringify({ week: JSON.stringify([['files.edit', 'index.read'], []]) }));
  });
  await installTauriMock(page, {
    '/mock/work.org': WORK,
    '/config/plugins/week/manifest.json': readFileSync(DIST + 'manifest.json', 'utf8'),
    '/config/plugins/week/main.js': readFileSync(DIST + 'main.js', 'utf8'),
    ...files,
  }, { today: true });
  await page.goto('/');
  await pluginsReady(page);
}
const disk = (page: Page, p: string) => page.evaluate((x) => (window as any).__disk[x] as string | undefined, p);
const today = (page: Page) => page.getByRole('region', { name: 'Сегодня', exact: true });

test('no plan: «Спланировать» on «Сегодня»; the plan writes weeks.org — the week, its goals, one a task; the block shows them', async ({ page }) => {
  await open(page);
  const block = today(page).getByRole('region', { name: 'Цели недели' });
  await expect(block).toContainText('План на неделю не составлен');
  await expect(block.locator('.wk-plug')).toHaveText('Неделя');
  await block.getByRole('button', { name: 'Спланировать' }).click();
  const sheet = page.getByRole('dialog', { name: /План на \d+ неделю/ });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Цель 1').fill('Закрыть найм SRE');
  await sheet.getByRole('checkbox', { name: 'задачей' }).check();
  await sheet.getByLabel('Цель 2').fill('Не брать встречи после 17:00');
  await page.keyboard.press('Meta+Enter');
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => disk(page, '/mock/weeks.org')).toMatch(/^\* \d{4}-W\d{2} · .+\n\*\* Цели\n\*\*\* TODO Закрыть найм SRE\n\*\*\* Не брать встречи после 17:00/m);
  await expect(block.locator('.wk-tile')).toHaveCount(2);
  await expect(block.locator('.wk-tile').first()).toContainText('TODO');
});

test('the tab «Неделя»: the goals, «+ Цель», «Сделать задачей…» with a day; the days of the week; its neighbours', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Meta+7');
  const view = page.locator('.wk-view');
  await expect(view.locator('.wk-kick')).toContainText('НЕДЕЛЯ · СЕЙЧАС');
  await expect(view).toContainText('Целей пока нет');
  await view.getByLabel('Новая цель').fill('Согласовать бюджет');
  await page.keyboard.press('Enter');
  await expect(view.locator('.wk-goal')).toHaveCount(1);
  await expect.poll(() => disk(page, '/mock/weeks.org')).toContain('*** Согласовать бюджет');
  await view.getByRole('button', { name: 'Сделать задачей…' }).click();
  const form = page.getByRole('dialog', { name: /Задачей: Согласовать бюджет/ });
  await form.getByRole('button', { name: 'Сделать задачей' }).click();
  await expect.poll(() => disk(page, '/mock/weeks.org')).toContain('*** TODO Согласовать бюджет');
  await expect(view.locator('.wk-goal').first().locator('.wk-cap')).toHaveText('TODO');
  await expect(view.locator('.wk-day.today')).toContainText('дедлайн: Подготовить слайды');
  await expect(view.locator('.wk-day.today')).toContainText('Синк с CTO');
  await view.getByRole('button', { name: 'Следующая неделя' }).click();
  await expect(view.locator('.wk-kick')).toContainText('ВПЕРЕДИ');
  await expect(view.getByRole('button', { name: 'Запланировать…' })).toBeVisible();
});
