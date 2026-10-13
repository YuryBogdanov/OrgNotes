import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';

// ТЗ 28 §1 (roadmap 3.1 A): what the Inbox needs of the core, shown by «Привет»: the Inbox file and its change, the
// quick entry and the choice of the file, a badge on the section, the core's move, a step taken back, the palette's
// steps for a heading, the month under a review's card, «open in the file» beside, a card edited in place, a scope
// of review keys per plugin.

const WORK = '/mock/Work.org';
const FILES = {
  [WORK]: '* TODO Подготовить бюджет\n* TODO Позвонить\n',
  '/mock/Дом.org': '* Покупки\n',
  '/mock/inbox.org': '',
  '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'inbox.org' } }),
};
const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const toast = (page: Page) => page.locator('.toast');
const pal = (page: Page) => page.getByRole('dialog', { name: 'Командная палитра' });

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('plugins:enabled', JSON.stringify({ hello: true })));
  await installTauriMock(page, FILES);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await pluginsReady(page);
}
async function run(page: Page, q: string) {
  await page.keyboard.press('Shift+Meta+p');
  await pal(page).getByRole('combobox').fill(q);
  await expect(pal(page).getByRole('option', { name: new RegExp('^Привет: ' + q.replace(/^привет: /, ''), 'i') }).first()).toBeVisible();
  await page.keyboard.press('Enter');
}

test('the Inbox file and its change; the core\'s choice of it; a badge on the section', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('tablist', { name: 'Режимы навигатора' }).locator('.badge[aria-label="Привет: 2"]')).toHaveText('2');
  await run(page, 'привет: про inbox');
  await expect(toast(page)).toContainText('Inbox: inbox.org · новые в начало');
  await toast(page).getByRole('button', { name: 'Выбрать…' }).click();
  await page.getByRole('dialog', { name: 'Файл Inbox' }).getByPlaceholder('Найти файл').fill('Дом');
  await page.keyboard.press('Enter');
  await run(page, 'привет: про inbox'); // the plugin heard «inbox.changed»
  await expect(toast(page)).toContainText('Inbox: Дом.org');
});

test('the core\'s move: where the task went; «Отменить» takes the step back', async ({ page }) => {
  await open(page);
  await run(page, 'привет: перенести первую');
  const dlg = page.getByRole('dialog', { name: /^Перенести/ });
  await expect(dlg).toBeVisible();
  await page.keyboard.type('Дом');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Покупки');
  await page.keyboard.press('Enter');
  await expect(toast(page)).toContainText('Перенесено: Подготовить бюджет → ');
  await expect.poll(async () => (await disk(page))['/mock/Дом.org']).toContain('** TODO Подготовить бюджет');
  await toast(page).getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(async () => (await disk(page))[WORK]).toBe(FILES[WORK]);
});

test('a review: the deadline step for the card, the month (⌘K), «Открыть в файле» beside, the card kept while its title is edited', async ({ page }) => {
  await open(page);
  await run(page, 'привет: разбор с заметками');
  const card = page.locator('.preview .card');
  await card.locator('.quick').getByRole('button', { name: 'Дедлайн' }).click();
  await expect(pal(page).locator('.tok')).toHaveText('Дедлайн');
  await page.keyboard.press('Escape');
  // the month under the card
  await expect(page.getByRole('region', { name: 'Календарь' })).toHaveCount(0);
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('region', { name: 'Календарь' })).toBeVisible();
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('region', { name: 'Календарь' })).toHaveCount(0);
  // open in the file: a tab next to the review, the review stays in front
  await page.locator('.preview .bar').getByRole('button', { name: 'Открыть в файле' }).click();
  await expect(page.locator('section.pane.active .tab', { hasText: 'Work' })).toHaveCount(1);
  await expect(page.locator('section.pane.active .tab.on')).toContainText('Разбор с заметками');
  // the title edited in the card: the card stays
  await card.locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' 2027');
  await expect(card.locator('.hello-rh')).toHaveText('Подготовить бюджет 2027 · 1 из 2');
});

test('each plugin\'s review has its own keys: ⌘1 of «Привет» and of «Цели квартала» do not clash', async ({ page }) => {
  await open(page);
  await openSettingsSheet(page, 'Клавиши');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await expect(s.locator('.row', { hasText: 'Разбор «Привет»: Выполнено' })).toContainText('⌘1');
  await expect(s.locator('.row', { hasText: 'Разбор целей: Цель достигнута' })).toContainText('⌘1');
  await expect(s.locator('.row', { hasText: 'Разбор «Привет»: Выполнено' }).locator('.warn')).toHaveCount(0);
});
