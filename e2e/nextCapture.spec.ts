import { expect, test, type Page } from '@playwright/test';
import { diskFile as disk, openApp } from './helpers';

// ТЗ 48.3: the quick entry ⇧⌘I in the new interface — a box as the palette's (600 pt, 150 pt from the top, `dim`
// under it), the title in Cormorant, «Tab — детали», the foot with «→ inbox»; ↩ adds, «Добавлено в Inbox» the
// window's toast with «Открыть»; ⎋ keeps the draft. No Inbox: «Выбрать файл…» — the sheet «Куда складывать
// входящие?» with the files, «+ Создать inbox.org в корне папки».

const cap = (page: Page) => page.getByRole('dialog', { name: 'Новая задача в Inbox' });
const CFG = JSON.stringify({ version: 1, inbox: { file: 'inbox.org', confirm: true } });

async function open(page: Page, files: Record<string, string>) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files, ready: false, viewport: { width: 1440, height: 900 } });
  await expect.poll(() => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.loaded)).toBe(true);
}

test('⇧⌘I: the box — 600 pt, 150 pt from the top, the title in the interface\'s font 19 (ТЗ 52 §4), «→ inbox»; Tab the details; ↩ adds, the toast «Открыть»', async ({ page }) => {
  await open(page, { '/mock/inbox.org': '#+TITLE: Inbox\n', '/mock/work.org': '* A\n', '/mock/.orgnotes/config.json': CFG });
  await page.keyboard.press('Shift+Meta+i');
  await expect(cap(page)).toBeVisible();
  const b = (await cap(page).boundingBox())!;
  expect(Math.round(b.width)).toBe(600);
  expect(Math.round(b.y)).toBe(150);
  const title = cap(page).getByRole('textbox', { name: 'Заголовок задачи' });
  await expect(title).toHaveAttribute('placeholder', 'Что записать?');
  expect(await title.evaluate((e) => getComputedStyle(e).fontFamily)).toContain('-apple-system'); // a field, not a file's text
  await expect(title).toHaveCSS('font-size', '19px');
  await expect(cap(page).locator('.dhint')).toHaveText('Tab — детали');
  await expect(cap(page).locator('.to')).toHaveText('→ inbox');
  await page.keyboard.type('Позвонить в типографию');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Нужны три штуки A1');
  await page.keyboard.press('Meta+Enter');
  await expect(cap(page)).toHaveCount(0);
  await expect.poll(() => disk(page, '/mock/inbox.org')).toContain('Позвонить в типографию');
  expect(await disk(page, '/mock/inbox.org')).toContain('Нужны три штуки A1');
  const toast = page.getByRole('status').filter({ hasText: 'Добавлено в Inbox' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Открыть' }).click();
  await expect(page.locator('.cm-line', { hasText: 'Позвонить в типографию' })).toBeVisible();
});

test('⎋ keeps the draft; with no Inbox — «Выбрать файл…» opens the sheet: the files, «+ Создать inbox.org», «Выбрать ↩»', async ({ page }) => {
  await open(page, { '/mock/work.org': '* A\n** B\n', '/mock/notes/ideas.org': '* C\n' });
  await page.keyboard.press('Shift+Meta+i');
  await page.keyboard.type('Черновик');
  await page.keyboard.press('Escape');
  await expect(cap(page)).toHaveCount(0);
  await page.keyboard.press('Shift+Meta+i');
  await expect(cap(page).getByRole('textbox', { name: 'Заголовок задачи' })).toHaveValue('Черновик');
  await page.keyboard.press('Enter');
  await expect(cap(page)).toContainText('Inbox пока не настроен');
  await cap(page).getByRole('button', { name: 'Выбрать файл…' }).click();
  const sheet = page.getByRole('dialog', { name: 'Куда складывать входящие?' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.row .nm')).toHaveText(['notes/ideas', 'work']);
  await expect(sheet.locator('.row').filter({ hasText: 'work' }).locator('.n')).toHaveText('2');
  await expect(sheet.getByRole('button', { name: '+ Создать inbox.org в корне папки' })).toBeVisible();
  await page.keyboard.type('wor');
  await expect(sheet.locator('.row.on .nm')).toHaveText('work');
  await page.keyboard.press('Enter');
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.inboxFile?.name)).toBe('work.org');
});
