import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { FILES, NOW, WORK } from './calendarFixture';

// ТЗ 24, part 2: moving an entry by the mouse, «+ Задача» / «+ Событие», «Настройки → Календарь».

const CFG = '/mock/.orgnotes/config.json';
async function open(page: Page, files: Record<string, string> = FILES(), cfg: object = { version: 1, inbox: { file: 'inbox.org' } }) {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { ...files, [CFG]: JSON.stringify(cfg) });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.keyboard.press('Meta+3');
  await expect(cal(page)).toBeVisible();
}
const cal = (page: Page) => page.locator('section.pane.active .cal');
const cell = (page: Page, day: string) => cal(page).locator(`.cell[data-day="${day}"]`);
const disk = (page: Page, p = WORK) => page.evaluate((p) => (window as any).__disk[p] as string, p);
/** The calendar's settings: the folder's file and this Mac's (roadmap 0.6). */
const calFolder = (page: Page) => page.evaluate(() => JSON.parse((window as any).__disk['/mock/.orgnotes/plugins/calendar.json'] ?? 'null'));
const calLocal = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('feature:calendar') ?? 'null'));
const config = (page: Page) => page.evaluate((p) => JSON.parse((window as any).__disk[p] ?? 'null'), CFG);

/** Playwright cannot start a native drag in WebKit: the HTML5 drag events are dispatched directly. */
const drag = (page: Page, from: string, to: string, y?: number) =>
  page.evaluate(
    ([a, b, y]) => {
      const src = document.querySelector(a as string) as HTMLElement;
      const dst = document.querySelector(b as string) as HTMLElement;
      const r = dst.getBoundingClientRect();
      const at = { clientX: r.left + 10, clientY: y === null ? r.top + 10 : r.top + (y as number) };
      const dt = new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt, clientY: src.getBoundingClientRect().top }));
      dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
      dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
      src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    },
    [from, to, y ?? null] as const,
  );
const chipSel = (day: string, text: string) => `section.pane.active .cal .cell[data-day="${day}"] .ch[title^="${text}"]`;

test('a task chip onto another day: SCHEDULED moves, the deadline stays; ⌘Z takes it back', async ({ page }) => {
  await open(page);
  await drag(page, chipSel('2026-10-14', '[#A] Подготовить'), 'section.pane.active .cal .cell[data-day="2026-10-20"]');
  await expect.poll(() => disk(page)).toContain('SCHEDULED: <2026-10-20 Вт> DEADLINE: <2026-10-24 Сб>');
  await expect(cell(page, '2026-10-20')).toContainText('Подготовить бюджет 2027');
  await expect(cell(page, '2026-10-14')).not.toContainText('Подготовить бюджет 2027');
  await expect(page.locator('.toast')).toContainText('Дата изменена');
  await cal(page).focus();
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page)).toContain('SCHEDULED: <2026-10-14 Ср> DEADLINE: <2026-10-24 Сб>');
});

test('a deadline chip changes DEADLINE; with «Не менять дедлайн» off a task takes its deadline along', async ({ page }) => {
  await open(page, FILES(), { version: 1, inbox: { file: 'inbox.org' }, calendar: { keepDeadline: false } });
  await drag(page, chipSel('2026-10-24', 'Дедлайн: Подготовить'), 'section.pane.active .cal .cell[data-day="2026-10-28"]');
  await expect.poll(() => disk(page)).toContain('SCHEDULED: <2026-10-14 Ср> DEADLINE: <2026-10-28 Ср>');
  await drag(page, chipSel('2026-10-14', '[#A] Подготовить'), 'section.pane.active .cal .cell[data-day="2026-10-15"]');
  await expect.poll(() => disk(page)).toContain('SCHEDULED: <2026-10-15 Чт> DEADLINE: <2026-10-29 Чт>');
});

