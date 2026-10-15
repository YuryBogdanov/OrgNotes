import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { diskFile as disk } from './helpers';
import { DAY, FILES, iso, stamp, NOW } from './todayFixture';

// ТЗ 32 (part B): «Завершить день» — done, left, the three for tomorrow, a note; all written into the journal's
// datetree at once (one ⌘Z), tasks get an :ID:, a second time replaces; [[id:…]] links open from the editor.

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Завершить день' });
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const next = (() => {
  const d = new Date(DAY.getFullYear(), DAY.getMonth(), DAY.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
})();
const dayHead = `*** ${iso(DAY)} ${WD[DAY.getDay()]}`;

async function open(page: Page, files: Record<string, string> = FILES(), rich = false) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installTauriMock(page, files, { today: true });
  if (rich) await page.addInitScript(() => localStorage.setItem('editor:rich', '1'));
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Сегодня', exact: true })).toBeVisible();
}
async function endDay(page: Page) {
  await page.getByRole('button', { name: 'Завершить день…' }).click();
  await expect(sheet(page)).toBeVisible();
}

test('the sheet: done by CLOSED, left with its three choices, the morning\'s choice still open, where it writes', async ({ page }) => {
  await open(page);
  await endDay(page);
  const s = sheet(page);
  await expect(s.getByRole('region', { name: 'Сделано сегодня' })).toContainText('Ответил по оферу SRE');
  await expect(s.getByRole('region', { name: 'Сделано сегодня' })).toContainText('· 2');
  const left = s.getByRole('region', { name: 'Не успел' });
  await expect(left).toContainText('Подготовить слайды к QBR');
  await expect(left.getByRole('radio', { name: 'Оставить' })).toBeChecked();
  const focus = s.getByRole('region', { name: 'Главное на завтра' });
  await expect(focus.getByRole('listitem')).toHaveCount(2);
  await expect(focus).toContainText('2 из 3');
  await expect(s).toContainText(`journal.org › ${iso(DAY)} ${WD[DAY.getDay()]}`);
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  expect(await disk(page, '/mock/journal.org')).not.toContain(dayHead);
});

test('⌘↩ writes the day into the journal, moves what was left, gives the tasks an :ID:; one ⌘Z takes it all back', async ({ page }) => {
  await open(page);
  const before = { journal: await disk(page, '/mock/journal.org'), work: await disk(page, '/mock/work.org') };
  await endDay(page);
  const s = sheet(page);
  await s.getByRole('radio', { name: /На завтра|На понедельник/ }).click();
  await s.getByRole('textbox', { name: 'Найти задачу' }).fill('слайды');
  await page.keyboard.press('Enter');
  await expect(s.getByRole('textbox', { name: 'Найти задачу' })).toBeDisabled(); // three chosen
  await s.locator('.cm-content').click();
  await page.keyboard.press('End');
  await page.keyboard.type('Дожать Аню');
  await page.keyboard.press('Meta+Enter');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByText('День завершён. До завтра')).toBeVisible();

  const j = (await disk(page, '/mock/journal.org'))!;
  // :CREATED: is the moment it was written: the page's clock (NOW), not the test's — between 0:00 and 4:00 those
  // are two different dates
  expect(j).toContain(`${dayHead}\n**** На завтра\n:PROPERTIES:\n:CREATED:  [${iso(NOW)}`);
  expect(j).toContain(':END:\n- Дожать Аню\n**** Главное\n- [[id:a1][Бюджет на нагрузочное]]\n- [[id:a2][Вопросы к ревью биллинга]]\n- [[id:');
  expect(j).toMatch(/\*\*\*\* Сделано\n- \[\[id:[0-9a-f-]{36}\]\[Ответил по оферу SRE\]\]\n- \[\[id:[0-9a-f-]{36}\]\[Ревью RFC логирования\]\]/);
  const w = (await disk(page, '/mock/work.org'))!;
  expect(w).toMatch(/\* TODO Подготовить слайды к QBR\nSCHEDULED: <[^>]+>\n:PROPERTIES:\n:ID: +[0-9a-f-]{36}\n:END:/);
  expect(w).toContain(`SCHEDULED: <${iso(next)}`);
  expect(w).toMatch(/\* DONE Ответил по оферу SRE\nCLOSED: \[[^\]]+\]\n:PROPERTIES:\n:ID: +[0-9a-f-]{36}/);
  const slidesId = /Подготовить слайды к QBR\nSCHEDULED: <[^>]+>\n:PROPERTIES:\n:ID: +([0-9a-f-]{36})/.exec(w)![1];
  expect(j).toContain(`- [[id:${slidesId}][Подготовить слайды к QBR]]`);

  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page, '/mock/journal.org')).toBe(before.journal);
  await expect.poll(() => disk(page, '/mock/work.org')).toBe(before.work);
});

test('a second time the same day: the sheet has what was written; it is replaced, not doubled', async ({ page }) => {
  await open(page);
  await endDay(page);
  await sheet(page).locator('.cm-content').click();
  await page.keyboard.press('End');
  await page.keyboard.type('Первая');
  await page.keyboard.press('Meta+Enter');
  await expect(sheet(page)).toHaveCount(0);
  await endDay(page);
  await expect(sheet(page).locator('.cm-content')).toContainText('- Первая');
  await sheet(page).getByRole('button', { name: 'Убрать «Бюджет на нагрузочное»' }).click();
  await sheet(page).locator('.cm-content').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' и вторая');
  await page.keyboard.press('Meta+Enter');
  await expect(sheet(page)).toHaveCount(0);
  const j = (await disk(page, '/mock/journal.org'))!;
  expect(j.split(dayHead)).toHaveLength(2);
  expect(j.match(/\*\*\*\* На завтра/g)).toHaveLength(2); // yesterday's and today's
  expect(j).toContain('- Первая и вторая\n**** Главное\n- [[id:a2]');
  expect(j.split(dayHead)[1]).not.toContain('[[id:a1]');
});

test('no journal yet: «Завершить день» makes it, with the year, the month and the day', async ({ page }) => {
  const files: Record<string, string> = FILES();
  delete files['/mock/journal.org'];
  await open(page, files);
  await endDay(page);
  await page.keyboard.press('Meta+Enter');
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(() => disk(page, '/mock/journal.org')).toContain(`* ${DAY.getFullYear()}\n** ${iso(DAY).slice(0, 7)} `);
  expect(await disk(page, '/mock/journal.org')).toContain(`${dayHead}\n**** Сделано\n`); // nothing chosen, no note: only what was done
});

test('the palette has «Завершить день…»; «Клавиши» lists it with no key', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('завершить');
  await page.keyboard.press('Enter');
  await expect(sheet(page)).toBeVisible();
});

test('[[id:…]] opens its heading: ⌘-click; as «Оформленный текст» a plain click', async ({ page }) => {
  await open(page, { ...FILES(), '/mock/links.org': '* Ссылки\nсм. [[id:a2][вопросы к ревью]]\n' }, true);
  await page.getByRole('treeitem', { name: /links/ }).click();
  await page.locator('.cm-link', { hasText: 'вопросы к ревью' }).click();
  await expect(page.locator('.cm-activeLine')).toContainText('Вопросы к ревью биллинга');
  void stamp;
});
