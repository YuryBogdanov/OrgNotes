import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';

// ТЗ «Выбор даты в календаре (палитра, ⇧ + стрелки)».
const W = '/mock/work.org';
const p2 = (n: number) => String(n).padStart(2, '0');
const RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const day = (n: number, from = new Date()) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const stamp = (d: Date) => `${iso(d)} ${RU[d.getDay()]}`;
const S = day(3); // the task's current SCHEDULED
const WORK = () => `* Q4\n** TODO Подготовить бюджет\nSCHEDULED: <${stamp(S)} 10:00 +1w>\n** TODO Без даты\n** NEXT Ещё одна\nDEADLINE: <${stamp(day(5))}>\n`;
const disk = (page: Page) => page.evaluate((p) => (window as any).__disk[p] as string, W);
const pal = (page: Page) => page.getByRole('dialog', { name: 'Командная палитра' });
const cal = (page: Page) => pal(page).locator('.cal');
const selDay = (page: Page) => cal(page).locator('.day.sel');

async function open(page: Page, heading = 'Подготовить бюджет', rich = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (rich) await page.addInitScript(() => localStorage.setItem('editor:rich', '1'));
  await installTauriMock(page, { [W]: WORK(), '/mock/inbox.org': '* TODO Задача\n', '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'inbox.org' } }) });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.locator('.nav .row[data-key="/mock/work.org"]').click();
  if (!rich) await page.locator('section.pane .cm-line', { hasText: heading }).click();
}
async function schedule(page: Page) {
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('заплан');
  await page.keyboard.press('Enter');
}

test('the step of choices: the label, «Выбрать дату…» with its hint and key, the keys at the bottom; ↩ on it opens the calendar', async ({ page }) => {
  await open(page);
  await schedule(page);
  await expect(pal(page).locator('.tok')).toHaveText('Запланировать');
  const row = pal(page).locator('.row', { hasText: 'Выбрать дату…' });
  await expect(row.locator('.hint')).toHaveText('календарь на 3 месяца');
  await expect(row.locator('.key')).toHaveText('⇧ + стрелки');
  expect(await pal(page).locator('.row .t').allInnerTexts()).toEqual(['Сегодня', 'Завтра', 'Через неделю', 'Выбрать дату…', 'Убрать дату']);
  await expect(pal(page).locator('.foot')).toHaveText(/↑ ↓выбрать.*⇧ \+ стрелкикалендарь.*↩выполнить.*⎋закрыть/);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(cal(page)).toBeVisible();
  await expect(pal(page)).toHaveClass(/wide/);
  await expect(cal(page).getByRole('grid')).toHaveCount(3);
  await expect(selDay(page).locator('.n')).toHaveText(String(S.getDate())); // the task's date first
  await expect(cal(page).locator('.res .rel')).toContainText('через 3 дня');
  await expect(cal(page).locator('.res .raw')).toHaveText(`Вставится: SCHEDULED: <${stamp(S)} 10:00 +1w>`);
  await expect(cal(page).locator('.legend')).toHaveText(/сегодня.*текущая дата задачи.*есть записи.*дедлайн/);
});

test('⇧ + arrow on the step of choices opens the calendar moved; ⇧/⌥⇧ arrows a day, a week, a month, a year; «.» today; ↩ writes, time and repeat kept', async ({ page }) => {
  await open(page);
  await schedule(page);
  await page.keyboard.press('Shift+ArrowRight'); // from the task's date: a day on
  await expect(selDay(page)).toHaveAttribute('aria-label', /.+/);
  await expect(cal(page).locator('.res .raw')).toContainText(stamp(day(1, S)));
  await page.keyboard.press('Shift+ArrowDown');
  await expect(cal(page).locator('.res .raw')).toContainText(stamp(day(8, S)));
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowUp');
  await expect(cal(page).locator('.res .raw')).toContainText(stamp(S));
  await page.keyboard.press('Alt+Shift+ArrowRight'); // a month
  const m = new Date(S.getFullYear(), S.getMonth() + 1, 1);
  await expect(cal(page).locator('.mn.mid')).toContainText(String(m.getFullYear()));
  const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  await expect(cal(page).locator('.mn.mid')).toHaveText(`${months[m.getMonth()]} ${m.getFullYear()}`); // the three months moved
  await page.keyboard.press('Alt+Shift+ArrowDown'); // a year
  await expect(cal(page).locator('.mn.mid')).toContainText(String(m.getFullYear() + 1));
  await page.keyboard.press('.');
  await expect(cal(page).locator('.res .rel')).toContainText('сегодня');
  await expect(pal(page).getByRole('combobox')).toHaveValue('');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Enter');
  await expect(pal(page)).toHaveCount(0);
  await expect.poll(() => disk(page)).toContain(`SCHEDULED: <${stamp(day(1))} 10:00 +1w>`);
});

test('typing moves the choice to the date read; nonsense says so; ⇧ + arrows go on from it and clear the text; ⌫ back, ⎋ changes nothing', async ({ page }) => {
  await open(page, 'Без даты');
  await schedule(page);
  await page.keyboard.press('Shift+ArrowRight');
  await expect(cal(page).locator('.res .rel')).toHaveText('завтра'); // no date yet: from today
  await page.keyboard.type('+10');
  await expect(cal(page).locator('.res .raw')).toContainText(stamp(day(10)));
  await page.keyboard.press('Shift+ArrowRight');
  await expect(pal(page).getByRole('combobox')).toHaveValue('');
  await expect(cal(page).locator('.res .raw')).toContainText(stamp(day(11)));
  await page.keyboard.type('чепуха');
  await expect(cal(page).locator('.res .rel')).toHaveText('Не похоже на дату');
  await expect(cal(page).locator('.res .raw')).toContainText(stamp(day(11))); // the choice stays
  await pal(page).getByRole('combobox').fill('');
  await page.keyboard.press('Backspace');
  await expect(pal(page).locator('.row .t').first()).toHaveText('Сегодня');
  await page.keyboard.press('Escape');
  expect(await disk(page)).toBe(WORK());
});

test('the marks: today, the task’s date dashed, weekends, dots for days with tasks (a deadline red); the mouse picks', async ({ page }) => {
  await open(page);
  await schedule(page);
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(cal(page).locator('.day.today')).toHaveCount(1);
  await expect(cal(page).locator('.day.cur')).toHaveAttribute('aria-label', new RegExp(`${S.getDate()} `));
  await expect(cal(page).locator('.day.we').first()).toBeVisible();
  await expect(cal(page).locator('.dot.dl')).toHaveCount(1); // the other task's deadline
  await expect(cal(page).locator('.dot.busy')).toHaveCount(2);
  const target = cal(page).locator('.month').nth(1).locator('.day:not(.empty)').nth(19);
  await target.click();
  await expect(target).toHaveClass(/sel/);
  await target.dblclick();
  await expect(pal(page)).toHaveCount(0);
  await expect.poll(() => disk(page)).toMatch(new RegExp(`SCHEDULED: <\\d{4}-\\d{2}-20 \\S+ 10:00 \\+1w>`));
});

test('«Поставить дедлайн…»: the same calendar, DEADLINE', async ({ page }) => {
  await open(page, 'Без даты');
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('дедлайн');
  await page.keyboard.press('Enter');
  await expect(pal(page).locator('.tok')).toHaveText('Дедлайн');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(cal(page).locator('.res .raw')).toHaveText(`Вставится: DEADLINE: <${stamp(day(7))}>`);
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page)).toContain(`** TODO Без даты\nDEADLINE: <${stamp(day(7))}>`);
});

