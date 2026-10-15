import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { diskFile as disk } from './helpers';

// ТЗ 38, PR B: the menu of a tag in the navigator — renamed or merged in every file (a preview first; one ⌘Z), its
// colour, removed from every file. Its colour, «не наследовать» and the agendas follow a rename.

const PLATFORM = ['#+FILETAGS: :infra:', '* Инфраструктура   :infra:', '** TODO Kafka :infra:platform:', '** TODO Логи', '#+BEGIN_SRC org', '* пример :infra:', '#+END_SRC', ''].join('\n');
const WORK = ['* NEXT Бюджет :infra:budget:', '* Другое :platform:', ''].join('\n');
const CFG = JSON.stringify({ version: 1, tags: { colors: { infra: 'blue' }, noInherit: ['infra'] }, agendas: [{ id: 'a1', name: 'Инфра', sources: [], blocks: [{ id: 'b1', name: 'X', color: 'blue', conds: [{ field: 'tag', op: 'has', values: ['infra'] }], group: 'none', sort: 'prio', limit: null }] }] });
const nav = (page: Page) => page.getByRole('listbox', { name: 'Теги' });
async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('plugins:updatesChecked', String(Date.now())));
  await installTauriMock(page, { '/mock/platform.org': PLATFORM, '/mock/work.org': WORK, '/mock/.orgnotes/config.json': CFG });
  await page.goto('/');
  await pluginsReady(page);
  await page.keyboard.press('Control+Meta+8');
}
const menu = async (page: Page, tag: string) => nav(page).getByText(`:${tag}:`, { exact: true }).click({ button: 'right' });

test('the menu: its items in one line each; «Переименовать во всех файлах…» — the preview, the merge warning; one ⌘Z', async ({ page }) => {
  await open(page);
  await menu(page, 'infra');
  const items = page.getByRole('menuitem');
  await expect(items).toHaveText([/Показать заголовки/, /Добавить к фильтру/, /Открыть в новой вкладке/, /Переименовать во всех файлах…/, /Объединить с…/, /Цвет тега/, /Убрать из всех файлов…/]);
  await page.getByRole('menuitem', { name: /Переименовать во всех файлах/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Переименовать тег' });
  await sheet.getByLabel('Новое имя тега').fill('platform');
  await expect(sheet.getByLabel('Что изменится')).toContainText('Изменится 3 заголовка в 2 файлах.');
  await expect(sheet.getByLabel('Что изменится')).toContainText('Тег :platform: уже есть у 2 заголовков — теги объединятся.');
  await expect(sheet.getByLabel('Что изменится')).toContainText('platform.org 2 · work.org 1');
  await sheet.getByLabel('Новое имя тега').fill('a b');
  await expect(sheet.getByRole('alert')).toContainText('без пробелов');
  await expect(sheet.getByRole('button', { name: 'Переименовать' })).toBeDisabled();
  await sheet.getByLabel('Новое имя тега').fill('platform');
  await sheet.getByRole('button', { name: 'Переименовать' }).click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => disk(page, '/mock/platform.org')).toBe(['#+FILETAGS: :platform:', '* Инфраструктура   :platform:', '** TODO Kafka :platform:', '** TODO Логи', '#+BEGIN_SRC org', '* пример :infra:', '#+END_SRC', ''].join('\n'));
  expect(await disk(page, '/mock/work.org')).toBe(['* NEXT Бюджет :platform:budget:', '* Другое :platform:', ''].join('\n'));
  // the colour, «не наследовать» and the agenda's condition follow
  await expect.poll(async () => JSON.parse((await disk(page, '/mock/.orgnotes/config.json'))!).tags).toEqual({ colors: { platform: 'blue' }, noInherit: ['platform'] });
  expect(JSON.parse((await disk(page, '/mock/.orgnotes/config.json'))!).agendas[0].blocks[0].conds[0].values).toEqual(['platform']);
  await expect(nav(page).locator('.nm')).toHaveText([':platform:', ':budget:']);
  // one step back: both files («Отменить» of the toast, as ⌘Z outside the editor)
  await page.locator('.toast').last().getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toBe(WORK);
  expect(await disk(page, '/mock/platform.org')).toBe(PLATFORM);
});

test('«Объединить с…» picks one of the tags; «Цвет тега ›»; «Убрать из всех файлов…» asks, the headings stay', async ({ page }) => {
  await open(page);
  await menu(page, 'budget');
  await page.getByRole('menuitem', { name: /Объединить с/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Объединить тег' });
  await sheet.getByLabel('С каким тегом объединить').fill('plat');
  await sheet.getByRole('option', { name: /:platform:/ }).click();
  await expect(sheet.getByLabel('Что изменится')).toContainText('Изменится 1 заголовок в 1 файле.');
  await sheet.getByRole('button', { name: 'Объединить' }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toBe(['* NEXT Бюджет :infra:platform:', '* Другое :platform:', ''].join('\n'));
  // the colour
  await menu(page, 'platform');
  await page.getByRole('menuitem', { name: /Цвет тега/ }).hover();
  await page.getByRole('menuitem', { name: 'Зелёный' }).click();
  await expect.poll(async () => JSON.parse((await disk(page, '/mock/.orgnotes/config.json'))!).tags.colors).toEqual({ infra: 'blue', platform: 'green' });
  // removed
  await menu(page, 'infra');
  await page.getByRole('menuitem', { name: /Убрать из всех файлов/ }).click();
  const ask = page.getByRole('alertdialog', { name: 'Убрать тег' });
  await expect(ask).toContainText('Убрать :infra: у 3 заголовков в 2 файлах?');
  await ask.getByRole('button', { name: 'Убрать' }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toBe(['* NEXT Бюджет :platform:', '* Другое :platform:', ''].join('\n'));
  expect(await disk(page, '/mock/platform.org')).toBe(['#+FILETAGS:', '* Инфраструктура', '** TODO Kafka :platform:', '** TODO Логи', '#+BEGIN_SRC org', '* пример :infra:', '#+END_SRC', ''].join('\n'));
  // ⌘Z outside the editor: the tag back in both files at once
  await nav(page).focus();
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page, '/mock/platform.org')).toBe(['#+FILETAGS: :infra:', '* Инфраструктура   :infra:', '** TODO Kafka :infra:platform:', '** TODO Логи', '#+BEGIN_SRC org', '* пример :infra:', '#+END_SRC', ''].join('\n'));
  expect(await disk(page, '/mock/work.org')).toBe(['* NEXT Бюджет :infra:platform:', '* Другое :platform:', ''].join('\n'));
});
