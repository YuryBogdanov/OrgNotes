import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';

// ТЗ 26, roadmap 1.1: the example plugin «Привет» — built only on the API — adds a command with its keys, a section
// of the navigator, a kind of tab and a section of the settings; its edit is one step of ⌘Z. Off by default.

const WORK = '/mock/Work.org';
const FILES = { [WORK]: '* TODO Подготовить бюджет\n* TODO Позвонить\n* DONE Старое\n', '/mock/Дом.org': '* Покупки\n' };
const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const modes = (page: Page) => page.getByRole('tablist', { name: 'Режимы навигатора' });
const toast = (page: Page) => page.locator('.toast');

async function open(page: Page, on: boolean) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (on) await page.addInitScript(() => localStorage.setItem('plugins:enabled', JSON.stringify({ hello: true })));
  await installTauriMock(page, FILES);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await pluginsReady(page); // its keys work once the plugins have started
}

test('off by default: no section, no commands', async ({ page }) => {
  await open(page, false);
  await expect(modes(page).getByRole('tab', { name: 'Привет' })).toHaveCount(0);
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('Привет');
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).not.toContainText('Привет: поздороваться');
});

test('the command with its keys asks the index; the board keeps its state; its edit goes with ⌘Z', async ({ page }) => {
  await open(page, true);
  await page.keyboard.press('Control+Meta+h');
  await expect(toast(page)).toContainText('Привет! Открытых задач: 2.');
  await toast(page).getByRole('button', { name: 'Доска' }).click();
  const tab = page.locator('section.pane.active .tab.on');
  await expect(tab).toContainText('Доска');
  const board = page.locator('.hello-board');
  await expect(board.locator('.hello-first')).toHaveText('Первая открытая задача: Подготовить бюджет');
  await board.getByRole('button', { name: 'Нажать' }).click();
  await board.getByRole('button', { name: 'Нажать' }).click();
  await expect(board.locator('.hello-count')).toHaveText('Нажатий: 2');
  await expect(tab).toContainText('Доска · 2');
  // a transaction of the plugin: written, the board follows the file; ⌘Z takes it back
  await board.getByRole('button', { name: 'Отметить первую выполненной' }).click();
  await expect.poll(async () => (await disk(page))[WORK]).toContain('* DONE Подготовить бюджет');
  await expect(board.locator('.hello-first')).toHaveText('Первая открытая задача: Позвонить');
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await disk(page))[WORK]).toContain('* TODO Подготовить бюджет');
  // the state is kept with the layout
  await page.reload();
  await expect(page.locator('.hello-board .hello-count')).toHaveText('Нажатий: 2');
});

test('the section of the navigator (⌃⌘7) lists the files; a click opens one', async ({ page }) => {
  await open(page, true);
  await page.keyboard.press('Control+Meta+7');
  await expect(modes(page).getByRole('tab', { name: 'Привет' })).toHaveAttribute('aria-selected', 'true');
  const nav = page.locator('.hello-files');
  await expect(nav.getByRole('button')).toHaveText(['Дом', 'Work']); // as the index has them
  await nav.getByRole('button', { name: 'Дом' }).click();
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('Дом');
});

test('the settings by the manifest: the folder\'s in its file, this Mac\'s local; «Клавиши» and the palette know its commands', async ({ page }) => {
  await open(page, true);
  await openSettingsSheet(page, 'Привет');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await expect(s.getByLabel('Слово приветствия')).toHaveValue('Привет');
  await s.getByLabel('Слово приветствия').fill('Здравствуйте');
  await s.getByLabel('Слово приветствия').press('Tab');
  await s.getByRole('switch', { name: 'Считать открытые задачи' }).click();
  await expect.poll(async () => JSON.parse((await disk(page))['/mock/.orgnotes/plugins/hello.json'] ?? 'null')).toEqual({ settings: { greeting: 'Здравствуйте' } });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('feature:hello') ?? 'null'))).toEqual({ settings: { count: false } });
  await s.getByRole('tab', { name: 'Клавиши' }).click();
  await expect(s.getByText('ПРИВЕТ', { exact: true })).toBeVisible();
  await expect(s.locator('.row', { hasText: 'Привет: поздороваться' })).toContainText('⌃⌘H');
  await s.getByRole('button', { name: 'Готово' }).click();
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('поздороваться');
  await page.keyboard.press('Enter');
  await expect(toast(page).locator('span').first()).toHaveText('Здравствуйте!'); // no count: switched off
});

