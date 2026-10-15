import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { diskAll as disk } from './helpers';

const CONFIG = JSON.stringify({
  version: 1,
  workflows: [
    { name: 'Задачи', states: [{ name: 'NEW' }, { name: 'IN PROGRESS', color: 'blue' }, { name: 'DONE', done: true }] },
    { name: 'Встречи', states: [{ name: 'MEETING' }, { name: 'FINISHED', done: true }] },
  ],
});

const NOTES = {
  // no #+TODO anywhere: the statuses come from the project config
  '/mock/Work.org': '* IN-PROGRESS Задача в работе\n* MEETING Планёрка\nSCHEDULED: <2026-10-12 Mon +1w>\n* Без статуса\n',
  '/mock/.orgnotes/config.json': CONFIG,
};

const open = async (page: Page, files: Record<string, string> = NOTES) => {
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content')).toContainText('* ');
};
const heading = (page: Page, text: string) => page.locator('.cm-line', { hasText: text }).first();

test('statuses declared in the project config are recognised in files without #+TODO', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nav:headings', '1')); // headings in the navigator
  await open(page);
  // IN-PROGRESS and MEETING are not built-in statuses: they only exist in the config
  await expect(page.locator('.nav .kw', { hasText: 'IN-PROGRESS' })).toBeVisible();
  await expect(page.locator('.nav .kw', { hasText: 'MEETING' })).toBeVisible();
  // the hidden config folder is not shown as notes or folders
  await expect(page.locator('.nav')).not.toContainText('orgnotes');
  await expect(page.locator('.nav')).not.toContainText('config');
});

test('the inspector offers the statuses of the heading\'s own workflow and groups all of them', async ({ page }) => {
  await open(page);
  await heading(page, 'Планёрка').click();
  await expect(page.locator('.insp')).toContainText('workflow: Встречи');
  const options = await page.locator('.insp select').first().locator('option').allTextContents();
  expect(options).toEqual(['—', 'NEW', 'IN-PROGRESS', 'DONE', 'MEETING', 'FINISHED']);
  const groups = await page.locator('.insp select').first().locator('optgroup').evaluateAll((els) => els.map((e) => (e as HTMLOptGroupElement).label));
  expect(groups).toEqual(['Задачи', 'Встречи']);
});

test('completing a repeating meeting finishes within its workflow and resets to its start', async ({ page }) => {
  await open(page);
  await heading(page, 'Планёрка').click();
  await page.getByRole('button', { name: 'Выполнено' }).click();
  // repeating: the date moves on and the heading goes back to MEETING (not to NEW of the first workflow)
  await expect.poll(async () => (await disk(page))['/mock/Work.org']).toContain('* MEETING Планёрка\nSCHEDULED: <2026-10-19 Mon +1w>');
});

test('a heading without a status starts in the first workflow', async ({ page }) => {
  await open(page);
  await heading(page, 'Без статуса').click();
  await expect(page.locator('.insp')).toContainText('Без статуса');
  const sel = page.locator('.insp select').first();
  await sel.selectOption('NEW');
  await expect.poll(async () => (await disk(page))['/mock/Work.org']).toContain('* NEW Без статуса');
});

test('editing the config on disk re-reads statuses without a restart', async ({ page }) => {
  await open(page);
  const changed = JSON.stringify({ version: 1, workflows: [{ name: 'Свои', states: [{ name: 'MEETING' }, { name: 'IN-PROGRESS' }, { name: 'FINISHED', done: true }] }] });
  await page.evaluate((c) => (window as any).__setDisk('/mock/.orgnotes/config.json', c), changed);
  await page.locator('.cm-line', { hasText: 'Планёрка' }).first().click();
  await expect.poll(async () => page.locator('.insp select').first().locator('option').allTextContents()).toEqual(['—', 'MEETING', 'IN-PROGRESS', 'FINISHED']);
});

test('a status that appears in two workflows is kept in the first one and reported', async ({ page }) => {
  const dup = JSON.stringify({
    workflows: [
      { name: 'A', states: [{ name: 'TODO' }, { name: 'DONE', done: true }] },
      { name: 'B', states: [{ name: 'MEETING' }, { name: 'DONE', done: true }] },
    ],
  });
  await open(page, { '/mock/Work.org': '* TODO a\n* MEETING b\n', '/mock/.orgnotes/config.json': dup });
  await expect(page.locator('.status')).toContainText('DONE уже есть в workflow «A»');
});
