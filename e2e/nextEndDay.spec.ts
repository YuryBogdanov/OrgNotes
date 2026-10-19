import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { diskFile as disk } from './helpers';
import { DAY, FILES, iso, NOW } from './todayFixture';

// ТЗ 45.2 (§2.5): «Завершить день» in the new interface — the new sheet of 640 pt (not the old one), the parts one
// under another, «Не успел» with its three choices (the chosen on `lampsoft`), «Главное на завтра» numbered with «+
// выбрать задачу…», the note in Cormorant; ⌘↩ writes the day into the journal as the old sheet did, ⎋ leaves.

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Завершить день' });
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const dayHead = `*** ${iso(DAY)} ${WD[DAY.getDay()]}`;

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await installTauriMock(page, FILES(), { today: true });
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Сегодня', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить день…' }).click();
  await expect(sheet(page)).toBeVisible();
}

test('the new sheet: 640 pt, done, left with its three choices, the morning\'s choice numbered, where it writes; ⎋', async ({ page }) => {
  await open(page);
  const s = sheet(page);
  expect(await s.evaluate((e) => !e.closest('.compat'))).toBe(true);
  expect(Math.round((await s.boundingBox())!.width)).toBe(640);
  await expect(s.getByRole('region', { name: 'Сделано сегодня' }).locator('.dchip')).toContainText(['Ответил по оферу SRE']);
  const left = s.getByRole('region', { name: 'Не успел' });
  await expect(left).toContainText('Подготовить слайды к QBR');
  await expect(left.getByRole('radio', { name: 'Оставить' })).toBeChecked();
  await left.getByRole('radio', { name: /На завтра|На понедельник/ }).click();
  await expect(left.getByRole('radio', { name: /На завтра|На понедельник/ })).toHaveClass(/on/);
  const focus = s.getByRole('region', { name: 'Главное на завтра' });
  await expect(focus.getByRole('listitem')).toHaveCount(2);
  await expect(focus.locator('.n')).toHaveText(['1', '2', '3']);
  await expect(focus.getByRole('textbox', { name: 'Найти задачу' })).toHaveAttribute('placeholder', '+ выбрать задачу…');
  expect(await s.getByRole('textbox', { name: 'Заметка на завтра' }).evaluate((e) => getComputedStyle(e).fontFamily)).toContain('IBM Plex Mono');
  await expect(s).toContainText(`Запишется в journal › ${iso(DAY)} ${WD[DAY.getDay()]}`);
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  expect(await disk(page, '/mock/journal.org')).not.toContain(dayHead);
});

test('⌘↩ writes the day: the third task found, the note with its list; one ⌘Z takes it all back', async ({ page }) => {
  await open(page);
  const before = await disk(page, '/mock/journal.org');
  const s = sheet(page);
  await s.getByRole('textbox', { name: 'Найти задачу' }).fill('слайды');
  await expect(s.getByRole('listbox', { name: 'Задачи' }).getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(s.getByRole('region', { name: 'Главное на завтра' }).getByRole('listitem')).toHaveCount(3);
  await expect(s.getByRole('textbox', { name: 'Найти задачу' })).toHaveCount(0); // three chosen
  const note = s.getByRole('textbox', { name: 'Заметка на завтра' });
  await note.click();
  await page.keyboard.press('End');
  await page.keyboard.type('Дожать Аню');
  await page.keyboard.press('Enter'); // the list goes on
  await page.keyboard.type('Ответ типографии');
  await page.keyboard.press('Meta+Enter');
  await expect(sheet(page)).toHaveCount(0);
  const j = (await disk(page, '/mock/journal.org'))!;
  expect(j).toContain(`${dayHead}\n**** На завтра\n`);
  expect(j).toContain(':END:\n- Дожать Аню\n- Ответ типографии\n**** Главное\n- [[id:a1][Бюджет на нагрузочное]]\n- [[id:a2][Вопросы к ревью биллинга]]\n- [[id:');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page, '/mock/journal.org')).toBe(before);
});