test('the same calendar from a date chip of «Оформленный текст»: its kind and date', async ({ page }) => {
  await open(page, '', true);
  await page.locator('.cm-r-chip.sched').click();
  await expect(cal(page)).toBeVisible();
  await expect(cal(page).locator('.res .raw')).toContainText(`SCHEDULED: <${stamp(S)} 10:00 +1w>`);
  await expect(pal(page).locator('.foot')).not.toContainText('к вариантам');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page)).toContain(`SCHEDULED: <${stamp(day(1, S))} 10:00 +1w>`);
});

test('the same calendar from «Отложить» of the Inbox review', async ({ page }) => {
  await open(page);
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Inbox' }).click();
  await page.locator('.inbox').getByRole('button', { name: 'Разобрать' }).click();
  await page.keyboard.press('Meta+4');
  await page.getByRole('dialog', { name: 'Отложить до' }).locator('.opt', { hasText: 'Выбрать дату…' }).click();
  await expect(cal(page)).toBeVisible();
  await expect(pal(page).locator('.tok')).toHaveText('Запланировать');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as any).__disk['/mock/inbox.org'])).toContain(`* TODO Задача\nSCHEDULED: <${iso(day(8))}`);
  await expect(page.locator('.inbox .rrow').first().locator('.sub')).toContainText('Отложена до');
});
