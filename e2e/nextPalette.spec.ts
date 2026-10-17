import { expect, test, type Page } from '@playwright/test';
import { diskAll as disk, openApp, palette as pal } from './helpers';

// ТЗ 44.2 (§2): the palette of the new interface — its own look over the old one's workings (ТЗ 09, 20): 640 pt, the
// plate on `chip` with the status capsule, the field with «esc», rows of 40 pt, the chosen on `lamp`, the foot with the
// prefixes; the status step; the date step — its label, 800 pt, the day in words in the field, the months, the chips,
// «Убрать дату»; «#» — the headings; ⌫ back from the calendar.

const WORK = '#+TITLE: Работа\n\n* Q4 2026\n** TODO [#A] Подготовить бюджет 2027 :budget:\nSCHEDULED: <2026-10-14 Ср>\nСвести заявки.\n** NEXT План найма\n';
const NOW = new Date(2026, 9, 16, 11);
const field = (page: Page) => pal(page).getByRole('combobox');
const rows = (page: Page) => pal(page).locator('.row');
const at = (page: Page, text: string) => page.locator('.cm-line', { hasText: text }).first().click();

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' }); // measured without the 120 ms slide
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/work.org': WORK, '/mock/journal.org': '* Октябрь\n' }, ready: false, now: NOW, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'work' }).click();
  await expect(page.locator('.cm-content')).toContainText('Q4 2026');
}

test('its look: not the bridge; 640 pt, 84 from the top; the plate with the capsule; rows of 40 pt, the chosen on `lamp`; the foot', async ({ page }) => {
  await open(page);
  await at(page, 'Подготовить бюджет');
  await page.keyboard.press('Shift+Meta+p');
  await expect(pal(page)).toBeVisible();
  expect(await pal(page).evaluate((e) => !e.closest('.compat'))).toBe(true);
  const box = (await pal(page).boundingBox())!;
  expect(Math.round(box.width)).toBe(640);
  expect(Math.round(box.y)).toBe(84);
  const plate = pal(page).locator('.plate');
  await expect(plate).toContainText('Действия применятся к заголовку');
  await expect(plate.locator('.kw')).toHaveText('TODO');
  await expect(plate).toContainText('work · строка 4');
  expect(Math.round((await rows(page).first().boundingBox())!.height)).toBe(40);
  expect(await pal(page).locator('.row.on').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(227, 170, 60)');
  await expect(pal(page).locator('.foot')).toContainText('⌘↩ в новой вкладке');
  await expect(pal(page).locator('.foot')).toContainText('# заголовки');
  await expect(pal(page).locator('.esc')).toHaveText('esc');
  await page.keyboard.press('Escape');
  await expect(pal(page)).toHaveCount(0);
});

test('«Сменить статус…»: the step in the same window, «сейчас» at the current; picked — written', async ({ page }) => {
  await open(page);
  await at(page, 'Подготовить бюджет');
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('статус');
  await page.keyboard.press('Enter');
  await expect(field(page)).toHaveAttribute('placeholder', 'Статус');
  await expect(rows(page).filter({ hasText: 'TODO' }).locator('.hint')).toHaveText('сейчас');
  await page.keyboard.type('don');
  await page.keyboard.press('Enter');
  await expect(pal(page)).toHaveCount(0);
  await expect(page.locator('.cm-line', { hasText: 'Подготовить бюджет' })).toContainText('DONE');
});

test('«Запланировать…» → «Выбрать дату…»: the label, 800 pt, the day in words; ⇧→ a day; ↩ writes; «Убрать дату»', async ({ page }) => {
  await open(page);
  await at(page, 'Подготовить бюджет');
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('заплан');
  await page.keyboard.press('Enter');
  await expect(pal(page).locator('.tok')).toContainText('Запланировать');
  await page.keyboard.press('Shift+ArrowRight'); // the calendar from the current date, a day on
  await expect(pal(page).locator('.months')).toBeVisible();
  expect(Math.round((await pal(page).boundingBox())!.width)).toBe(800);
  await expect(pal(page).locator('.field .day')).toHaveText('четверг, 15 октября · вчера');
  await expect(pal(page).locator('.day.today')).toHaveText('16');
  await expect(pal(page).locator('.chip')).toHaveText(['Сегодня', 'Завтра', 'Пн, 19', 'Через неделю', 'Убрать дату']);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(pal(page).locator('.field .day')).toHaveText('суббота, 17 октября · завтра');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await disk(page))['/mock/work.org']).toContain('SCHEDULED: <2026-10-17 Сб>');
  // ⌫ on an empty field — back to the choices; then the calendar's «Убрать дату»
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('заплан');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Backspace');
  await expect(rows(page).first().locator('.t')).toHaveText('Сегодня');
  await page.keyboard.press('Shift+ArrowRight');
  await pal(page).getByRole('button', { name: 'Убрать дату' }).click();
  await expect(pal(page)).toHaveCount(0);
  await expect.poll(async () => (await disk(page))['/mock/work.org']).not.toContain('SCHEDULED:');
});

test('«#»: the headings of the file, indented; ↩ goes there', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('#найм');
  await expect(rows(page).first().locator('.t')).toHaveText('План найма');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-activeLine')).toContainText('План найма');
});
