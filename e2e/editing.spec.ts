import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { log } from './helpers';

const WEEKLY = '/mock/Weekly.org';
const LF = [
  '#+TITLE: Test',
  '',
  '* TODO Первая',
  'SCHEDULED: <2026-10-12 Mon>',
  'строка один',
  'строка два',
  '',
  '* TODO Вторая',
  'ещё текст',
  '* Третья',
  'последняя строка',
  '',
].join('\n');

const cursor = async (page: Page) => {
  const t = await page.locator('.status').innerText();
  const m = /Стр\. (\d+), кол\. (\d+)/.exec(t);
  return { line: +m![1], col: +m![2] };
};
const disk = (page: Page, path = WEEKLY) => page.evaluate((p) => (window as any).__disk[p] as string, path);
const clickEndOf = async (page: Page, text: string) => {
  await page.locator('.cm-line', { hasText: text }).first().click();
  await page.keyboard.press('End');
};
const open = async (page: Page, files: Record<string, string>, eventDelayMs?: number, listDelayMs?: number) => {
  await installTauriMock(page, files, { eventDelayMs, listDelayMs });
  await page.goto('/');
  await expect(page.locator('.cm-content')).toContainText('#+TITLE');
};

test('typing in the middle of a file keeps the cursor through autosave and reload', async ({ page }) => {
  await open(page, { [WEEKLY]: LF });
  await clickEndOf(page, 'ещё текст');
  const before = await cursor(page);
  expect(before.line).toBe(9);

  // human-ish typing: bursts separated by pauses that straddle the 500 ms autosave and the watcher echo
  for (const chunk of ['abc', 'def', 'gh']) {
    await page.keyboard.type(chunk, { delay: 60 });
    await page.waitForTimeout(650);
    expect((await cursor(page)).line).toBe(9);
  }
  await page.keyboard.type('ij', { delay: 60 });
  await page.waitForTimeout(1200);

  expect((await cursor(page)).line).toBe(9);
  await expect(page.locator('.cm-activeLine')).toHaveText('ещё текстabcdefghij');
  expect(await disk(page)).toContain('ещё текстabcdefghij');
});

test('typing a link character by character keeps the cursor and renders only the description', async ({ page }) => {
  await open(page, { [WEEKLY]: LF });
  await clickEndOf(page, 'строка два');
  const line = (await cursor(page)).line;

  await page.keyboard.type(' см. [[http://google.com][hello]] и дальше', { delay: 80 });
  await page.waitForTimeout(1200);
  expect((await cursor(page)).line).toBe(line);

  // cursor is past the link: only the description is shown
  const row = page.locator('.cm-line', { hasText: 'строка два' });
  await expect(row).toContainText('hello');
  await expect(row).not.toContainText('google.com');
  expect(await disk(page)).toContain('[[http://google.com][hello]]');

  // cmd-click follows it (external URLs go through the opener plugin)
  await row.locator('.cm-link').click({ modifiers: ['Meta'] });
  await expect.poll(async () => (await log(page)).filter((e) => e[0] === 'open_url')).toEqual([['open_url', 'http://google.com']]);
  expect((await cursor(page)).line).toBe(line);
});

test('a CRLF file loads, keeps its cursor while typing and is saved back as CRLF', async ({ page }) => {
  const crlf = LF.replace(/\n/g, '\r\n');
  await open(page, { [WEEKLY]: crlf });
  await expect(page.locator('.cm-content')).toContainText('Первая');
  await clickEndOf(page, 'строка один');
  const line = (await cursor(page)).line;

  await page.keyboard.type('XYZ', { delay: 60 });
  await page.waitForTimeout(1500);

  expect((await cursor(page)).line).toBe(line);
  const saved = await disk(page);
  expect(saved).toContain('строка одинXYZ\r\n');
  expect(saved.replace(/\r\n/g, '')).not.toContain('\n');
});

test('an external edit above the cursor does not move the cursor to the top', async ({ page }) => {
  await open(page, { [WEEKLY]: LF });
  await clickEndOf(page, 'последняя строка');
  const line = (await cursor(page)).line;

  // another editor rewrites the whole file: first line and last line both change
  const external = LF.replace('#+TITLE: Test', '#+TITLE: Test (edited elsewhere)').replace('последняя строка', 'последняя строка!');
  await page.evaluate(([p, t]) => (window as any).__setDisk(p, t), [WEEKLY, external]);
  await expect(page.locator('.cm-content')).toContainText('edited elsewhere');

  expect((await cursor(page)).line).toBe(line);
});

test('unsaved local edits are not written over an external change', async ({ page }) => {
  await open(page, { [WEEKLY]: LF });
  await clickEndOf(page, 'ещё текст');
  await page.keyboard.type('LOCAL', { delay: 30 });
  // external write lands before our autosave: the disk version must survive
  const external = LF.replace('Первая', 'Первая (внешняя)');
  await page.evaluate(([p, t]) => ((window as any).__disk[p] = t), [WEEKLY, external]);
  await page.waitForTimeout(1500);

  expect(await disk(page)).toBe(external);
  expect((await log(page)).some((e) => e[0] === 'conflict')).toBe(true);
  // neither version is lost: the tab keeps mine and the user is asked
  await expect(page.locator('.cm-content')).toContainText('LOCAL');
  await expect(page.getByRole('alertdialog')).toContainText('изменён другой программой');
});

test('continuous typing survives slow disk reads racing with autosave echoes', async ({ page }) => {
  // reads take 250 ms and the watcher echo arrives 100 ms after a save: the snapshot a reload gets is
  // older than what the user has typed by the time it is applied
  await open(page, { [WEEKLY]: LF }, 100, 250);
  await clickEndOf(page, 'ещё текст');
  const line = (await cursor(page)).line;

  const typed = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (const ch of typed) {
    await page.keyboard.type(ch, { delay: 0 });
    await page.waitForTimeout(110);
    expect((await cursor(page)).line).toBe(line);
  }
  await page.waitForTimeout(1500);

  await expect(page.locator('.cm-activeLine')).toHaveText('ещё текст' + typed);
  expect(await disk(page)).toContain('ещё текст' + typed);
  await expect(page.locator('.status')).not.toContainText('изменён снаружи');
});

test('every keystroke followed by a save and a slow reload: nothing is reverted, cursor stays', async ({ page }) => {
  // a save fires 500 ms after each pause, its echo arrives after 100 ms and the reload then reads for ~500 ms,
  // so the next character is typed while the previous save's reload is still in flight
  await open(page, { [WEEKLY]: LF }, 100, 250);
  await clickEndOf(page, 'ещё текст');
  const line = (await cursor(page)).line;

  const typed = 'abcdefghij';
  for (const ch of typed) {
    await page.keyboard.type(ch, { delay: 0 });
    await page.waitForTimeout(560);
    expect((await cursor(page)).line).toBe(line);
    await expect(page.locator('.cm-activeLine')).toContainText('ещё текст' + typed.slice(0, typed.indexOf(ch) + 1));
  }
  await page.waitForTimeout(1500);
  expect(await disk(page)).toContain('ещё текст' + typed);
  await expect(page.locator('.status')).not.toContainText('изменён снаружи');
});
