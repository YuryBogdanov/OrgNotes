import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { FILES, INBOX, NOW } from './inboxFixture';

// ТЗ «Inbox — раздел навигатора и быстрый ввод задачи (⇧⌘I)».
const IB = '/mock/inbox.org';
const disk = (page: Page, p = IB) => page.evaluate((p) => (window as any).__disk[p] as string, p);
const config = (page: Page) => page.evaluate(() => JSON.parse((window as any).__disk['/mock/.orgnotes/config.json'] ?? 'null'));
const log = (page: Page) => page.evaluate(() => (window as any).__log as unknown[][]);
const modes = (page: Page) => page.getByRole('tablist', { name: 'Режимы навигатора' });
const panel = (page: Page) => page.locator('.inbox');
const rows = (page: Page) => panel(page).locator('.row');
const titles = (page: Page) => panel(page).locator('.row .t');
const cap = (page: Page) => page.getByRole('dialog', { name: 'Новая задача в Inbox' });
const picker = (page: Page) => page.locator('.pal');

async function open(page: Page, files: Record<string, string> = FILES()) {
  await page.setViewportSize({ width: 1440, height: 800 });
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await modes(page).getByRole('tab', { name: 'Inbox' }).click();
}

test.describe('the navigator', () => {
  test('the bar: Файлы first (and by default), then Inbox, Задачи, Агенда, Теги, Поиск; names as tips; the count on Inbox', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await installTauriMock(page, FILES());
    await page.goto('/');
    await expect(page.locator('.cm-content').first()).toBeVisible();
    const tabs = modes(page).getByRole('tab');
    expect(await tabs.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Файлы', 'Inbox', 'Задачи', 'Агенда', 'Теги', 'Поиск по заметкам']);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toHaveAttribute('title', /^Inbox/);
    await expect(tabs.nth(2)).toBeDisabled();
    await expect(modes(page).locator('.badge')).toHaveText('4');
    await page.keyboard.press('Control+Meta+2');
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Control+Meta+3');
    await expect(page.getByRole('navigation', { name: 'Список агенд' })).toBeVisible();
    await page.keyboard.press('Control+Meta+1');
    await expect(page.locator('.nav')).toBeVisible();
  });

  test('not set up: the stub; «Создать inbox.org» makes the file and sets it', async ({ page }) => {
    const files = FILES(false);
    delete (files as Record<string, string>)['/mock/inbox.org'];
    await open(page, files);
    await expect(panel(page)).toContainText('Inbox пока не настроен');
    await expect(panel(page)).toContainText('Выберите файл, в который будут попадать быстрые задачи');
    await expect(modes(page).locator('.badge')).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Создать inbox.org в рабочей папке' }).click();
    await expect.poll(async () => (await config(page))?.inbox?.file).toBe('inbox.org');
    expect(await disk(page)).toMatch(/^#\+TITLE: inbox\n+$/); // as any new file of the app
    await expect(panel(page)).toContainText('Inbox разобран');
  });

  test('«Выбрать файл…»: a palette of files with a filter; a file that is gone shows «не найден»', async ({ page }) => {
    const files = { ...FILES(false), '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'старый.org' } }) };
    await open(page, files);
    await expect(panel(page)).toContainText('Файл старый не найден');
    await panel(page).getByRole('button', { name: 'Выбрать файл…' }).click();
    await expect(picker(page)).toContainText('Файл Inbox');
    await page.keyboard.type('inb');
    await expect(picker(page).locator('.r .l')).toHaveText(['inbox']);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await config(page)).inbox.file).toBe('inbox.org');
    await expect(titles(page)).toHaveCount(4);
  });
});

test.describe('the list', () => {
  test('open top-level tasks, newest first, those without :CREATED: at the end; a details line; relative time', async ({ page }) => {
    await page.clock.setFixedTime(NOW); // the stamps are counted from the last 14:00
    await open(page);
    await expect(titles(page)).toHaveText(['Позвонить в банк про лимиты', 'Согласовать отпуск с тимлидами', 'Идея: ежемесячный обзор рисков', 'Проверить доступы подрядчика']);
    await expect(rows(page).first().locator('.det')).toHaveText('по карте компании, уточнить комиссию');
    await expect(rows(page).first().locator('.when')).toHaveText('5 мин');
    await expect(rows(page).nth(1).locator('.when')).toHaveText('вчера');
    await expect(rows(page).nth(3).locator('.when')).toHaveText('');
    // ↑↓ and ↩: the task opens in the editor at its heading
    await rows(page).first().click();
    await page.keyboard.press('ArrowDown');
    await expect(rows(page).nth(1)).toHaveClass(/sel/);
    await page.keyboard.press('Enter');
    await expect(page.locator('section.pane.active .status')).toContainText('Стр. 7');
  });

  test('a task written into the file by another program shows up; the counter follows', async ({ page }) => {
    await open(page);
    await page.evaluate((p) => (window as any).__setDisk(p, (window as any).__disk[p] + '* TODO Из Emacs\n'), IB);
    await expect(titles(page).last()).toHaveText('Из Emacs');
    await expect(modes(page).locator('.badge')).toHaveText('5');
  });
});

