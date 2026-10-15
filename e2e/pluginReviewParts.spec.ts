import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { diskAll as disk, toast, palette as pal } from './helpers';

// ТЗ 27 §2.3 and the goals' own sheets (roadmap 2.1 B): a review of the plugin's own on the core's frame — its
// header, quick buttons, a panel with a note (a core widget) saved before the card changes, actions on keys with
// «disabled», its own summary; a sheet the plugin draws whole, with the core's calendar in it.

const WORK = '/mock/Work.org';
const FILES = { [WORK]: '* TODO Подготовить бюджет\n* TODO Позвонить\n' };

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('plugins:enabled', JSON.stringify({ hello: true })));
  await installTauriMock(page, FILES);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}
async function run(page: Page, q: string) {
  await expect(async () => {
    if (!(await pal(page).count())) await page.keyboard.press('Shift+Meta+p');
    await pal(page).getByRole('combobox').fill(q);
    await expect(pal(page).getByRole('option', { name: new RegExp('^Привет: ' + q.replace(/^привет: /, ''), 'i') }).first()).toBeVisible({ timeout: 500 });
  }).toPass();
  await page.keyboard.press('Enter');
}

test('the card\'s header, quick buttons and panel are the plugin\'s; a note on ⌘↩, saved before ⌘]; its own summary', async ({ page }) => {
  await open(page);
  await run(page, 'привет: разбор с заметками');
  const card = page.locator('.preview .card');
  await expect(card.locator('.hello-rh')).toHaveText('Подготовить бюджет · 1 из 2');
  await expect(card.locator('.hello-pill')).toHaveText('TODO');
  const bar = page.locator('.preview .bar');
  await expect(bar.getByRole('button', { name: /Записать заметку/ })).toBeDisabled(); // nothing typed
  await expect(bar.getByRole('button', { name: /Выполнено/ })).toContainText('DONE');
  await expect(bar.getByRole('button', { name: 'Пропустить' })).toHaveCount(0); // its own «Следующая»
  const note = card.locator('.hello-aside textarea');
  await note.click();
  await page.keyboard.type('бюджет согласован');
  await expect(bar.getByRole('button', { name: /Записать заметку/ })).toBeEnabled();
  await page.keyboard.press('Meta+Enter');
  await expect.poll(async () => (await disk(page))[WORK]).toBe('* TODO Подготовить бюджет\n- бюджет согласован\n* TODO Позвонить\n');
  await expect(note).toHaveValue(''); // the panel drawn again
  // the file read back after its save does not draw the panel again: a note being typed keeps the focus
  await note.evaluate((e) => (e.dataset.mark = '1'));
  await page.waitForTimeout(1500);
  await expect(card.locator('.hello-aside textarea[data-mark]')).toHaveCount(1);
  // a note typed and the card changed: saved first
  await note.click();
  await page.keyboard.type('позвонить в пятницу');
  await page.keyboard.press('Meta+BracketRight');
  await expect(card.locator('.hello-rh')).toHaveText('Позвонить · 2 из 2');
  await expect.poll(async () => (await disk(page))[WORK]).toContain('* TODO Подготовить бюджет\n- позвонить в пятницу\n- бюджет согласован\n');
  // «Назад» goes back, the quick button opens the core's statuses for the heading
  await page.locator('.preview .back').click();
  await expect(card.locator('.hello-rh')).toHaveText('Подготовить бюджет · 1 из 2');
  await card.locator('.quick').getByRole('button', { name: /Статус/ }).click();
  await expect(pal(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+BracketRight');
  await page.keyboard.press('Meta+BracketRight');
  await expect(page.locator('.preview .done')).toContainText('Заметок: 2, разобрано 2 из 2');
  await page.locator('.preview .done').getByRole('button', { name: 'Готово' }).click();
  await expect(page.locator('.preview')).toHaveCount(0);
  await expect(toast(page)).toContainText('Разбор с заметками: 2 заметок, закончен');
});

test('a sheet drawn whole by the plugin, the core\'s calendar in it; ⎋ is the plugin\'s', async ({ page }) => {
  await open(page);
  await run(page, 'привет: свой лист');
  const sheet = page.getByRole('dialog', { name: 'Свой лист' });
  await expect(sheet.locator('.hello-day')).toHaveText('День не выбран');
  const d = new Date();
  d.setDate(d.getDate() + 2);
  const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  await sheet.getByRole('gridcell', { name: new RegExp(`, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}$`) }).click();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await expect(sheet.locator('.hello-day')).toHaveText('День: ' + iso);
  await sheet.getByRole('button', { name: 'Готово' }).click();
  await expect(toast(page)).toContainText('Свой лист: ' + iso);
  await run(page, 'привет: свой лист');
  await sheet.press('Escape');
  await expect(toast(page)).toContainText('Свой лист: отмена');
  await expect(sheet).toHaveCount(0);
});
