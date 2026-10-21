import { expect, test, type Page } from '@playwright/test';
import { diskFile, openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 59.2: «Презентация» — a file with «#+PRESENT:» opened as slides; the layouts (set, or by the content) and their
// menu writing `:LAYOUT:`; the strip (a click, ↑↓, a drag reorders the headings, ⌘Z back; its menu); the slide's text
// in an editor over it; the presenter's notes; images (found, missing); text that does not fit.

const P = '/mock/deck.org';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const LONG = Array.from({ length: 30 }, (_, i) => `- Пункт номер ${i + 1}, довольно длинный, чтобы занять строку целиком`).join('\n');
const DECK = [
  '#+TITLE: Ищем тимлида',
  '#+PRESENT: 16:9',
  '',
  '* Ищем тимлида в Платформу',
  ':PROPERTIES:',
  ':KICKER: Команда платформы',
  ':END:',
  'Юрий Богданов',
  '* Кого ищем',
  '- 6 человек',
  '- Переезд хранилища',
  '[[file:img/team.png]]',
  '** Заметки',
  'Сказать честно.',
  '* Без картинки',
  '[[img/none.png]]',
  'Подпись',
  '* Длинный',
  LONG,
  '',
].join('\n');

const view = (page: Page) => page.locator('.pr-view');
const thumbs = (page: Page) => page.getByRole('listbox', { name: 'Слайды' }).getByRole('option');
const disk = (page: Page) => diskFile(page, P);
async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { [P]: DECK, '/mock/img/team.png': 'base64:' + PNG, '/mock/a.org': '* A\n' }, ready: false, viewport: { width: 1500, height: 960 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
  await expect(view(page)).toBeVisible();
}

test('«#+PRESENT:» opens as slides: the count, the strip, the layouts by the content; the navigator\'s icon', async ({ page }) => {
  await open(page);
  await expect(page.locator('.pr-count')).toHaveText('СЛАЙД 1 ИЗ 4');
  await expect(thumbs(page)).toHaveCount(4);
  await expect(page.locator('.pr-holder .pr-slide')).toHaveClass(/pr-l-title/); // the first: a title
  await expect(page.locator('.pr-holder .pr-kicker')).toHaveText('Команда платформы');
  await thumbs(page).nth(1).click();
  await expect(page.locator('.pr-count')).toHaveText('СЛАЙД 2 ИЗ 4');
  await expect(page.locator('.pr-holder .pr-slide')).toHaveClass(/pr-l-text-image/);
  await expect(page.locator('.pr-holder .pr-img.side img')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByRole('button', { name: /Раскладка/ })).toContainText('Текст и картинка');
  // the image missing: a dashed frame with its path
  await thumbs(page).nth(2).click();
  await expect(page.locator('.pr-holder .pr-noimg.missing')).toContainText('Нет файла img/none.png'); // fix-59-1 §3.4
  await expect(thumbs(page).nth(2).locator('.pr-img.missing')).toContainText('нет файла'); // the strip: as before
  // too long: «не помещается» under its thumbnail
  await expect(thumbs(page).nth(3).locator('.pr-over')).toHaveText('не помещается');
  await expect(thumbs(page).nth(1).locator('.pr-over')).toHaveCount(0);
  await expect(page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'deck' }).locator('svg.ic')).toHaveAttribute('data-view', 'present.slides');
});

test('the layouts\' menu writes `:LAYOUT:`; ↑↓ in the strip and ⌥↓ choose a slide', async ({ page }) => {
  await open(page);
  await thumbs(page).nth(1).click();
  await page.getByRole('button', { name: /Раскладка/ }).click();
  const menu = page.getByRole('menu', { name: 'Раскладка' });
  await expect(menu.getByRole('menuitemradio')).toHaveText([/Заголовок/, /^\s*Текст\s*$/, /Текст и картинка/, /Две колонки/, /Цитата/, /Картинка/, /Свободная/]);
  await expect(menu.getByRole('menuitemradio', { name: /Текст и картинка/ })).toHaveAttribute('aria-checked', 'true');
  await menu.getByRole('menuitemradio', { name: /Две колонки/ }).click();
  await expect.poll(() => disk(page)).toContain('* Кого ищем\n:PROPERTIES:\n:LAYOUT: two\n:END:\n');
  await expect(page.locator('.pr-holder .pr-slide')).toHaveClass(/pr-l-two/);
  await page.getByRole('listbox', { name: 'Слайды' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.pr-count')).toHaveText('СЛАЙД 3 ИЗ 4');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.pr-count')).toHaveText('СЛАЙД 2 ИЗ 4');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('.pr-count')).toHaveText('СЛАЙД 3 ИЗ 4');
});