test('«Без даты» onto a day sets SCHEDULED; an event onto a time in the week keeps its length', async ({ page }) => {
  await open(page);
  const ud = page.locator('.calnav .ud', { hasText: 'План найма на Q4' });
  await expect(ud).toBeVisible();
  await expect(page.locator('.calnav')).toContainText('Перетащите задачу на нужный день');
  await drag(page, '.calnav .ud[title^="План найма"]', 'section.pane.active .cal .cell[data-day="2026-10-21"]');
  await expect.poll(() => disk(page)).toContain('** TODO План найма на Q4\nSCHEDULED: <2026-10-21 Ср>');
  await expect(ud).toHaveCount(0);

  await cal(page).getByRole('tab', { name: 'Неделя' }).click();
  // 10:00-11:00 of Monday onto Tuesday at 15:00 (7 hours below 8:00, 48 px an hour)
  await drag(page, 'section.pane.active .cal .dcol[data-day="2026-10-12"] .evb', 'section.pane.active .cal .dcol[data-day="2026-10-13"]', 7 * 48 + 2);
  await expect.poll(() => disk(page, '/mock/journal.org')).toContain('** Планёрка с тимлидами\n<2026-10-13 Вт 15:00-16:00>');
});

test('a repeating entry asks first: the whole series moves', async ({ page }) => {
  await open(page);
  await drag(page, chipSel('2026-10-16', '1:1 с тимлидами'), 'section.pane.active .cal .cell[data-day="2026-10-15"]');
  const dlg = page.getByRole('alertdialog', { name: 'Повторяющаяся запись' });
  await expect(dlg).toContainText('Перенесётся вся серия');
  await dlg.getByRole('button', { name: 'Отмена' }).click();
  expect(await disk(page, '/mock/journal.org')).toContain('<2026-10-02 Пт 15:00 +1w>');
  await drag(page, chipSel('2026-10-16', '1:1 с тимлидами'), 'section.pane.active .cal .cell[data-day="2026-10-15"]');
  await dlg.getByRole('button', { name: 'Перенести серию' }).click();
  await expect.poll(() => disk(page, '/mock/journal.org')).toContain('<2026-10-15 Чт 15:00 +1w>');
  await expect(cell(page, '2026-10-22')).toContainText('1:1 с тимлидами');
});

test('«+ Задача» in the inspector writes into the Inbox by default; double click and N open it on the day', async ({ page }) => {
  await open(page);
  const day = page.getByRole('region', { name: 'Выбранный день' });
  await expect(day).toContainText('Создаётся в inbox');
  await cell(page, '2026-10-20').locator('.num').click();
  await day.getByRole('button', { name: '+ Задача' }).click();
  const sheet = page.getByRole('dialog', { name: 'Новая задача' });
  await expect(sheet).toContainText('Вт, 20 октября');
  await expect(sheet).toContainText('Создаётся в inbox');
  await page.keyboard.type('Купить подарок');
  await page.keyboard.press('Enter');
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => disk(page, '/mock/inbox.org')).toMatch(/^\* TODO Купить подарок\nSCHEDULED: <2026-10-20 Вт>\n\n\* TODO Подготовить/);
  await expect(cell(page, '2026-10-20')).toContainText('Купить подарок');

  await cell(page, '2026-10-22').dblclick({ position: { x: 60, y: 80 } });
  await expect(page.getByRole('dialog', { name: 'Новая задача' })).toContainText('Чт, 22 октября');
  await page.keyboard.press('Escape');
  await cal(page).focus();
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog', { name: 'Новая задача' })).toContainText('Чт, 22 октября');
});

test('«+ Событие» goes to the file and heading set, with the status and length set; the heading is made', async ({ page }) => {
  const wf = { ...FILES(), '/mock/journal.org': '#+TODO: MEETING | FINISHED\n' + FILES()['/mock/journal.org'] };
  await open(page, wf, { version: 1, inbox: { file: 'inbox.org' }, calendar: { eventFile: 'journal.org', eventHeading: 'Новые встречи', minutes: 90 } });
  await page.getByRole('region', { name: 'Выбранный день' }).getByRole('button', { name: '+ Событие' }).click();
  const sheet = page.getByRole('dialog', { name: 'Новое событие' });
  await expect(sheet).toContainText('Создаётся в journal › Новые встречи');
  await page.keyboard.type('Ретро');
  await sheet.getByLabel('Время').fill('16:00');
  await sheet.getByRole('button', { name: 'Создать' }).click();
  await expect.poll(() => disk(page, '/mock/journal.org')).toContain('\n* Новые встречи\n** MEETING Ретро\n<2026-10-12 Пн 16:00-17:30>\n');
  await expect(page.locator('.toast')).toContainText('Событие добавлено');
});

