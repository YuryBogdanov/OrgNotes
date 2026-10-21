import { expect, test, type Page } from '@playwright/test';
import { diskFile, openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// fix-59-1 §3–4: the place for an image (only in the editor), «Выбрать файл…» and «+ Картинка» (several: a cascade in
// free), a missing image's frame with «Заменить…»; the empty free slide; the cards of the layouts (the menu's rows, the
// «?»); the hints of `two` with no `-----` and of `quote` with no #+begin_quote.

const P = '/mock/deck.org';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const DECK = [
  '#+PRESENT: 16:9',
  '* Без картинки', ':PROPERTIES:', ':LAYOUT: text-image', ':END:', '- пункт',
  '* Пустой', ':PROPERTIES:', ':LAYOUT: free', ':END:',
  '* Нет файла', ':PROPERTIES:', ':LAYOUT: text-image', ':END:', '- пункт', '[[file:img/none.png]]',
  '* Колонки', ':PROPERTIES:', ':LAYOUT: two', ':END:', 'Первый абзац.', '', 'Второй абзац.',
  '* Цитата', ':PROPERTIES:', ':LAYOUT: quote', ':END:', 'Лучше меньше, да лучше.',
  '',
].join('\n');
const thumbs = (page: Page) => page.getByRole('listbox', { name: 'Слайды' }).getByRole('option');
const disk = (page: Page) => diskFile(page, P);
async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { [P]: DECK }, ready: false, viewport: { width: 1500, height: 960 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
  await expect(page.locator('.pr-holder .pr-slide')).toBeVisible();
}
const files = (...names: string[]) => names.map((name) => ({ name, mimeType: 'image/png', buffer: PNG }));

test('the place for an image: in the editor only; «Выбрать файл…» copies it and links it', async ({ page }) => {
  await open(page);
  const place = page.locator('.pr-holder .pr-noimg');
  await expect(place).toContainText('Перетащите картинку сюда или вставьте ⌘V');
  await expect(place).toContainText('видно только в редакторе');
  await expect(thumbs(page).nth(0).locator('.pr-noimg, .pr-img')).toHaveCount(0); // the strip: no image, no place
  const chooser = page.waitForEvent('filechooser');
  await place.getByRole('button', { name: 'Выбрать файл…' }).click();
  await (await chooser).setFiles(files('team.png'));
  await expect.poll(() => disk(page)).toContain('- пункт\n[[file:img/team.png]]\n* Пустой');
  await expect(page.locator('.pr-holder .pr-img.side img')).toBeVisible();
});

test('«+ Картинка» with two files on a free slide: two blocks in a cascade; the empty free slide says so', async ({ page }) => {
  await open(page);
  await thumbs(page).nth(1).click();
  await expect(page.locator('.pr-holder .pr-noblocks')).toHaveText('Пока нет блоков. «+ Блок» или перетащите картинку');
  await expect(thumbs(page).nth(1).locator('.pr-noblocks')).toHaveCount(0);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '+ Картинка' }).click();
  await (await chooser).setFiles(files('a.png', 'b.png'));
  await expect.poll(() => disk(page)).toContain(':BOX: 30 35 40 30\n:END:\n[[file:img/a.png]]');
  await expect.poll(() => disk(page)).toContain(':BOX: 34 39 40 30\n:END:\n[[file:img/b.png]]');
});

test('a missing image in the editor: its red frame, «Заменить…» puts the file chosen in its place', async ({ page }) => {
  await open(page);
  await thumbs(page).nth(2).click();
  const miss = page.locator('.pr-holder .pr-noimg.missing');
  await expect(miss).toContainText('Нет файла img/none.png');
  const chooser = page.waitForEvent('filechooser');
  await miss.getByRole('button', { name: 'Заменить…' }).click();
  await (await chooser).setFiles(files('new.png'));
  await expect.poll(() => disk(page)).toContain('- пункт\n[[file:img/new.png]]\n* Колонки');
});

test('the layouts\' menu: the card of the row pointed or chosen by the arrows; «?» — the card of the layout set', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Раскладка/ }).click();
  const menu = page.getByRole('menu', { name: 'Раскладка' });
  await menu.getByRole('menuitemradio', { name: /Две колонки/ }).hover();
  const card = page.locator('.pr-hintcard');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Две колонки');
  await expect(card).toContainText('Строка ----- делит текст на левую и правую колонку');
  await expect(card.locator('.hc-ex')).toHaveText('- Планирование\n- Демо по пятницам\n-----\n- Свобода в инструментах');
  await menu.getByRole('menuitemradio', { name: /Цитата/ }).hover();
  await expect(card).toContainText('#+begin_quote');
  await page.keyboard.press('ArrowDown');
  await expect(card).toContainText('Первая картинка на весь слайд');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  // «?»: the card of the layout set (text-image)
  const q = page.getByRole('button', { name: 'Как работает раскладка' });
  await q.click();
  await expect(card).toContainText('Текст слева, первая картинка справа');
  await expect(q).toHaveClass(/on/);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await page.mouse.move(5, 5);
  await q.hover();
  await expect(card).toBeVisible(); // after 300 ms
  await page.mouse.move(5, 5);
  await expect(card).toHaveCount(0); // the pointer gone from it
});

test('the hints on the slide: two columns with no -----, a quote with no #+begin_quote — in the editor only', async ({ page }) => {
  await open(page);
  await thumbs(page).nth(3).click();
  await expect(page.locator('.pr-holder .pr-hint-split')).toHaveText('делится по абзацам · добавьте -----');
  await expect(thumbs(page).nth(3).locator('.pr-hint-split')).toHaveCount(0);
  await thumbs(page).nth(4).click();
  await expect(page.locator('.pr-holder .pr-bigquote')).toContainText('Лучше меньше, да лучше.');
  await expect(page.locator('.pr-holder .pr-hint')).toHaveText('нет #+begin_quote — цитатой стал весь текст');
  await expect(thumbs(page).nth(4).locator('.pr-bigquote')).toContainText('Лучше меньше');
  await expect(thumbs(page).nth(4).locator('.pr-hint')).toHaveCount(0);
});