test('a thumbnail dragged moves its heading; ⌘Z back; its menu: a new slide, a copy, delete', async ({ page }) => {
  await open(page);
  const tops = async () => (await disk(page)).split('\n').filter((l) => l.startsWith('* '));
  await thumbs(page).nth(3).dragTo(thumbs(page).nth(1), { targetPosition: { x: 20, y: 5 } });
  await expect.poll(tops).toEqual(['* Ищем тимлида в Платформу', '* Длинный', '* Кого ищем', '* Без картинки']);
  await expect(page.locator('.pr-count')).toHaveText('СЛАЙД 2 ИЗ 4');
  await page.locator('.pr-stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Meta+z');
  await expect.poll(tops).toEqual(['* Ищем тимлида в Платформу', '* Кого ищем', '* Без картинки', '* Длинный']);
  // its menu
  await thumbs(page).nth(2).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Новый слайд после' }).click();
  await expect.poll(tops).toEqual(['* Ищем тимлида в Платформу', '* Кого ищем', '* Без картинки', '* Новый слайд', '* Длинный']);
  await expect(page.locator('.pr-count')).toHaveText('СЛАЙД 4 ИЗ 5');
  await thumbs(page).nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Дублировать' }).click();
  await expect.poll(async () => (await tops()).filter((t) => t === '* Кого ищем').length).toBe(2);
  await expect.poll(async () => ((await disk(page)).match(/\*\* Заметки/g) ?? []).length).toBe(2); // the notes too
  await thumbs(page).nth(4).click({ button: 'right' }); // «Новый слайд»: no text — no question
  await page.getByRole('menuitem', { name: /Удалить слайд/ }).click();
  await expect.poll(async () => (await tops()).includes('* Новый слайд')).toBe(false);
  await thumbs(page).nth(2).click({ button: 'right' }); // with text: asked
  await page.getByRole('menuitem', { name: /Удалить слайд/ }).click();
  await page.getByRole('button', { name: 'Удалить' }).click();
  await expect.poll(async () => (await tops()).filter((t) => t === '* Кого ищем').length).toBe(1);
});

test('a double click: the slide\'s text in an editor over it, the slide drawn anew while typing; ⎋ closes', async ({ page }) => {
  await open(page);
  await thumbs(page).nth(1).click();
  await page.locator('.pr-holder').dblclick();
  const card = page.getByRole('dialog', { name: 'Текст слайда' });
  await expect(card.locator('.cm-content')).toBeVisible();
  await expect(card.locator('.cm-line').first()).toHaveText('* Кого ищем');
  await card.locator('.cm-line', { hasText: 'Переезд хранилища' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' в Q1');
  await expect(page.locator('.pr-holder .pr-li').nth(1)).toContainText('Переезд хранилища в Q1');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
});

test('the presenter\'s notes: the editor of «Заметки»; none — «Нет заметок», typing there makes them', async ({ page }) => {
  await open(page);
  await thumbs(page).nth(1).click();
  await expect(page.locator('.pr-notes .cm-content')).toContainText('Сказать честно.');
  await thumbs(page).nth(2).click();
  const none = page.getByRole('textbox', { name: 'Заметки докладчика' });
  await expect(none).toHaveAttribute('placeholder', 'Нет заметок');
  await none.click();
  await page.keyboard.type('новая заметка');
  await expect.poll(() => disk(page)).toContain('* Без картинки\n[[img/none.png]]\nПодпись\n** Заметки\nновая заметка\n');
  await expect(page.locator('.pr-notes .cm-content')).toBeVisible();
  expect(((await disk(page)).match(/\*\* Заметки/g) ?? []).length).toBe(2); // one made
});
