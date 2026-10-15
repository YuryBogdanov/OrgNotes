import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { diskAll as disk, toast, palette as pal } from './helpers';

// ТЗ 27 §2 (roadmap 2.1 A): the core's extension points for plugins with their own structure in a file, shown by
// «Привет»: a form with lines, a day, a place and a field of its own; tx.update with onUndo; a sheet; a menu; a
// choice in the palette; the statuses' palette for a heading; a status's colour; sets of statuses and commands
// available from code; closing its tab.

const WORK = '/mock/Work.org';
const FILES = {
  [WORK]: '* Q4\n** TODO Подготовить бюджет\n** TODO Позвонить\n',
  '/mock/Дом.org': '#+TITLE: Дом\n',
  '/mock/Идеи.org': '* IDEA Мысль\n',
};
const iso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function open(page: Page, files: Record<string, string> = FILES) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('plugins:enabled', JSON.stringify({ hello: true })));
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}
/** A command of «Привет» from the palette, once the plugin is started (its row is there). */
async function run(page: Page, q: string) {
  await expect(async () => {
    if (!(await pal(page).count())) await page.keyboard.press('Shift+Meta+p');
    await pal(page).getByRole('combobox').fill(q);
    await expect(pal(page).getByRole('option', { name: new RegExp('^Привет: ' + q.replace(/^привет: /, ''), 'i') }).first()).toBeVisible({ timeout: 500 });
  }).toPass();
  await page.keyboard.press('Enter');
}

test('a form: a place in columns, the title from the plugin, lines with a list, a day, a field of its own; tx.update; ⌘Z with onUndo', async ({ page }) => {
  await open(page);
  await run(page, 'привет: заметка');
  const form = page.getByRole('dialog', { name: 'Заметка' });
  await expect(form.locator('.hello-chip')).toHaveText('0 стр.');
  await form.getByRole('button', { name: 'Добавить' }).click();
  await expect(form.getByRole('alert')).toHaveText('Выберите файл и заголовок');
  await form.getByRole('listbox', { name: 'Файлы' }).getByRole('option', { name: /Work/ }).click();
  await expect(form.getByRole('listbox', { name: 'Файлы' }).getByRole('option', { name: /Work/ })).toContainText('рабочий');
  await expect(form.getByLabel('Заголовок')).toHaveValue('Заметка о Work'); // onChange of the plugin
  await form.getByRole('listbox', { name: /Заголовки/ }).getByRole('option', { name: 'Q4' }).click();
  const ta = form.getByRole('textbox', { name: 'Текст' });
  await ta.click();
  await page.keyboard.type('- краска');
  await page.keyboard.press('Enter');
  await page.keyboard.type('кисти');
  await expect(ta).toHaveValue('- краска\n- кисти');
  await expect(form.locator('.hello-chip')).toHaveText('2 стр.');
  await form.getByRole('button', { name: 'День' }).click();
  const d3 = new Date();
  d3.setDate(d3.getDate() + 3);
  const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  await form.getByRole('gridcell', { name: new RegExp(`, ${d3.getDate()} ${MON[d3.getMonth()]} ${d3.getFullYear()}$`) }).click();
  await form.getByRole('button', { name: '🤩 вау' }).click();
  await form.getByRole('button', { name: 'Добавить' }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(async () => (await disk(page))[WORK]).toBe(`* Q4\n** TODO Подготовить бюджет\n** TODO Позвонить\n** Заметка о Work :wow:\nSCHEDULED: <${iso(3)} ${['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date(Date.now() + 3 * 864e5).getDay()]}>\n- краска\n- кисти\n`);
  await expect(toast(page)).toContainText('Заметка добавлена');
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await disk(page))[WORK]).toBe(FILES[WORK]);
  await expect(toast(page)).toContainText('Привет: заметка отменена'); // onUndo
});

test('the form\'s «+ Создать»: the plugin makes the heading in the same transaction', async ({ page }) => {
  await open(page);
  await run(page, 'привет: заметка');
  const form = page.getByRole('dialog', { name: 'Заметка' });
  await form.getByRole('listbox', { name: 'Файлы' }).getByRole('option', { name: /Дом/ }).click();
  await form.getByRole('option', { name: '+ Создать «Заметки» в конце файла' }).click();
  await form.getByRole('button', { name: 'Добавить' }).click();
  await expect.poll(async () => (await disk(page))['/mock/Дом.org']).toBe('#+TITLE: Дом\n* Заметки\n** Заметка о Дом :ok:\n');
});

test('a sheet: ↩ the primary button, ⎋ nothing; a choice in the palette; the menu of the core', async ({ page }) => {
  await open(page);
  await run(page, 'привет: о плагине');
  const sheet = page.getByRole('dialog', { name: 'О плагине «Привет»' });
  await expect(sheet.locator('.hello-about')).toHaveText('Пример плагина: всё — через API.');
  await page.keyboard.press('Enter');
  await expect(toast(page)).toContainText('Лист закрыт: ok');
  await run(page, 'привет: о плагине');
  await page.keyboard.press('Escape');
  await expect(toast(page)).toContainText('Лист закрыт: отмена');
  // choose
  await run(page, 'привет: открыть файл');
  await expect(pal(page)).toContainText('Какой файл открыть');
  await page.keyboard.type('Иде');
  await page.keyboard.press('Enter');
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('Идеи');
  // menu
  await page.keyboard.press('Control+Meta+7');
  await page.locator('.hello-files').getByRole('button', { name: 'Дом' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Скопировать путь' })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Поздороваться' }).click();
  await expect(toast(page)).toContainText('Привет, Дом!');
});

test('the statuses\' palette for a heading; a status\'s colour; a set of statuses from code; a command available from code; closing a tab', async ({ page }) => {
  await open(page);
  // «IDEA» is a status of the plugin's set: the idea counts as an open task
  await expect(async () => { // once the plugin is started
    await page.keyboard.press('Control+Meta+h');
    await expect(toast(page)).toContainText('Открытых задач: 3', { timeout: 1000 });
  }).toPass();
  await run(page, 'привет: статус первой'); // the first open one is the idea: its file is shown, the statuses of its set offered
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('Идеи');
  await expect(pal(page)).toBeVisible();
  await expect(pal(page).getByRole('option', { name: /SHIPPED/ })).toBeVisible();
  await page.keyboard.press('Escape');
  // the board: the colour of TODO, then closed by the plugin
  await run(page, 'привет: доска');
  await expect(page.locator('.hello-first')).toHaveAttribute('data-tone', /^(red|orange|yellow|green|teal|blue|purple|gray)$/);
  await page.locator('.hello-board').getByRole('button', { name: 'Закрыть доску' }).click();
  await expect(page.locator('.hello-board')).toHaveCount(0);
});

test('a command not available is not offered', async ({ page }) => {
  await open(page, { '/mock/Пусто.org': '* Просто заголовок\n' });
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('привет: разобрать');
  await expect(pal(page)).not.toContainText('Привет: разобрать задачи');
});
