import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { FILES, NOW, PETROV } from './goalsFixture';

// ТЗ 23, part 2: «Разбор целей» on 1-1 — the queue, the card (the goal on the left, the marks on the right), a mark,
// «Цель достигнута», «Сдвинуть срок…», another quarter, the summary.

async function open(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.keyboard.press('Control+Meta+4');
}
async function reviewPetrov(page: Page) {
  await open(page);
  await page.getByRole('navigation', { name: 'Цели' }).getByRole('button', { name: /Обзор квартала/ }).click();
  await page.getByRole('region', { name: 'Петров Алексей' }).getByRole('button', { name: 'Разобрать цели' }).click();
  await expect(card(page)).toBeVisible();
}
const card = (page: Page) => page.locator('.greview .card');
const head = (page: Page) => card(page).locator('.chead');
const marks = (page: Page) => card(page).getByRole('complementary', { name: 'Отметки' });
const field = (page: Page) => page.getByRole('textbox', { name: 'Новая отметка' });
const disk = (page: Page) => page.evaluate((p) => (window as any).__disk[p] as string, PETROV);

test('the queue: the silent goal first, then by deadline; the card as on the mockup', async ({ page }) => {
  await reviewPetrov(page);
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('Разбор целей · Петров Алексей');
  await expect(page.locator('.toolbar .path')).toContainText('Цели›Разбор · Петров Алексей');
  await expect(head(page)).toContainText('Петров Алексей · цель 1 из 3');
  await expect(head(page).locator('.file')).toHaveText('petrov.org');
  await expect(head(page).locator('.pill')).toHaveText('20 дней без отметок');
  await expect(card(page).locator('.quick button')).toHaveText([/Статус\s*ACTIVE/, /Срок\s*30 ноя/, /Квартал\s*Q4 2026/]);
  // the goal in the editor, «Отметки» folded with its note; the marks on the right, newest first
  await expect(card(page).locator('.cm-line').first()).toContainText('ACTIVE Сократить время сборки CI до 10 минут');
  await expect(card(page).locator('.cm-line-note')).toHaveText('2 — справа');
  await expect(marks(page).locator('.cap')).toHaveText('ОТМЕТКИ · 2');
  await expect(marks(page).locator('.md')).toHaveText(['Вт, 22 сен', 'Пт, 18 сен']);
  await expect(marks(page).locator('.mark').first().locator('.mt')).toHaveText('Замерили: p90 = 23 мин, из них e2e — 14 мин.\n- главный кандидат — e2e в 4 потока;\n- кэш Docker даст ещё 3–4 мин.');
  await expect(field(page)).toBeFocused();
  await expect(marks(page).locator('.day')).toHaveText('Сегодня, Пн 12 окт');
  await page.keyboard.press('Meta+BracketRight');
  await expect(head(page)).toContainText('цель 2 из 3');
  await expect(card(page).locator('.cm-line').first()).toContainText('Внедрить дежурства по on-call');
  await page.keyboard.press('Meta+BracketRight');
  await expect(card(page).locator('.cm-line').first()).toContainText('Наставничество для двух мидлов');
});

test('⌘↩ adds a mark at the end of «Отметки»: «- » lines nested; the silence is gone', async ({ page }) => {
  await reviewPetrov(page);
  await page.keyboard.type('Кэш включили, p90 = 17 мин.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- e2e делим на 4 потока;');
  await page.keyboard.press('Enter'); // the next item
  await page.keyboard.type('Козлов поднимает раннеры.');
  await page.keyboard.press('Meta+Enter');
  await expect.poll(() => disk(page)).toContain(
    '  - кэш Docker даст ещё 3–4 мин.\n- [2026-10-12 Пн] Кэш включили, p90 = 17 мин.\n  - e2e делим на 4 потока;\n  - Козлов поднимает раннеры.\n*** BACKLOG',
  );
  await expect(field(page)).toHaveValue('');
  await expect(marks(page).locator('.md')).toHaveText(['Пн, 12 окт', 'Вт, 22 сен', 'Пт, 18 сен']);
  await expect(head(page).locator('.pill')).toHaveText('отметка сегодня');
  await expect(card(page).locator('.cm-line-note')).toHaveText('3 — справа');
});

test('a mark of another day: the chip opens the calendar; it goes to its place by date', async ({ page }) => {
  await reviewPetrov(page);
  await page.keyboard.type('Договорились о потоках.');
  await marks(page).locator('.day').click();
  await expect(page.locator('.pal .tok')).toHaveText('День отметки');
  await page.keyboard.type('-22'); // 22 days back: «20 сен» alone would be the next one, in 2027
  await page.keyboard.press('Enter');
  await expect(marks(page).locator('.day')).toHaveText('Вс 20 сен');
  await page.locator('.greview .bar').getByRole('button', { name: /Добавить отметку/ }).click();
  await expect.poll(() => disk(page)).toContain('- [2026-09-18 Пт] Поставили цель на 1-1, согласовали метрики и срок.\n- [2026-09-20 Вс] Договорились о потоках.\n- [2026-09-22 Вт] Замерили');
});

