import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { FILES, NOW } from './calendarFixture';

// ТЗ 24, part 1: the calendar tab — a month and a week of every dated entry, the layers and files in the navigator,
// the chosen day in the inspector, «… ещё N» with the list of the day.

async function open(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await pluginsReady(page); // the calendar is a plugin (ТЗ 29)
  await page.keyboard.press('Meta+3');
  await expect(cal(page)).toBeVisible();
}
const cal = (page: Page) => page.locator('section.pane.active .cal');
const cell = (page: Page, day: string) => cal(page).locator(`.cell[data-day="${day}"]`);
const chips = (page: Page, day: string) => cell(page, day).locator('.ch .tx');
const day = (page: Page) => page.getByRole('region', { name: 'Выбранный день' });

test('⌘3: a month of every dated entry — tasks, deadlines, events with time, the finished, repeats', async ({ page }) => {
  await open(page);
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('Календарь');
  await expect(page.locator('.toolbar .path')).toContainText('Календарь›Октябрь 2026');
  await expect(cal(page).locator('h1')).toHaveText('Октябрь 2026');
  await expect(cal(page).locator('.ttl > span')).toHaveText('Четверг, 1 – суббота, 31 октября');
  await expect(page.getByRole('tab', { name: 'Календарь', exact: true }).first()).toHaveAttribute('aria-selected', 'true'); // the navigator mode
  await expect(chips(page, '2026-10-14')).toHaveText(['Синк с CTO', '[#A] Подготовить бюджет 2027']);
  await expect(cell(page, '2026-10-14').locator('.tm')).toHaveText('11:00');
  await expect(chips(page, '2026-10-24')).toHaveText(['Дедлайн: Подготовить бюджет 2027']);
  await expect(cell(page, '2026-10-06').locator('.ch.done')).toHaveText('Ревизия целей команд');
  for (const d of ['02', '09', '16', '23', '30']) await expect(chips(page, `2026-10-${d}`).first()).toHaveText('1:1 с тимлидами'); // +1w
  await expect(cell(page, '2026-10-12').locator('.num')).toHaveClass(/today/);
  await expect(cell(page, '2026-10-02').locator('.ch')).toHaveClass(/past/);
});

test('layers and files in the navigator filter the entries and are kept', async ({ page }) => {
  await open(page);
  await expect(chips(page, '2026-10-16')).toHaveCount(3); // 5 entries: 3 lines and «… ещё 2», the WAIT one off
  await page.getByRole('checkbox', { name: 'События' }).uncheck();
  await expect(chips(page, '2026-10-14')).toHaveText(['[#A] Подготовить бюджет 2027']);
  await page.getByRole('checkbox', { name: 'Ожидания' }).check();
  await page.getByRole('checkbox', { name: 'inbox' }).uncheck();
  await expect(cell(page, '2026-10-16').locator('.ch .tx')).toHaveCount(3);
  await expect(cell(page, '2026-10-16').locator('.ch.wait')).toHaveCount(1); // the WAIT one is on
  await expect(cell(page, '2026-10-16')).not.toContainText('Продлить пропуск'); // inbox is off
  await page.reload();
  await pluginsReady(page);
  await page.keyboard.press('Meta+3');
  await expect(page.getByRole('checkbox', { name: 'События' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'inbox' })).not.toBeChecked();
});

