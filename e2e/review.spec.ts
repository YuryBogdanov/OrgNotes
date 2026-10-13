import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';
import { FILES, INBOX, WORK } from './reviewFixture';

// ТЗ «Разбор Inbox по карточкам».
const IB = '/mock/inbox.org';
const FIN = '/mock/Работа/finance.org';
const disk = (page: Page, p = IB) => page.evaluate((p) => (window as any).__disk[p] as string, p);
const own = (page: Page) => page.evaluate(() => JSON.parse((window as any).__disk['/mock/.orgnotes/plugins/inbox.json'] ?? 'null')?.settings);
const panel = (page: Page) => page.locator('.inbox');
const card = (page: Page) => page.locator('.review .card');
const cardLines = (page: Page) => card(page).locator('.cm-line');
const queue = (page: Page) => panel(page).locator('.rrow');
const toast = (page: Page) => page.locator('.toast');

async function open(page: Page, files: Record<string, string> = FILES()) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Inbox' }).click();
}
async function start(page: Page, files?: Record<string, string>) {
  await open(page, files);
  await panel(page).getByRole('button', { name: 'Разобрать' }).click();
  await expect(card(page)).toBeVisible();
}
const title = (page: Page) => card(page).locator('.cm-line').first();

test.describe('starting', () => {
  test('«Разобрать» with the count and the oldest age; the tab «Разбор Inbox» with the oldest task first', async ({ page }) => {
    await open(page);
    await expect(panel(page).locator('.title')).toHaveText('INBOX · 6');
    await expect(panel(page).locator('.prog')).toContainText('5 задач');
    await expect(panel(page).locator('.prog')).toContainText('самой старой 15 дней'); // the deferred one (20 days) is not in the queue
    await panel(page).getByRole('button', { name: 'Разобрать' }).click();
    await expect(page.locator('section.pane.active .tab.on')).toContainText('Разбор Inbox');
    await expect(card(page).locator('.k')).toHaveText('Задача 1 из 5');
    await expect(card(page).locator('.where')).toHaveText('inbox.org · строки 14–17');
    await expect(card(page).locator('.age')).toContainText('15 дней в Inbox · создана');
    await expect(card(page).locator('.age')).toHaveClass(/stale/);
    await expect(title(page)).toContainText('TODO Продлить страховку авто');
    await expect(cardLines(page).filter({ hasText: ':CREATED:' })).toHaveCount(1); // drawers open on the card
    await expect(card(page).locator('.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^14$/ })).toHaveCount(1); // real line numbers
    expect(await queue(page).locator('.t').allInnerTexts()).toEqual(['Продлить страховку авто', 'Позвонить в банк про лимиты', 'Подготовить презентацию для CTO', 'Купить батарейки для мыши', 'Без даты создания']);
    await expect(queue(page).first()).toHaveClass(/cur/);
    await expect(panel(page).getByRole('button', { name: 'Закончить' })).toBeVisible();
    await expect(panel(page).locator('.prog')).toContainText('Разобрано 0 из 5');
  });

  test('nothing to go through: the button is off and says why; ⇧⌘R and the palette start it too', async ({ page }) => {
    await open(page, { ...FILES(), [IB]: '* TODO Отложенная\nSCHEDULED: <2099-01-01 Thu>\n' });
    await expect(panel(page).getByRole('button', { name: 'Разобрать' })).toBeDisabled();
    await expect(panel(page).getByRole('button', { name: 'Разобрать' })).toHaveAttribute('title', 'Нечего разбирать');
    await page.goto('/'); // a fresh window with tasks
    await open(page);
    await page.keyboard.press('Shift+Meta+r');
    await expect(card(page)).toBeVisible();
    await page.locator('section.pane.active .tab.on .x').click({ force: true }); // closing the tab ends it
    await expect(panel(page).getByRole('button', { name: 'Разобрать' })).toBeVisible();
    await page.keyboard.press('Shift+Meta+p');
    await page.keyboard.type('разобр');
    await page.keyboard.press('Enter');
    await expect(card(page)).toBeVisible();
  });
});

test.describe('the card', () => {
  test('a real editor narrowed to the task: edits go to inbox.org, the rest of the file cannot be reached', async ({ page }) => {
    await start(page);
    await page.keyboard.type(' x'); // the caret is at the end of the task
    await expect.poll(() => disk(page)).toContain(':END: x\n\n* TODO Отложенная');
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace'); // would join with the line above: not allowed
    expect(await cardLines(page).count()).toBe(4);
    await expect.poll(() => disk(page)).toContain('\n\n* TODO Продлить страховку авто');
    await page.keyboard.press('Meta+z');
    await expect.poll(() => disk(page)).toBe(INBOX());
  });

  test('the quick buttons open the palette at their step; the change goes to the task', async ({ page }) => {
    await start(page);
    await card(page).getByRole('button', { name: /Статус/ }).click();
    const pal = page.getByRole('dialog', { name: 'Командная палитра' });
    await expect(pal.getByRole('combobox')).toHaveAttribute('placeholder', 'Статус');
    await page.keyboard.type('NEXT');
    await page.keyboard.press('Enter');
    await expect(title(page)).toContainText('NEXT Продлить страховку авто');
    await card(page).getByRole('button', { name: /Приоритет/ }).click();
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await expect(title(page)).toContainText('NEXT [#A] Продлить страховку авто');
    await expect(card(page).getByRole('button', { name: /Приоритет/ })).toContainText('A');
    await expect.poll(() => disk(page)).toContain('* NEXT [#A] Продлить страховку авто');
  });
});

test.describe('the actions', () => {
  test('⌘1 done, ⌘2 cancelled — on disk at once, the next card; the toast takes the last one back', async ({ page }) => {
    await start(page);
    await page.keyboard.press('Meta+1');
    await expect.poll(() => disk(page)).toMatch(/\* DONE Продлить страховку авто\nCLOSED: \[/);
    await expect(title(page)).toContainText('Позвонить в банк про лимиты');
    await expect(card(page).locator('.k')).toHaveText('Задача 2 из 5');
    await expect(queue(page).first().locator('.sub')).toHaveText('Выполнено · DONE');
    await expect(queue(page).first().locator('.t')).toHaveClass(/strike/);
    await page.keyboard.press('Meta+2');
    await expect.poll(() => disk(page)).toMatch(/\* CANCELLED Позвонить в банк про лимиты\nCLOSED:/);
    await expect(toast(page)).toContainText('Отменено: Позвонить в банк про лимиты');
    await expect(panel(page).locator('.prog')).toContainText('Разобрано 2 из 5');
    await expect(panel(page).locator('.title')).toHaveText('INBOX · 4');
    await toast(page).getByRole('button', { name: 'Отменить' }).click();
    await expect.poll(() => disk(page)).toContain('* TODO Позвонить в банк про лимиты');
    await expect(title(page)).toContainText('TODO Позвонить в банк про лимиты'); // its card again
    await expect(queue(page).nth(1).locator('.sub')).toHaveText('Сейчас на карточке');
  });

  test('a task done already (⌘[ back to it): «Выполнено» is off and says so, without its fill (#105); ⌘1 does nothing', async ({ page }) => {
    await start(page);
    await page.keyboard.press('Meta+1');
    await expect(card(page).locator('.k')).toHaveText('Задача 2 из 5');
    await page.keyboard.press('Meta+BracketLeft');
    await expect(title(page)).toContainText('DONE Продлить страховку авто');
    const done = page.locator('.acts .a.done-b');
    await expect(done).toBeDisabled();
    await expect(done).toHaveAttribute('title', 'Уже DONE');
    await expect(done).toContainText('DONE');
    const bg = await done.evaluate((b) => getComputedStyle(b).backgroundColor);
    const plain = await page.locator('.acts .a').nth(1).evaluate((b) => getComputedStyle(b).backgroundColor);
    expect(bg).toBe(plain); // drawn as the plain buttons: it reads as off in both themes
    await expect(page.locator('.acts .a').nth(1)).toBeEnabled(); // «Отменить» still can
    const before = await disk(page);
    await page.keyboard.press('Meta+1');
    await page.waitForTimeout(300);
    expect(await disk(page)).toBe(before);
  });

  test('«Отложить…»: SCHEDULED on the chosen day, it stays in the Inbox and leaves the queue till then', async ({ page }) => {
    await start(page);
    await page.keyboard.press('Meta+4');
    const pop = page.getByRole('dialog', { name: 'Отложить до' });
    await expect(pop.locator('.opt .ol')).toHaveText(['Завтра', 'Через 3 дня', 'На следующей неделе', 'Через месяц', 'Выбрать дату…']);
    await expect(pop.locator('.opt.on .ol')).toHaveText('Завтра');
    await page.keyboard.press('2');
    await expect(pop).toHaveCount(0);
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await expect.poll(() => disk(page)).toContain(`* TODO Продлить страховку авто\nSCHEDULED: <${iso}`);
    await expect(queue(page).first().locator('.sub')).toContainText('Отложена до');
    await expect(title(page)).toContainText('Позвонить в банк');
  });

  test('«Перенести…»: the move of ТЗ 16; Esc comes back to the card; ⌘[ shows the moved task in its new file', async ({ page }) => {
    await start(page);
    await page.keyboard.press('Meta+3');
    const dlg = page.getByRole('dialog', { name: 'Перенести задачу' });
    await expect(dlg.locator('.plate .right')).toHaveText('из inbox');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(title(page)).toContainText('Продлить страховку авто');
    await page.keyboard.press('Meta+3');
    await page.keyboard.type('fin');
    await page.keyboard.press('Enter');
    await page.keyboard.type('банки');
    await page.keyboard.press('Enter');
    await expect.poll(() => disk(page, FIN)).toContain('** Банки и лимиты\n*** TODO Продлить страховку авто\n:PROPERTIES:');
    await expect.poll(() => disk(page)).not.toContain('Продлить страховку'); // the Inbox is written after the target
    await expect(queue(page).first().locator('.sub')).toHaveText('→ finance › Банки и лимиты');
    await expect(title(page)).toContainText('Позвонить в банк');
    await page.keyboard.press('Meta+BracketLeft');
    await expect(card(page).locator('.moved')).toHaveText('Перенесена в finance › Банки и лимиты');
    await expect(card(page).locator('.where')).toContainText('finance.org');
    await expect(title(page)).toContainText('*** TODO Продлить страховку авто');
    await page.keyboard.press('Meta+1'); // done again: in the target file now
    await expect.poll(() => disk(page, FIN)).toContain('*** DONE Продлить страховку авто');
  });

  test('skipped tasks do not come back in the same pass; the summary counts and offers them', async ({ page }) => {
    await start(page);
    await page.keyboard.press('Meta+5'); // skip
    await page.keyboard.press('Meta+1');
    await page.keyboard.press('Meta+2');
    await page.keyboard.press('Meta+4');
    await page.keyboard.press('1');
    await expect(title(page)).toContainText('Без даты создания');
    await page.keyboard.press('Meta+1');
    const done = page.locator('.review .done');
    await expect(done.locator('h2')).toHaveText('Разбор закончен');
    await expect(done.locator('p')).toHaveText('Осталась 1 пропущенная задача. Её можно разобрать сейчас или в следующий раз.');
    expect(await done.locator('.stat').allInnerTexts()).toEqual(['2\nвыполнено', '1\nотменено', '0\nперенесено', '1\nотложено', '1\nпропущено']);
    await expect(page.locator('.review .bar')).toHaveCount(0);
    await expect(panel(page).locator('.prog')).toContainText('Разобрано 4 из 5');
    await expect(queue(page).first().locator('.sub')).toHaveText('Пропущена');
    await page.keyboard.press('Meta+z'); // the summary: ⌘Z takes the last action back, its card again
    await expect(title(page)).toContainText('Без даты создания');
    await expect.poll(() => disk(page)).toContain('* TODO Без даты создания');
    await page.keyboard.press('Meta+1');
    await expect(done.locator('h2')).toHaveText('Разбор закончен');
    await done.getByRole('button', { name: 'Разобрать пропущенную' }).click();
    await expect(card(page).locator('.k')).toHaveText('Задача 1 из 1');
    await expect(title(page)).toContainText('Продлить страховку авто');
    await panel(page).getByRole('button', { name: 'Закончить' }).click();
    await expect(page.locator('.review')).toHaveCount(0);
    await expect(panel(page).locator('.title')).toHaveText('INBOX · 3'); // skipped + deferred + …
  });

  test('«…»: delete (asks when the task has text) and «Открыть в файле» in the other pane', async ({ page }) => {
    await start(page);
    await page.keyboard.press('Meta+5');
    await card(page).page().getByRole('button', { name: 'Ещё: удалить, открыть в файле' }).click();
    await page.getByRole('menuitem', { name: 'Удалить…' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Удаление задачи' })).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
    await expect.poll(() => disk(page)).not.toContain('Позвонить в банк');
    await expect(title(page)).toContainText('Подготовить презентацию');
    await page.getByRole('button', { name: 'Ещё: удалить, открыть в файле' }).click();
    await page.getByRole('menuitem', { name: 'Открыть в файле' }).click();
    await expect(page.locator('section.pane .tab', { hasText: 'inbox' })).toHaveCount(2); // the first tab and the new one
    await expect(card(page)).toBeVisible(); // the review goes on
  });

  test('a task removed outside the app: the next card and a toast', async ({ page }) => {
    await start(page);
    const next = INBOX().replace(/\* TODO Продлить страховку авто\n:PROPERTIES:\n:CREATED: [^\n]+\n:END:\n\n/, '');
    await page.evaluate(([p, t]) => (window as any).__setDisk(p, t), [IB, next]);
    await expect(toast(page)).toContainText('Задача изменена вне приложения и пропущена');
    await expect(title(page)).toContainText('Позвонить в банк');
    await expect(queue(page)).toHaveCount(4);
  });
});

test('Settings › Inbox › РАЗБОР: statuses, the order of the cards, the age', async ({ page }) => {
  await installTauriMock(page, FILES());
  await page.goto('/');
  await openSettingsSheet(page, 'Inbox');
  await expect(page.getByLabel('Статус «Выполнено»')).toHaveValue('DONE');
  await expect(page.getByLabel('Статус «Отменено»')).toHaveValue('CANCELLED');
  await page.getByRole('radio', { name: 'Новые сначала' }).click();
  await page.getByLabel('Считать задачу залежавшейся через').selectOption('14');
  await expect.poll(() => own(page)).toEqual({ reviewOrder: 'new', stale: 14 }); // the plugin's file (ТЗ 28)
  await expect(page.getByLabel('Считать задачу залежавшейся через').locator('option')).toHaveText(['3 дня', '7 дней', '14 дней', '30 дней']);
});

void WORK;
