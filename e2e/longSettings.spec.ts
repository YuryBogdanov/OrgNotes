import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { openApp } from './helpers';

// ТЗ 40.6: «Настройки → Долгие дела» (the sources — a file with its level, a tag; the norm; the status of waiting; the
// block) and the block «Долгие дела» on «Сегодня» (up to three due, «и ещё N», a click opens the list on that one).

const NOW = new Date(2026, 9, 16, 11, 0);
const MID = ['* Первое', '* Второе', '** Подпроект', '* Третье', '* Четвёртое', '* Пятое', ''].join('\n');
const OLD = new Date(2026, 8, 1).getTime(); // 45 days: all due
const mtimes = (page: Page) => page.addInitScript((m) => ((window as any).__mtimeInit = m), { '/mock/Midterm.org': OLD, '/mock/work.org': OLD });
const settings = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });
const navRows = (page: Page) => page.getByRole('navigation', { name: 'Долгие дела' }).locator('.row .nm');

test('«Сегодня»: three due, the most overdue first, «и ещё 2»; a click opens the list on it; off in the settings', async ({ page }) => {
  await mtimes(page);
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1440, height: 960 });
  await installTauriMock(page, { '/mock/Midterm.org': MID }, { today: true });
  await page.goto('/');
  await pluginsReady(page);
  const block = page.getByRole('region', { name: 'Долгие дела' });
  await expect(block).toContainText('5 пора проверить');
  await expect(block.locator('.tr')).toHaveCount(3);
  await expect(block.locator('.tr').first()).toContainText('просрочено 31 дн.');
  await expect(block.locator('.more')).toHaveText('и ещё 2');
  await block.locator('.tr', { hasText: 'Второе' }).click();
  await expect(page.getByRole('tab', { selected: true }).filter({ hasText: 'Долгие дела' })).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Долгие дела' }).locator('.row.on')).toContainText('Второе');
  // the plugin's setting: no block
  await page.keyboard.press('Meta+Comma');
  await settings(page).getByRole('tab', { name: 'Долгие дела' }).click();
  await settings(page).getByRole('switch', { name: 'Блок в «Сегодня»' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /Сегодня/ }).click();
  await expect(page.getByRole('region', { name: 'Долгие дела' })).toHaveCount(0);
});

test('the sources: «Источники…» opens them; the level of the file, a tag of its own, a source away; the norm', async ({ page }) => {
  await mtimes(page);
  await openApp(page, { files: { '/mock/Midterm.org': MID, '/mock/work.org': '* TODO Проект :big:\n* TODO Задача\n' }, now: NOW });
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Долгие дела' }).click();
  await expect(navRows(page)).toHaveCount(5);
  await page.getByRole('navigation', { name: 'Долгие дела' }).getByRole('button', { name: 'Открыть список ›' }).click();
  await page.locator('.lmv').getByRole('button', { name: 'Источники…' }).click();
  const box = settings(page);
  await expect(box.getByRole('tab', { name: 'Долгие дела' })).toHaveAttribute('aria-selected', 'true');
  await expect(box.locator('.lm-src .src')).toHaveText([/Файл\s*Midterm\.org\s*уровень/, /Тег\s*:\s*:/]);
  // the level 2: «Подпроект» only
  await box.getByRole('combobox', { name: 'Уровень заголовков в Midterm.org' }).selectOption('2');
  await expect(navRows(page)).toHaveText(['Подпроект']);
  // the tag «big»
  await box.getByRole('textbox', { name: 'Тег долгих дел' }).fill(':big:');
  await box.getByRole('textbox', { name: 'Тег долгих дел' }).press('Tab');
  await expect(navRows(page)).toHaveText(['Подпроект', 'Проект']);
  // the file away
  await box.locator('.lm-src .src', { hasText: 'Midterm.org' }).getByRole('button', { name: 'Убрать источник' }).click();
  await expect(navRows(page)).toHaveText(['Проект']);
  // the norm: 60 days — none due
  await box.getByRole('combobox', { name: 'Норма проверки' }).selectOption({ label: '60 дней' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Долгие дела' }).locator('.grp')).toHaveText([/В норме\s*1/]);
  await expect(page.locator('.lmv .allcalm')).toHaveText('Всё под присмотром');
});

test('a source file not in the folder says so', async ({ page }) => {
  await mtimes(page);
  await page.addInitScript(() => localStorage.setItem('plugins:updatesChecked', String(Date.now())));
  await openApp(page, {
    files: { '/mock/Midterm.org': MID, '/mock/.orgnotes/plugins/long-matters.json': JSON.stringify({ settings: { sources: [{ kind: 'file', file: 'Нет.org', level: 1 }] } }) },
    now: NOW,
  });
  await page.keyboard.press('Meta+Comma');
  await settings(page).getByRole('tab', { name: 'Долгие дела' }).click();
  await expect(settings(page).locator('.lm-src .src')).toContainText('Файл не найден');
});