test.describe('quick entry', () => {
  test('↩ with a title only: on disk at once, at the end, `* TODO …` with :CREATED:; «Добавлено в Inbox»', async ({ page }) => {
    await open(page);
    await panel(page).getByRole('button', { name: /Новая задача в Inbox/ }).click();
    await expect(cap(page).locator('.crumb')).toHaveText(/Новая задача\s*›\s*inbox\.org/);
    await expect(cap(page).getByLabel('Заголовок задачи')).toBeFocused();
    await expect(cap(page)).toContainText('Детали (необязательно) — Tab');
    await page.keyboard.press('Enter'); // empty: nothing
    await expect(cap(page)).toBeVisible();
    await page.keyboard.type('Позвонить   юристу  ');
    const t0 = Date.now();
    await page.keyboard.press('Enter');
    await expect(cap(page)).toHaveCount(0);
    await expect.poll(() => disk(page), { timeout: 400 }).toMatch(/^#\+TITLE: Inbox\n\* TODO Позвонить юристу\n:PROPERTIES:\n:CREATED: \[\d{4}-\d{2}-\d{2} \w{3} \d{2}:\d{2}\]\n:END:\n\n\* TODO Позвонить в банк/);
    expect(Date.now() - t0).toBeLessThan(500); // not after the autosave pause
    expect((await disk(page)).endsWith(INBOX().slice('#+TITLE: Inbox\n'.length))).toBe(true); // the rest untouched
    await expect(page.locator('.toast')).toContainText('Добавлено в Inbox');
    await expect(titles(page).first()).toHaveText('Позвонить юристу'); // the newest on top
    await expect(modes(page).locator('.badge')).toHaveText('5');
  });

  test('Tab: details (↩ new line, ⇧Tab back, ⌘↩ creates); a heading-like line is escaped; ⇧⌘I opens it too', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Shift+Meta+i');
    await expect(cap(page)).toBeVisible();
    await page.keyboard.type('Подготовить презентацию');
    await page.keyboard.press('Tab');
    await expect(cap(page).getByLabel('Детали задачи')).toBeFocused();
    await expect(cap(page).locator('.keys')).toContainText('⌘↩ создать');
    await page.keyboard.type('План найма');
    await page.keyboard.press('Enter');
    await page.keyboard.type('* бюджет на Q4');
    await page.keyboard.press('Shift+Tab');
    await expect(cap(page).getByLabel('Заголовок задачи')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Meta+Enter');
    await expect(cap(page)).toHaveCount(0);
    await expect.poll(() => disk(page)).toMatch(/^#\+TITLE: Inbox\n\* TODO Подготовить презентацию\n:PROPERTIES:\n:CREATED: [^\n]+\n:END:\nПлан найма\n,\* бюджет на Q4\n\n\* TODO Позвонить в банк/);
  });

  test('Esc keeps the draft for next time; without an Inbox file the stub comes and nothing typed is lost', async ({ page }) => {
    await open(page, { ...FILES(false) });
    await page.keyboard.press('Shift+Meta+i');
    await page.keyboard.type('Черновик задачи');
    await page.keyboard.press('Escape');
    await expect(cap(page)).toHaveCount(0);
    await page.keyboard.press('Shift+Meta+i');
    await expect(cap(page).getByLabel('Заголовок задачи')).toHaveValue('Черновик задачи');
    await page.keyboard.press('Enter');
    await expect(cap(page)).toContainText('Inbox пока не настроен');
    await cap(page).getByRole('button', { name: 'Выбрать файл…' }).click();
    await page.keyboard.type('inb');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await config(page))?.inbox?.file).toBe('inbox.org');
    await page.keyboard.press('Shift+Meta+i');
    await expect(cap(page).getByLabel('Заголовок задачи')).toHaveValue('Черновик задачи');
    await page.keyboard.press('Enter');
    await expect.poll(() => disk(page)).toContain('* TODO Черновик задачи');
  });

  test('the Inbox file open with unsaved edits: they are written along, the editor shows the task, no conflict', async ({ page }) => {
    await open(page);
    await page.locator('section.pane .cm-line', { hasText: 'Проверить доступы' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' срочно');
    await page.keyboard.press('Shift+Meta+i');
    await page.keyboard.type('Новая');
    await page.keyboard.press('Enter');
    await expect.poll(() => disk(page)).toMatch(/^#\+TITLE: Inbox\n\* TODO Новая\n[^]*\* TODO Проверить доступы подрядчика срочно\n$/);
    await expect(page.locator('section.pane .cm-line', { hasText: 'TODO Новая' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /изменился|Файл/ })).toHaveCount(0);
  });
});

test.describe('sorting out', () => {
  test('Готово: DONE with CLOSED:, the row goes; ⌘Z in the list brings it back', async ({ page }) => {
    await open(page);
    await rows(page).first().getByRole('button', { name: /^Готово/ }).click();
    await expect(titles(page)).toHaveCount(3);
    expect(await disk(page)).toMatch(/\* DONE Позвонить в банк про лимиты\nCLOSED: \[[^\]]+\]/);
    await panel(page).getByRole('listbox').focus();
    await page.keyboard.press('Meta+z');
    await expect(titles(page)).toHaveCount(4);
    expect(await disk(page)).toBe(INBOX());
  });

  test('Удалить: asks when the task has details; at once without', async ({ page }) => {
    await open(page);
    await rows(page).nth(3).hover();
    await rows(page).nth(3).getByRole('button', { name: 'Удалить' }).click();
    await expect(titles(page)).toHaveCount(3);
    expect(await disk(page)).not.toContain('Проверить доступы');
    await rows(page).first().click();
    await rows(page).first().getByRole('button', { name: 'Удалить' }).click();
    const dlg = page.getByRole('alertdialog', { name: 'Удаление задачи' });
    await expect(dlg).toContainText('вместе с деталями');
    await dlg.getByRole('button', { name: 'Удалить' }).click();
    await expect(titles(page)).toHaveCount(2);
    expect(await disk(page)).not.toContain('комиссию');
  });

  test('Дата: SCHEDULED or DEADLINE, today / tomorrow / this week / a day; the task stays in the Inbox', async ({ page }) => {
    await open(page);
    await rows(page).nth(3).click();
    await rows(page).nth(3).getByRole('button', { name: 'Дата' }).click();
    await page.getByRole('dialog', { name: 'Дата задачи' }).getByRole('button', { name: 'Сегодня' }).click();
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await expect.poll(() => disk(page)).toContain(`* TODO Проверить доступы подрядчика\nSCHEDULED: <${iso}`);
    await rows(page).nth(3).getByRole('button', { name: 'Дата' }).click();
    await page.getByRole('radio', { name: 'Дедлайн' }).click();
    await page.getByRole('dialog', { name: 'Дата задачи' }).getByRole('button', { name: 'Завтра' }).click();
    await expect.poll(() => disk(page)).toMatch(/SCHEDULED: <[^>]+> DEADLINE: <[^>]+>/);
    await expect(titles(page)).toHaveCount(4);
  });

  test('the context menu has every action', async ({ page }) => {
    await open(page);
    await rows(page).first().click({ button: 'right' });
    await expect(page.getByRole('menuitem')).toHaveText(['Открыть', 'Перенести…', 'Дата…', 'Готово', 'Удалить…']);
  });
});

test.describe('settings → Inbox', () => {
  test('the file, the status, :CREATED:, the order, the counter, the details; written to config.json', async ({ page }) => {
    await installTauriMock(page, FILES());
    await page.goto('/#settings');
    await page.getByRole('tab', { name: 'Inbox' }).click();
    await expect(page.getByTestId('ib-file')).toHaveText('inbox.org');
    await expect(page.getByLabel('Куда добавлять')).toHaveValue('top');
    await page.getByLabel('Куда добавлять').selectOption('end');
    await page.getByLabel('Статус новой задачи').selectOption('NEXT');
    await page.getByRole('switch', { name: 'Записывать дату создания' }).click();
    await page.getByLabel('Порядок', { exact: true }).selectOption('file');
    await page.getByRole('switch', { name: 'Счётчик на кнопке Inbox' }).click();
    await page.getByRole('switch', { name: 'Показывать детали под заголовком' }).click();
    await expect.poll(async () => (await config(page)).inbox).toEqual({ file: 'inbox.org', status: 'NEXT', created: false, add: 'end', order: 'file', counter: false, details: false });
  });

  test('«Выбрать…»: the palette of files, the chosen one shown as a path; a missing file says so', async ({ page }) => {
    await installTauriMock(page, { ...FILES(), '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'gone.org' } }) });
    await page.goto('/#settings');
    await page.getByRole('tab', { name: 'Inbox' }).click();
    await expect(page.getByTestId('ib-file')).toHaveText('gone.org — не найден');
    await page.getByRole('button', { name: 'Выбрать файл Inbox' }).click();
    await expect(page.locator('.pal')).toContainText('Файл Inbox');
    await page.keyboard.type('journ');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('ib-file')).toHaveText('Работа / journal.org');
    await expect.poll(async () => (await config(page)).inbox).toEqual({ file: 'Работа/journal.org' });
    await expect(page.locator('.pal')).toHaveCount(0);
  });

  test('«В конец файла»: the quick entry goes to the end, a blank line before it', async ({ page }) => {
    await open(page, { ...FILES(), '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'inbox.org', add: 'end', created: false } }) });
    await page.keyboard.press('Shift+Meta+i');
    await page.keyboard.type('В конец');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate((p) => (window as any).__disk[p] as string, IB)).toBe(INBOX() + '\n* TODO В конец\n');
  });

  test('the shortcut: recorded from the keys, for any program or not; a taken one says so', async ({ page }) => {
    await installTauriMock(page, FILES());
    await page.addInitScript(() => ((window as any).__shortcutTaken = 'Alt+CmdOrCtrl+KeyK'));
    await page.goto('/#settings');
    await page.getByRole('tab', { name: 'Inbox' }).click();
    const rec = page.getByRole('button', { name: 'Сочетание клавиш' });
    await expect(rec).toHaveText('⇧⌘I');
    await rec.click();
    await expect(rec).toHaveText('Нажмите сочетание…');
    await page.keyboard.press('Control+Meta+n');
    await expect(rec).toHaveText('⌃⌘N');
    expect(await log(page)).toContainEqual(['shortcut', 'Control+CmdOrCtrl+KeyN', true]);
    await page.getByRole('switch', { name: 'Работает из любой программы' }).click();
    expect(await log(page)).toContainEqual(['shortcut', 'Control+CmdOrCtrl+KeyN', false]);
    await page.getByRole('switch', { name: 'Работает из любой программы' }).click();
    await rec.click();
    await page.keyboard.press('Alt+Meta+k');
    await expect(page.locator('.err')).toContainText('сочетание уже занято другой программой');
  });
});

test.describe('the panel from another program', () => {
  test('the main window writes what the panel hands over and answers', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__emitEvent('capture-submit', { id: 7, title: 'Из другой программы', details: '' }));
    await expect.poll(() => disk(page)).toContain('* TODO Из другой программы');
    expect(await log(page)).toContainEqual(['emit', 'capture', 'capture-result', { id: 7, result: 'ok' }]);
    await page.evaluate(() => (window as any).__emitEvent('capture-here', null)); // ⇧⌘I with the window in front
    await expect(cap(page)).toBeVisible();
  });

  test('the panel (#capture): only the entry; it hands the task to the main window and says «Добавлено»', async ({ page }) => {
    await installTauriMock(page, FILES());
    await page.addInitScript(() => localStorage.setItem('capture:file', 'inbox.org'));
    await page.goto('/#capture');
    await expect(cap(page)).toContainText('inbox.org');
    await expect(page.locator('.cm-content')).toHaveCount(0);
    await page.keyboard.type('Купить билеты');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await log(page)).find((e) => e[0] === 'emit' && e[2] === 'capture-submit')).toBeTruthy();
    const sent = (await log(page)).find((e) => e[0] === 'emit' && e[2] === 'capture-submit')!;
    expect(sent[1]).toBe('main');
    expect(sent[3]).toMatchObject({ title: 'Купить билеты', details: '' });
    await page.evaluate((id) => (window as any).__emitEvent('capture-result', { id, result: 'ok' }), (sent[3] as { id: number }).id);
    await expect(page.getByRole('status')).toHaveText(/Добавлено в Inbox/);
  });
});
