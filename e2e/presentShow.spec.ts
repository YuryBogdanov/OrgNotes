import { expect, test, type Page } from '@playwright/test';
import { diskFile, log, openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 59.5: the show — ⌘↩ from the slide chosen (⇧⌘↩ from the first): one screen — the slides alone, fitted on black;
// the keys (→ ← Space Home End, digits and ↩, B black, Esc) — back in the editor on the slide shown last; the file
// unchanged. Two screens — the presenter's view: the timer, «СЛАЙД 2 ИЗ 3», «Сейчас», «Дальше · <title>» or «Конец»,
// the notes; «Пауза»; S changes the screens over.

const P = '/mock/deck.org';
const DECK = ['#+PRESENT: 16:9', '* Первый', 'Привет', '* Второй', '- пункт', '** Заметки', 'Сказать честно.', '* Третий', 'Всё', ''].join('\n');
const TWO = [{ x: 0, y: 0, w: 1440, h: 900, main: true }, { x: 1440, y: 0, w: 1920, h: 1080, main: false }];

async function open(page: Page, screens?: unknown) {
  await page.addInitScript((s) => {
    localStorage.setItem('ui:next', '1');
    if (s) (window as any).__screens = s;
  }, screens);
  await openApp(page, { files: { [P]: DECK }, ready: false, viewport: { width: 1440, height: 900 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
  await expect(page.locator('.pr-holder .pr-slide')).toBeVisible();
}
const title = (p: Page) => p.locator('.pr-show-slide .pr-h');

test('one screen: the slides alone, the keys, B, digits; Esc — back in the editor on the last slide shown, the file as it was', async ({ page }) => {
  await open(page);
  await page.getByRole('listbox', { name: 'Слайды' }).getByRole('option').nth(1).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Показать/ }).click();
  const aud = await popup;
  await expect(title(aud)).toHaveText('Второй'); // from the slide chosen
  expect(await aud.locator('.pr-presenter').count()).toBe(0);
  await aud.keyboard.press('ArrowRight');
  await expect(title(aud)).toHaveText('Третий');
  await aud.keyboard.press('ArrowRight'); // the last: stays
  await expect(title(aud)).toHaveText('Третий');
  await aud.keyboard.press('Home');
  await expect(title(aud)).toHaveText('Первый');
  await aud.keyboard.press('Space');
  await expect(title(aud)).toHaveText('Второй');
  await aud.keyboard.press('3');
  await aud.keyboard.press('Enter');
  await expect(title(aud)).toHaveText('Третий');
  await aud.keyboard.press('b');
  await expect(aud.locator('.pr-show-slide')).toHaveCSS('visibility', 'hidden');
  await aud.keyboard.press('b');
  await expect(aud.locator('.pr-show-slide')).toHaveCSS('visibility', 'visible');
  await aud.keyboard.press('ArrowLeft');
  await aud.keyboard.press('Escape').catch(() => {}); // the window closes on the key's press, before its release
  await expect.poll(() => aud.isClosed()).toBe(true);
  await expect(page.locator('.pr-count')).toHaveText('СЛАЙД 2 ИЗ 3');
  expect(await diskFile(page, P)).toBe(DECK);
  expect((await log(page)).filter((e) => String(e[0]).startsWith('present_')).map((e) => e[0])).toEqual(['present_begin', 'present_end']);
});

test('two screens: the presenter\'s view — the timer, the count, now and next, the notes; «Конец» on the last; S; «Пауза»', async ({ page }) => {
  await open(page, TWO);
  const pops: Page[] = [];
  page.on('popup', (p) => pops.push(p));
  await page.locator('.pr-stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Shift+Meta+Enter'); // from the first
  await expect.poll(() => pops.length).toBe(2);
  const [aud, pre] = pops;
  await expect(title(aud)).toHaveText('Первый');
  const v = pre.locator('.pr-presenter');
  await expect(v.locator('.pp-time')).toHaveText(/^\d\d:\d\d$/);
  await expect(v.locator('.pp-state')).toHaveText(/^идёт · с \d\d:\d\d$/);
  await expect(v.locator('.pp-count')).toHaveText('СЛАЙД 1 ИЗ 3');
  await expect(v.locator('.pp-now .pr-h')).toHaveText('Первый');
  await expect(v.locator('.pp-side .pp-lbl').first()).toHaveText('Дальше · Второй');
  await pre.keyboard.press('ArrowRight'); // the keys of either window
  await expect(v.locator('.pp-notes')).toHaveText('Сказать честно.');
  await expect(title(aud)).toHaveText('Второй');
  await aud.keyboard.press('End');
  await expect(v.locator('.pp-end')).toHaveText('Конец');
  await v.getByRole('button', { name: 'Пауза' }).click();
  await expect(v.locator('.pp-state')).toHaveText('на паузе');
  await aud.keyboard.press('s');
  await expect(aud.locator('.pr-presenter')).toBeVisible(); // the views changed over
  await expect(pre.locator('.pr-show-slide')).toBeVisible();
  await aud.getByRole('button', { name: /Завершить/ }).click();
  await expect.poll(() => pre.isClosed() && aud.isClosed()).toBe(true);
  await expect(page.locator('.pr-count')).toHaveText('СЛАЙД 3 ИЗ 3');
});

test('the window not opened (WebKit refused it): said, not swallowed', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.open = () => null));
  await page.getByRole('button', { name: /Показать/ }).click();
  await expect(page.getByText('Показ не открылся: macOS не дал открыть окно')).toBeVisible();
});