test('⌘1 closes the goal with CLOSED and offers «Итог:»; «Следующая» saves the mark without asking', async ({ page }) => {
  await reviewPetrov(page);
  await page.keyboard.press('Meta+1');
  await expect.poll(() => disk(page)).toMatch(/\*\*\* COMPLETED Сократить время сборки CI до 10 минут\nCLOSED: \[2026-10-12 \S+ 14:00\] DEADLINE: <2026-11-30 Пн>/);
  await expect(field(page)).toHaveValue('Итог: ');
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('p90 = 9 мин.');
  await page.keyboard.press('Meta+BracketRight');
  await expect.poll(() => disk(page)).toContain('- [2026-10-12 Пн] Итог: p90 = 9 мин.');
  await expect(head(page)).toContainText('цель 2 из 3');
});

test('⌘2 moves the deadline in the calendar and writes «Срок перенесён: … → …»', async ({ page }) => {
  await reviewPetrov(page);
  await page.keyboard.press('Meta+2');
  await expect(page.locator('.pal .tok')).toHaveText('Дедлайн');
  await page.keyboard.type('15 дек');
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page)).toContain('*** ACTIVE Сократить время сборки CI до 10 минут\nDEADLINE: <2026-12-15 Вт>');
  await expect.poll(() => disk(page)).toContain('- [2026-10-12 Пн] Срок перенесён: 30 ноя → 15 дек');
  await expect(card(page).locator('.quick button').nth(1)).toHaveText(/Срок\s*15 дек/);
});

test('«Квартал»: the goal goes under another quarter, made in its place; the card stays', async ({ page }) => {
  await reviewPetrov(page);
  await card(page).getByRole('button', { name: /Квартал/ }).click();
  await page.getByRole('menuitemradio', { name: 'Q1 2027' }).click();
  await expect.poll(() => disk(page)).toContain('* Квартальные задачи\n** Квартал Q1 2027\n*** ACTIVE Сократить время сборки CI до 10 минут');
  await expect(card(page).locator('.quick button').nth(2)).toHaveText(/Квартал\s*Q1 2027/);
  await expect(card(page).locator('.cm-line').first()).toContainText('Сократить время сборки CI');
});

test('the end: what was done; «Закончить» closes the tab; ⌘[ goes back from the summary', async ({ page }) => {
  await reviewPetrov(page);
  await page.keyboard.type('Отметка.');
  await page.keyboard.press('Meta+Enter');
  await expect.poll(() => disk(page)).toContain('Отметка.');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Meta+BracketRight');
  const done = page.locator('.greview .done');
  await expect(done.locator('h2')).toHaveText('Разбор закончен');
  await expect(done.locator('.stat')).toHaveText([/1\s*отметка добавлена/, /0\s*целей закрыто/, /0\s*сроков сдвинуто/]);
  await page.keyboard.press('Meta+BracketLeft');
  await expect(head(page)).toContainText('цель 3 из 3');
  for (let i = 0; i < 1; i++) await page.keyboard.press('Meta+BracketRight');
  await done.getByRole('button', { name: 'Закончить' }).click();
  await expect(page.locator('.greview')).toHaveCount(0);
  await expect(page.locator('section.pane .tab .lbl', { hasText: 'Разбор целей' })).toHaveCount(0);
});

test('⌥-click on a goal starts there; the palette «Разобрать цели…» asks whose', async ({ page }) => {
  await open(page);
  await page.getByRole('navigation', { name: 'Цели' }).getByRole('button', { name: /Обзор квартала/ }).click();
  await page.locator('.goals .row', { hasText: 'Наставничество' }).click({ modifiers: ['Alt'] });
  await expect(head(page)).toContainText('цель 3 из 3');
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('разобрать цели');
  await page.keyboard.press('Enter');
  await page.keyboard.type('смирн');
  await page.keyboard.press('Enter');
  await expect(head(page)).toContainText('Смирнов Олег · цель 1 из 2');
  await expect(head(page).locator('.pill')).toHaveText('31 день без отметок');
});

test('a double click on a mark opens «Отметки» on the left at it', async ({ page }) => {
  await reviewPetrov(page);
  await expect(card(page).locator('.cm-line', { hasText: 'Замерили' })).toHaveCount(0); // folded
  await marks(page).locator('.mark').first().dblclick();
  await expect(card(page).locator('.cm-line', { hasText: 'Замерили' })).toBeVisible();
  await expect(card(page).locator('.cm-line-note')).toHaveCount(0);
});
