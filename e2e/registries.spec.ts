import { expect, test } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// Roadmap 0.3: the shell draws the features' tabs, sections and keys from registries; a tab of a feature that is not
// there (turned off) comes back as «Функция выключена», its state kept.

test('a tab of a kind nobody registers: «Функция выключена» with its name; the layout keeps it', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('layout:/mock', JSON.stringify({ v: 1, active: 0, ratio: 0.5, panes: [{ active: 1, tabs: [
      { kind: 'file', path: '/mock/Work.org', cursor: { line: 0, col: 0 } },
      { kind: 'jira', data: { board: 'OPS' }, label: 'Jira · OPS' },
    ] }] }));
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { '/mock/Work.org': '* Q4\n' });
  await page.goto('/');
  const pane = page.locator('section.pane.active');
  await expect(pane.locator('.tab.on .lbl')).toHaveText('Jira · OPS');
  await expect(pane.getByRole('status')).toContainText('Функция выключена');
  await expect(pane.getByRole('status')).toContainText('Вкладка «Jira · OPS» появится снова, когда функцию включат.');
  // switching tabs and back: still there, still its state on save
  await pane.locator('.tab', { hasText: 'Work' }).click();
  await pane.locator('.tab', { hasText: 'Jira · OPS' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('layout:/mock') ?? 'null'));
  expect(saved.panes[0].tabs[1]).toMatchObject({ kind: 'jira', data: { board: 'OPS' }, label: 'Jira · OPS' });
});

test('the features\' sections of the navigator come in their places; their shortcuts show them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { '/mock/Work.org': '* Q4\n' });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab');
  // «Календарь», «Цели» and «Inbox» are built-in plugins: in their places among the core's (ТЗ 38)
  expect(await tabs.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Файлы', 'Inbox', 'Агенда', 'Цели', 'Календарь', 'Теги', 'Поиск по заметкам']);
  await page.keyboard.press('Control+Meta+5');
  await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true'); // «Календарь»
  await page.keyboard.press('Control+Meta+4');
  await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true'); // «Цели», once the plugin is started
  await page.keyboard.press('Control+Meta+2');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true'); // «Inbox»
  await page.keyboard.press('Control+Meta+8');
  await expect(tabs.nth(5)).toHaveAttribute('aria-selected', 'true'); // «Теги»
  // the settings: «Календарь» is the calendar's section, in its place
  await page.keyboard.press('Meta+Comma');
  expect(await page.getByRole('dialog', { name: 'Настройки' }).getByRole('tab').allInnerTexts()).toEqual(['Основные', 'Сегодня', 'Оформление', 'Статусы', 'Теги', 'Агенды', 'Inbox', 'Файлы', 'Мини-окно', 'Клавиши', 'Плагины', 'Календарь', 'Канбан']);
});
