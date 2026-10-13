import { expect, test } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';

// Roadmap 0.6: «Календарь» and the block «Цели квартала» are drawn by the core from the features' schemas.

const FILES = { '/mock/inbox.org': '* TODO a\n', '/mock/journal.org': '* Дни\n', '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'inbox.org' }, workflows: [{ name: 'Задачи', states: [{ name: 'TODO' }, { name: 'DONE', done: true }] }] }) };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, FILES);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
});

test('«Календарь»: each group says where it is kept; the hours exclude each other; a hint follows the value', async ({ page }) => {
  await openSettingsSheet(page, 'Календарь');
  const s = page.getByRole('region', { name: 'Календарь' });
  await expect(s.locator('.help').first()).toContainText('Хранится в папке заметок.');
  await expect(s.locator('.help', { hasText: 'Перетащите плашку' })).toContainText('Хранится на этом Mac.');
  await expect(s.getByLabel('До', { exact: true }).locator('option', { hasText: '20:00' })).toBeEnabled();
  await s.getByLabel('С', { exact: true }).selectOption('12');
  await expect(s.getByLabel('До', { exact: true }).locator('option', { hasText: /^12:00$/ })).toBeDisabled();
  const dl = s.locator('.opt', { hasText: 'Не менять дедлайн' });
  await expect(dl.locator('small')).toHaveText('Меняется только дата SCHEDULED');
  await dl.getByRole('switch').click();
  await expect(dl.locator('small')).toHaveText('DEADLINE сдвигается на столько же дней');
  await expect(s.getByLabel('Статус новой задачи')).toHaveValue(''); // unset: «Начальный статус набора»
  await s.getByLabel('Статус новой задачи').selectOption('TODO');
  await expect.poll(async () => page.evaluate(() => JSON.parse((window as any).__disk['/mock/.orgnotes/plugins/calendar.json'] ?? '{}').settings?.taskStatus)).toBe('TODO');
});

test('a file: ⎋ closes the picker, not the sheet; × gives back «как Inbox»', async ({ page }) => {
  await openSettingsSheet(page, 'Календарь');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await s.getByRole('button', { name: 'Выбрать файл для задач' }).click();
  await expect(page.getByRole('dialog', { name: 'Файл для задач' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Файл для задач' })).toHaveCount(0);
  await expect(s).toBeVisible();
  await s.getByRole('button', { name: 'Выбрать файл для задач' }).click();
  await page.getByRole('dialog', { name: 'Файл для задач' }).getByPlaceholder('Найти файл').fill('journal');
  await page.keyboard.press('Enter');
  await expect(s.getByTestId('calendar-0-taskFile')).toHaveText('journal.org');
  await s.getByRole('button', { name: 'Файл для задач: как Inbox' }).click();
  await expect(s.getByTestId('calendar-0-taskFile')).toHaveText('Inbox — inbox.org');
});

test('«Агенды»: the block of the goals, drawn from its schema, kept on this Mac', async ({ page }) => {
  await openSettingsSheet(page, 'Агенды');
  const s = page.getByRole('region', { name: 'Агенды' });
  await expect(s.getByText('ЦЕЛИ КВАРТАЛА')).toBeVisible();
  await expect(s.getByLabel('Цель «молчит» через')).toHaveValue('14');
  await expect(s.locator('.help', { hasText: 'Цель ACTIVE' })).toContainText('Хранится на этом Mac.');
});