test('«Спрашивать»: the file is chosen in the sheet, and remembered for «Как в прошлый раз»', async ({ page }) => {
  await open(page, FILES(), { version: 1, inbox: { file: 'inbox.org' }, calendar: { pick: 'last' } });
  await page.getByRole('region', { name: 'Выбранный день' }).getByRole('button', { name: '+ Задача' }).click();
  const sheet = page.getByRole('dialog', { name: 'Новая задача' });
  await expect(sheet.getByLabel('Файл')).toHaveValue('inbox.org');
  await sheet.getByLabel('Файл').selectOption('finance.org');
  await sheet.getByLabel('Заголовок').fill('Сдать отчёт');
  await sheet.getByLabel('Заголовок').press('Enter');
  await expect.poll(() => disk(page, '/mock/finance.org')).toContain('\n* TODO Сдать отчёт\nSCHEDULED: <2026-10-12 Пн>\n');
  await expect.poll(async () => (await calFolder(page))?.last).toEqual({ task: 'finance.org', event: null });
  await page.getByRole('region', { name: 'Выбранный день' }).getByRole('button', { name: '+ Задача' }).click();
  await expect(page.getByRole('dialog', { name: 'Новая задача' }).getByLabel('Файл')).toHaveValue('finance.org');
});

test('«Настройки → Календарь»: what new entries go to in the folder\'s file, the look on this Mac; the view, hours, week numbers, weekends, «Без даты» follow', async ({ page }) => {
  await open(page);
  await expect(cal(page).locator('.row .wk').first()).toHaveText('40');
  await page.keyboard.press('Meta+,');
  await page.getByRole('tab', { name: 'Календарь' }).last().click();
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await expect(s.getByTestId('cal-taskFile')).toHaveText('Inbox — inbox.org');
  await s.getByRole('radio', { name: 'Неделя' }).click();
  await s.getByLabel('С', { exact: true }).selectOption('9');
  await s.getByRole('switch', { name: 'Номера недель' }).click();
  await s.getByRole('switch', { name: 'Показывать выходные' }).click();
  await s.getByRole('switch', { name: 'Блок «Без даты» в боковой панели' }).click();
  await s.getByLabel('Заголовок для задач').fill('* Календарь');
  await s.getByLabel('Заголовок для задач').press('Tab');
  await s.getByRole('button', { name: 'Выбрать файл для событий' }).click();
  await page.getByRole('dialog', { name: 'Файл для событий' }).getByPlaceholder('Найти файл').fill('journal');
  await page.keyboard.press('Enter');
  await expect(s.getByTestId('cal-eventFile')).toHaveText('journal.org');
  await expect.poll(async () => calFolder(page)).toEqual({ taskHeading: 'Календарь', eventFile: 'journal.org' });
  expect(await calLocal(page)).toEqual({ view: 'week', from: 9, weekNumbers: false, weekends: false, undated: false });
  expect((await config(page)).calendar).toBeUndefined(); // moved out of config.json
  await s.getByRole('button', { name: 'Готово' }).click();
  await expect(cal(page).locator('.row .wk')).toHaveCount(0);
  await expect(cal(page).locator('.wd span')).toHaveText(['Пн', 'Вт', 'Ср', 'Чт', 'Пт']);
  await expect(page.locator('.calnav')).not.toContainText('БЕЗ ДАТЫ');
  await cal(page).getByRole('tab', { name: 'Неделя' }).click();
  await expect(cal(page).locator('.hcol span').first()).toHaveText('9:00');
  await expect(cal(page).locator('.dcol')).toHaveCount(5);
});