// ---- the core's sheets and the review through the API (roadmap 1.1, part B) ----------------------------------------
const iso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const palette = async (page: Page, q: string) => {
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type(q);
  await page.keyboard.press('Enter');
};

test('a form (checked by the plugin, ⎋ cancels), the choice of a place and of a date, one transaction', async ({ page }) => {
  await open(page, true);
  await palette(page, 'привет: новая');
  const form = page.getByRole('dialog', { name: 'Новая задача' });
  await expect(form).toBeVisible();
  await expect(form.locator('.who')).toHaveText('Привет');
  await form.getByRole('button', { name: 'Дальше' }).click();
  await expect(form.getByRole('alert')).toHaveText('Напишите, что сделать'); // its own check: the sheet stays
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await palette(page, 'привет: новая');
  await form.getByLabel('Задача').fill('Купить краску');
  await form.getByRole('radio', { name: 'NEXT' }).click();
  await form.getByRole('switch', { name: 'Запланировать на день' }).click();
  await form.getByRole('button', { name: 'Дальше' }).click();
  const place = page.getByRole('dialog', { name: 'Куда добавить' });
  await expect(place).toBeVisible();
  await page.keyboard.type('Дом');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Покупки');
  await page.keyboard.press('Enter');
  await expect(place).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Командная палитра' }).locator('.res')).toBeVisible(); // the calendar
  await page.keyboard.type('+3');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await disk(page))['/mock/Дом.org']).toContain('** NEXT Купить краску');
  expect((await disk(page))['/mock/Дом.org']).toMatch(new RegExp(`^\\* Покупки\\n\\*\\* NEXT Купить краску\\nSCHEDULED: <${iso(3)} [A-Z][a-z]{2}>\\n$`));
  await expect(toast(page)).toContainText('Добавлено: Купить краску');
  // ⌘Z: the whole addition at once
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await disk(page))['/mock/Дом.org']).toBe('* Покупки\n');
});

test('the review by cards: the plugin\'s actions on their keys, «Пропустить», the summary answers the plugin', async ({ page }) => {
  await open(page, true);
  await palette(page, 'привет: разобрать');
  const tab = page.locator('section.pane.active .tab.on');
  await expect(tab).toContainText('Разбор «Привет»');
  const card = page.locator('.preview .card');
  await expect(card.locator('.chead')).toContainText('Разбор «Привет» · 1 из 2');
  await expect(card.locator('.chead')).toContainText('без даты');
  await expect(card.locator('.cm-content')).toContainText('Подготовить бюджет');
  await expect(page.locator('.hello-below')).toHaveText('Строка 1 в Work.org');
  await expect(page.locator('.preview .bar')).toContainText('Выполнено⌘1');
  await page.keyboard.press('Meta+1');
  await expect.poll(async () => (await disk(page))[WORK]).toContain('* DONE Подготовить бюджет');
  await expect(card.locator('.chead')).toContainText('2 из 2');
  await page.keyboard.press('Meta+2'); // «Запланировать…»: the calendar, ⎋ — the card stays
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card.locator('.chead')).toContainText('2 из 2');
  await page.locator('.preview .bar').getByRole('button', { name: 'Пропустить' }).click();
  await expect(page.locator('.preview .done')).toContainText('Разобрано 1 из 2');
  await expect(toast(page)).toContainText('Разбор «Привет»: 1 из 2');
  await page.locator('.preview .done').getByRole('button', { name: 'Закончить' }).click();
  await expect(page.locator('.preview')).toHaveCount(0);
});
