import { expect, test, type Page } from '@playwright/test';
import { openApp, diskFile as disk } from './helpers';
import { DEFAULT_WORKFLOW, parseHeadings } from '../src/org';
import { reconcileFile } from '../src/touch';

// ТЗ 40.1: the index of touches — the first dates (≈), an edit here, a change on disk, a change while the app was
// closed, a refile, `.orgnotes/touch.json` lost or unreadable.

const MIDTERM = '/mock/Midterm.org';
const TEXT = [
  '* TODO Миграция биллинга',
  ':LOGBOOK:',
  '- Note taken on [2026-10-02 Чт 11:20] \\\\',
  '  ждём бизнес',
  ':END:',
  'Описание',
  '* Найм в команду',
  'Вакансия',
  '',
].join('\n');
const FILE_TIME = new Date(2026, 9, 10, 9, 0).getTime();
const NOTE_TIME = new Date(2026, 9, 2, 11, 20).getTime();

type Rec = { at: number; approx: boolean; src?: string; file: string; line: number };
const records = (page: Page) =>
  page.evaluate(async () => {
    const { touches } = await import('/src/touchIndex.svelte.ts' as string);
    return touches.ready ? (touches.records as Record<string, Rec>) : null;
  });
const rec = async (page: Page, title: string) => {
  const rs = await records(page);
  return rs ? Object.entries(rs).find(([k]) => k.endsWith('› ' + title))?.[1] : undefined;
};

async function open(page: Page, files: Record<string, string>, mtimes: Record<string, number> = { [MIDTERM]: FILE_TIME }) {
  await page.addInitScript((m) => ((window as any).__mtimeInit = m), mtimes);
  await openApp(page, { files });
  await expect.poll(() => records(page)).not.toBeNull();
}

test('the first open: a date from :LOGBOOK: or the file, with «≈»; the index goes to .orgnotes/touch.json', async ({ page }) => {
  await open(page, { [MIDTERM]: TEXT });
  expect(await rec(page, 'Миграция биллинга')).toMatchObject({ at: NOTE_TIME, approx: true, src: 'logbook' });
  expect(await rec(page, 'Найм в команду')).toMatchObject({ at: FILE_TIME, approx: true, src: 'file' });
  await expect.poll(async () => JSON.parse((await disk(page, '/mock/.orgnotes/touch.json')) ?? '{}').version).toBe(1);
});

test('an edit here touches its heading at the write; the other heading keeps its date', async ({ page }) => {
  await open(page, { [MIDTERM]: TEXT });
  await page.locator('.cm-line', { hasText: 'Вакансия' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' в платформу');
  const before = Date.now();
  await expect.poll(async () => (await rec(page, 'Найм в команду'))?.approx).toBe(false);
  const r = (await rec(page, 'Найм в команду'))!;
  expect(r.at).toBeGreaterThan(before - 10_000);
  expect(await rec(page, 'Миграция биллинга')).toMatchObject({ at: NOTE_TIME, approx: true });
});

test('a change on disk while the app is open: the time of the file; spaces at the ends of lines are not a touch', async ({ page }) => {
  await open(page, { [MIDTERM]: TEXT });
  await page.evaluate((p) => (window as any).__setDisk(p, (window as any).__disk[p].replace('Вакансия', 'Вакансия   ')), MIDTERM);
  await page.waitForTimeout(800);
  expect(await rec(page, 'Найм в команду')).toMatchObject({ at: FILE_TIME, approx: true });
  await page.evaluate((p) => (window as any).__setDisk(p, (window as any).__disk[p].replace('Описание', 'Описание: стартуем после 4.2')), MIDTERM);
  await expect.poll(async () => (await rec(page, 'Миграция биллинга'))?.approx).toBe(false);
  expect((await rec(page, 'Миграция биллинга'))!.at).toBeGreaterThan(FILE_TIME);
  expect(await rec(page, 'Найм в команду')).toMatchObject({ approx: true });
});

test('changed while the app was closed: on opening, the time of the file; the unchanged heading keeps its touch', async ({ page }) => {
  // the index as written last time, over the old text: both headings touched on Oct 5
  const old = TEXT;
  const T5 = new Date(2026, 9, 5, 15, 0).getTime();
  const lines = old.split('\n');
  const { records: stored } = reconcileFile('Midterm.org', lines, parseHeadings(old, DEFAULT_WORKFLOW), {}, {}, T5, 'change');
  const now = TEXT.replace('Вакансия', 'Вакансия закрыта');
  await open(page, { [MIDTERM]: now, '/mock/.orgnotes/touch.json': JSON.stringify({ version: 1, records: stored }) });
  expect(await rec(page, 'Найм в команду')).toMatchObject({ at: FILE_TIME, approx: false });
  expect(await rec(page, 'Миграция биллинга')).toMatchObject({ at: T5, approx: false });
});

test('a refile to another file keeps the touch: the history goes with the heading', async ({ page }) => {
  await open(page, { [MIDTERM]: TEXT, '/mock/Archive.org': '* Архив\n' }, { [MIDTERM]: FILE_TIME, '/mock/Archive.org': FILE_TIME });
  const was = (await rec(page, 'Миграция биллинга'))!;
  await page.evaluate(async () => {
    const { store } = await import('/src/store.svelte.ts' as string);
    const f = store.files.find((x: any) => x.name === 'Midterm.org');
    store.refileHeading(f, f.headings[0], {});
    await store.refileMove('/mock/Archive.org', { key: 'Архив', line: 0 });
  });
  await expect.poll(async () => (await records(page)) && Object.keys((await records(page))!).some((k) => k.startsWith('Archive.org › Архив › Миграция'))).toBe(true);
  expect(await rec(page, 'Миграция биллинга')).toMatchObject({ at: was.at, approx: was.approx, file: 'Archive.org' });
});

test('an unreadable .orgnotes/touch.json: built anew from the files, no error', async ({ page }) => {
  await open(page, { [MIDTERM]: TEXT, '/mock/.orgnotes/touch.json': '{ not json' });
  expect(await rec(page, 'Найм в команду')).toMatchObject({ at: FILE_TIME, approx: true });
  await expect(page.locator('.toast')).toHaveCount(0);
});
