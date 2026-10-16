import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';

// ТЗ 38, PR A: the navigator's «Теги» (no «Задачи» any more) and the tab «Тег» — the headings with all the tags of
// its filter, by file, with inheritance or not; «Часто вместе»; saved as an agenda; the colours and «Не наследовать».

const PLATFORM = [
  '* Инфраструктура :infra:',
  '** TODO Обновить Kafka до 3.8',
  'SCHEDULED: <2020-10-17 Сб>',
  '** NEXT Переезд в новый ДЦ :dc:',
  '*** TODO Учения по откату',
  '** DONE Апгрейд Postgres 16',
  'CLOSED: [2026-10-07 Ср 12:00]',
  '* 1-1 :1on1:',
  '** TODO План дежурств',
  '',
].join('\n');
const WORK = ['#+FILETAGS: :work:', '* NEXT Бюджет на второй ДЦ :infra:dc:budget:', '* Заметка :infra:', ''].join('\n');
const FILES = { '/mock/platform.org': PLATFORM, '/mock/work.org': WORK };

const nav = (page: Page) => page.getByRole('listbox', { name: 'Теги' });
const view = (page: Page) => page.locator('.tv');
async function open(page: Page, files: Record<string, string> = FILES) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('plugins:updatesChecked', String(Date.now())));
  await installTauriMock(page, files);
  await page.goto('/');
  await pluginsReady(page);
}

test('the bar: no «Задачи»; «Теги» by ⌃⌘8 — the tags by count or A–Я, how often each is set; the search', async ({ page }) => {
  await open(page);
  const tabs = page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab');
  expect(await tabs.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Файлы', 'Inbox', 'Агенда', 'Цели', 'Долгие дела', 'Календарь', 'Теги', 'Поиск по заметкам']);
  await page.keyboard.press('Control+Meta+8');
  await expect(page.getByRole('tab', { name: 'Теги' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tp .head')).toContainText('ТЕГИ · 5');
  await expect(nav(page).locator('.nm')).toHaveText([':infra:', ':dc:', ':1on1:', ':budget:', ':work:']); // by count, then by name
  await expect(nav(page).locator('.n')).toHaveText(['3', '2', '1', '1', '0']);
  await page.getByRole('radio', { name: 'А–Я' }).click();
  expect(await nav(page).locator('.nm').allInnerTexts()).toEqual([':1on1:', ':budget:', ':dc:', ':infra:', ':work:']);
  await page.getByLabel('Найти тег').fill(':in');
  await expect(nav(page).locator('.nm')).toHaveText([':infra:']);
});

test('a click: the tab «Тег» — by file, with inheritance, the inherited capsules lighter; the kinds; ⌘-click adds a tag (И)', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Meta+8');
  await nav(page).getByText(':infra:').click();
  await expect(page.locator('.tab.on')).toContainText('Тег :infra:');
  await expect(view(page).locator('.sum')).toHaveText('7 заголовков в 2 файлах');
  expect(await view(page).locator('.gh b').allInnerTexts()).toEqual(['platform', 'work']);
  const kafka = view(page).locator('.row', { hasText: 'Обновить Kafka' });
  await expect(kafka.locator('.src')).toHaveText('platform › Инфраструктура');
  await expect(kafka.locator('.tg.inh')).toHaveAttribute('title', 'от раздела «Инфраструктура»');
  await expect(kafka.locator('.date')).toHaveClass(/late/); // 2020: overdue
  await expect(view(page).locator('.row.done')).toContainText('Апгрейд Postgres 16');
  // without inheritance: only where it is set
  await view(page).getByRole('switch', { name: 'с наследованием' }).click();
  await expect(view(page).locator('.sum')).toHaveText('3 заголовка в 2 файлах');
  await view(page).getByRole('switch', { name: 'с наследованием' }).click();
  await view(page).getByRole('radio', { name: 'Только открытые' }).click();
  await expect(view(page).locator('.row')).toHaveCount(4);
  await view(page).getByRole('radio', { name: 'Все заголовки' }).click();
  // ⌘-click: both tags
  await nav(page).getByText(':dc:').click({ modifiers: ['Meta'] });
  await expect(page.locator('.tab.on')).toContainText('Теги: :infra: и :dc:');
  await expect(view(page).locator('.and')).toHaveText('И');
  await expect(view(page).locator('.sum')).toHaveText('3 заголовка в 2 файлах');
  await expect(nav(page).locator('.tag.on .nm')).toHaveText([':infra:', ':dc:']);
  // × takes one away; the last one gone — the empty state
  await view(page).getByRole('button', { name: 'Убрать тег infra' }).click();
  await view(page).getByRole('button', { name: 'Убрать тег dc' }).click();
  await expect(view(page)).toContainText('Выберите тег в навигаторе');
});

test('«Часто вместе» and «+ тег» add to the filter; ↩ opens a row; «Сохранить как агенду…» — the builder with «все из»', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Meta+8');
  await nav(page).getByText(':dc:').click();
  await expect(view(page).locator('.co')).toHaveText([':infra: 3', ':budget: 1', ':work: 1']);
  await view(page).locator('.co', { hasText: ':budget:' }).click();
  await expect(view(page).locator('.chip')).toHaveCount(2);
  await expect(view(page).locator('.row')).toHaveCount(1);
  await view(page).getByRole('button', { name: 'Убрать тег budget' }).click();
  await view(page).getByRole('button', { name: '+ тег' }).click();
  await page.keyboard.type('inf');
  await page.keyboard.press('Enter');
  await expect(view(page).locator('.chip')).toHaveText([/:dc:/, /:infra:/]);
  // a row: chosen by a click, opened by ↩
  await view(page).locator('.row', { hasText: 'Учения по откату' }).click();
  await page.keyboard.press('Enter');
  await expect(page.locator('section.pane .tab.on').filter({ hasText: 'platform' })).toHaveCount(1);
  // saved as an agenda
  await page.locator('.tab', { hasText: 'Теги:' }).first().click();
  await view(page).getByRole('button', { name: 'Сохранить как агенду…' }).click();
  const b = page.getByRole('dialog', { name: /агенд/i });
  await expect(b).toBeVisible();
  await expect(b).toContainText('все из');
  await expect(b).toContainText('dc');
});

test('«Настройки → Теги»: a tag\'s colour (the navigator\'s dot) and «Не наследовать» — written to config.json', async ({ page }) => {
  await open(page, { ...FILES, '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, tags: { colors: { infra: 'blue' } } }) });
  await page.keyboard.press('Control+Meta+8');
  await expect(nav(page).locator('.tag', { hasText: ':infra:' }).locator('i')).toHaveAttribute('style', /--p-blue/);
  await openSettingsSheet(page, 'Теги');
  const sheet = page.getByRole('dialog', { name: 'Настройки' });
  await sheet.getByLabel('Добавить тег, который не наследуется').fill('infra');
  await page.keyboard.press('Enter');
  await expect.poll(async () => JSON.parse((await page.evaluate(() => (window as any).__disk['/mock/.orgnotes/config.json'])) ?? '{}').tags).toEqual({ colors: { infra: 'blue' }, noInherit: ['infra'] });
  await sheet.getByRole('button', { name: 'Готово' }).click();
  await nav(page).getByText(':infra:').click();
  await expect(view(page).locator('.sum')).toHaveText('3 заголовка в 2 файлах'); // not passed down any more
});