test('«… ещё N»: the list of the day by the pointer; a click chooses, a double click opens the file in a new tab, ⌘-click in the neighbour pane', async ({ page }) => {
  await open(page);
  const more = cell(page, '2026-10-16').locator('.more');
  await expect(more).toHaveText('… ещё 2');
  await more.hover();
  const list = page.getByRole('dialog', { name: 'Записи на день' });
  await expect(list).toBeVisible(); // after 300 ms
  await expect(list.locator('.dh')).toHaveText(/Пт, 16 октября\s*5 записей/);
  await expect(list.locator('.k')).toHaveText(['15:00', 'СРОК', 'TODO', 'TODO', 'NEXT']);
  await expect(list.locator('.w').nth(3)).toHaveText('work › Q4 2026');
  await list.getByRole('option', { name: /Согласовать с финансами/ }).click(); // a click chooses (ТЗ 34)
  await expect(list.getByRole('option', { name: /Согласовать с финансами/ })).toHaveClass(/picked/);
  await expect(list.locator('.foot')).toHaveText('Клик — выбрать · двойной клик или ↩ — открыть · ⌘-клик — в соседней панели');
  await list.getByRole('option', { name: /Согласовать с финансами/ }).dblclick();
  await expect(list).toHaveCount(0);
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('work');
  await expect(page.locator('section.pane.active .status')).toContainText('Стр. 6');
  await expect(page.locator('section.pane.active .tab .lbl')).toContainText(['Календарь']); // the calendar stays
  await page.locator('section.pane.active .tab', { hasText: 'Календарь' }).click();
  await cell(page, '2026-10-16').locator('.more').click(); // a click opens it at once
  await list.getByRole('option', { name: /Отчёт за Q3/ }).click({ modifiers: ['Meta'] });
  await expect(page.locator('section.pane')).toHaveCount(2);
  await expect(page.locator('section.pane').nth(0).locator('.tab.on .lbl')).toHaveText('finance');
});

test('the keyboard: arrows choose a day, ⌥→ the next month, «.» today, ⌘↓ the week, ↩ opens the first entry', async ({ page }) => {
  await open(page);
  await cell(page, '2026-10-12').locator('.num').click();
  await expect(day(page).locator('.dt')).toHaveText('Понедельник, 12 октября');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, '2026-10-14')).toHaveClass(/sel/);
  await expect(day(page).locator('.dt')).toHaveText('Среда, 14 октября');
  await expect(day(page).locator('.rel')).toHaveText('через 2 дня');
  await expect(day(page).locator('.card .t')).toHaveText(['Синк с CTO', '[#A] Подготовить бюджет 2027']);
  await expect(day(page).locator('.ah')).toHaveText([/Подготовить презентацию для CTO\s*16 октября, пятница/, /Подготовить бюджет 2027\s*24 октября, суббота/]);
  await page.keyboard.press('Alt+ArrowRight');
  await expect(cal(page).locator('h1')).toHaveText('Ноябрь 2026');
  await page.keyboard.press('.');
  await expect(cal(page).locator('h1')).toHaveText('Октябрь 2026');
  await page.keyboard.press('Meta+ArrowDown');
  await expect(cal(page).locator('h1')).toHaveText('Неделя 42');
  await expect(cal(page).locator('.ttl > span')).toHaveText('12 – 18 октября 2026');
  await page.keyboard.press('Enter'); // the first entry of 12 Oct: «Планёрка» at 10:00
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('journal');
});

test('the week: the whole-day row and the events over the hours by their length; the view and the day survive a restart', async ({ page }) => {
  await open(page);
  await cal(page).getByRole('tab', { name: 'Неделя' }).click();
  const col = (i: number) => cal(page).locator('.dcol').nth(i);
  await expect(col(0).locator('.evb b')).toHaveText('10:00 – 11:00');
  await expect(col(2).locator('.evb b')).toHaveText('11:00 – 12:00');
  const h = (await col(0).locator('.evb').boundingBox())!.height;
  expect(Math.round(h)).toBe(46);
  await expect(cal(page).locator('.allday').nth(0).locator('.tx')).toHaveText(['Свести расходы по направлениям']);
  await expect(cal(page).locator('.allday').nth(4).locator('.more')).toHaveText('… ещё 2');
  await expect(col(0).locator('.nowline')).toHaveCount(1);
  await page.reload();
  await expect(cal(page).locator('h1')).toHaveText('Неделя 42');
});

test('the toolbar button opens the calendar in the second pane', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await pluginsReady(page); // the button is the calendar plugin's: it works once the plugin has started
  const btn = page.locator('.toolbar').getByRole('button', { name: 'Календарь', exact: true });
  await btn.click();
  await expect(page.locator('section.pane')).toHaveCount(2);
  await expect(page.locator('section.pane').nth(1).locator('.cal h1')).toHaveText('Октябрь 2026');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await btn.click();
  await expect(page.locator('section.pane')).toHaveCount(1);
});
