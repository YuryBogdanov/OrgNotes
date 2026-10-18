import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ 48.5: the first start in the new interface — no sidebar, no tabs, `bg` with the grid; «ПЕРВЫЙ ЗАПУСК», the title
// in Yeseva One 44, «Создать новую папку…», «Выбрать папку… ↩» (focused); «Папка найдена» — a card with the folder, its
// path in IBM Plex Mono, three figures in Yeseva One; «Открыть» opens it; «Папка недоступна» with the warning.

const FILES = () => ({ '/mock/work.org': '* Q4 2026\n', '/mock/Команда/Рост/Белов.org': '* 1:1\n', '/mock/Команда/readme.md': 'x' });
async function open(page: Page, s: { noDir?: boolean; missing?: string } = {}) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript((s) => {
    localStorage.setItem('ui:next', '1');
    const w = window as any;
    if (s.noDir) w.__noDir = true;
    if (s.missing) w.__missing = s.missing;
  }, s);
  await installTauriMock(page, FILES());
  await page.goto('/');
}
const start = (page: Page) => page.getByRole('main', { name: 'Первый запуск' });
const btn = (page: Page, name: RegExp) => start(page).getByRole('button', { name });
const picks = (page: Page, ...p: (string | null)[]) => page.evaluate((p) => ((window as any).__picks = p), p);

test('the welcome: no sidebar and tabs; the kicker, the Yeseva title, the text; «Выбрать папку…» focused', async ({ page }) => {
  await open(page, { noDir: true });
  await expect(start(page).locator('.kick')).toHaveText('Первый запуск');
  await expect(start(page).locator('h1')).toHaveText('Добро пожаловать в Panopticon');
  expect(await start(page).locator('h1').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Yeseva One');
  expect(await start(page).locator('h1').evaluate((e) => getComputedStyle(e).fontSize)).toBe('44px');
  await expect(start(page).locator('.lead')).toContainText('Emacs продолжит видеть те же файлы');
  expect(Math.round((await start(page).locator('img.appicon').boundingBox())!.width)).toBe(112);
  await expect(btn(page, /^Выбрать папку…/)).toBeFocused();
  await expect(btn(page, /^Создать новую папку…/)).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Вкладки' })).toHaveCount(0);
});

test('«Папка найдена»: the card — the folder, the path in mono, three figures; «Открыть» opens it', async ({ page }) => {
  await open(page, { noDir: true });
  await picks(page, '/mock');
  await expect(btn(page, /^Выбрать папку…/)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(start(page).locator('h1')).toHaveText('Папка найдена');
  const card = start(page).locator('.card');
  await expect(card.locator('.wn b')).toHaveText('mock');
  expect(await card.locator('.pth').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('IBM Plex Mono');
  await expect(card.locator('.nums b')).toHaveText(['2', '2', '1']);
  await expect(card.locator('.nums span')).toHaveText(['org-файла', 'папки', 'другой файл']);
  expect(await card.locator('.nums b').first().evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Yeseva One');
  await expect(btn(page, /^Открыть/)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(start(page)).toHaveCount(0);
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
});

test('«Папка недоступна»: the warning, the title, «Повторить», «Выбрать другую папку…»', async ({ page }) => {
  await open(page, { missing: '/Users/me/Notes' });
  await expect(start(page).locator('h1')).toHaveText('Папка «Notes» недоступна');
  await expect(start(page).locator('.warnglyph')).toBeVisible();
  await expect(btn(page, /^Повторить/)).toBeVisible();
  await expect(btn(page, /^Выбрать другую папку…/)).toBeFocused();
});
