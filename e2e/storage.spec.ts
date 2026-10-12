import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';

// Roadmap 0.6: a feature keeps its settings in the notes folder (`.orgnotes/plugins/<id>.json`) and on this Mac;
// what config.json had before is read until the first change moves it; a feature's set of statuses is in memory.

const CFG = '/mock/.orgnotes/config.json';
const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const json = async (page: Page, p: string) => JSON.parse((await disk(page))[p] ?? 'null');
const NOTES = { '/mock/Work.org': '* Q4\n', '/mock/me.org': '#+TITLE: Юрий\n* Квартальные задачи\n** Квартал Q4 2026\n*** ACTIVE Цель\n',
  '/mock/oleg.org': '* Квартальные задачи\n** Квартал Q4 2026\n*** ACTIVE Цель Олега\n' };

async function open(page: Page, cfg: object) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { ...NOTES, [CFG]: JSON.stringify(cfg) });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}

test('the calendar\'s settings of config.json are read; the first change moves them to its file', async ({ page }) => {
  await open(page, { version: 1, calendar: { taskHeading: 'Календарь', weekends: false } });
  await openSettingsSheet(page, 'Календарь');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await expect(s.getByLabel('Заголовок для задач')).toHaveValue('Календарь');
  await expect(s.getByRole('switch', { name: 'Показывать выходные' })).toHaveAttribute('aria-checked', 'false');
  await s.getByRole('switch', { name: 'Номера недель' }).click();
  await expect.poll(() => json(page, '/mock/.orgnotes/plugins/calendar.json')).toEqual({ taskHeading: 'Календарь' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('feature:calendar') ?? 'null'))).toEqual({ weekNumbers: false, weekends: false });
  await expect.poll(async () => (await json(page, CFG)).calendar).toBeUndefined();
  expect((await json(page, CFG)).version).toBe(1); // the rest of config.json stays
});

test('the goals: sources of config.json read and moved on a change; their statuses in memory only', async ({ page }) => {
  await open(page, { version: 1, goals: [{ file: 'me.org', heading: 'Квартальные задачи', title: 'Юрий', me: true }, { file: 'oleg.org', heading: 'Квартальные задачи', title: 'Олег' }] });
  await page.keyboard.press('Control+Meta+4');
  const nav = page.getByRole('navigation', { name: 'Цели' });
  const me = nav.getByRole('button', { name: /^Олег/ });
  await expect(me).toBeVisible();
  // the set «Цели на квартал» is known in memory only: config.json gets no sets
  expect((await json(page, CFG)).workflows).toBeUndefined();
  // a change of the sources writes the file and drops the key of config.json
  await me.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Переименовать…' }).click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('Я');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await json(page, '/mock/.orgnotes/plugins/goals.json'))?.sources?.[1]?.title).toBe('Я');
  await expect.poll(async () => (await json(page, CFG)).goals).toBeUndefined();
});

test('no goals: no set of the goals among the statuses', async ({ page }) => {
  await open(page, { version: 1 });
  await page.locator('.cm-line').first().click();
  const opts = await page.locator('.insp select').first().locator('option').allTextContents();
  expect(opts).not.toContain('ACTIVE');
});
