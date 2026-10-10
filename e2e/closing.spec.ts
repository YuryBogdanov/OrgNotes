import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// Closing tabs with unsaved text (ТЗ «Закрытие несохранённой вкладки»). Files save themselves half a second
// after an edit, so a file only counts as unsaved when its write failed: the tests make a file unwritable.
const FILES = () => ({
  '/mock/work.org': '* Q4 2026\n** TODO Бюджет\nтекст\n',
  '/mock/journal.org': '* Октябрь\n** Итоги\n',
  '/mock/hiring.org': '* Вакансии\n',
});

const open = async (page: Page) => {
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await navRow(page, 'work').click();
  await expect(page.locator('.cm-content').first()).toContainText('Q4 2026');
};
const navRow = (page: Page, label: string) => page.locator(`.nav .row[data-key="/mock/${label}.org"]`);
const panes = (page: Page) => page.locator('section.pane');
const tabs = (page: Page, i = 0) => panes(page).nth(i).locator('.tab');
const labels = (page: Page, i = 0) => tabs(page, i).locator('.lbl').allInnerTexts();
const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const log = (page: Page) => page.evaluate(() => (window as any).__log as unknown[][]);
const sheet = (page: Page) => page.getByRole('alertdialog').filter({ has: page.locator('#cs-title') });
const btn = (page: Page, name: string) => sheet(page).getByRole('button', { name, exact: true });
const saveAs = (page: Page) => page.getByRole('dialog', { name: 'Сохранить как' });
const unwritable = (page: Page, ...paths: string[]) => page.evaluate((p) => ((window as any).__failWrites = p.map((x) => '/mock/' + x + '.org')), paths);
/** Type into a file that cannot be written: the dot stays. */
const failEdit = async (page: Page, name: string, text: string, pane = 0) => {
  await unwritable(page, name);
  await panes(page).nth(pane).locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await expect(page.getByText('Не удалось сохранить: нет прав на запись').first()).toBeVisible();
  await expect(tabs(page, pane).filter({ hasText: name })).toHaveClass(/dirty/);
};
const note = async (page: Page, text: string) => {
  await page.keyboard.press('Meta+t');
  await page.keyboard.type(text);
};

test.describe('one file', () => {
  test('⌘W asks «Сохранить изменения в «work»?»; «Сохранить» (Return) writes the file and closes the tab', async ({ page }) => {
    await open(page);
    await failEdit(page, 'work', ' правка');
    await page.keyboard.press('Meta+w');
    await expect(sheet(page).locator('#cs-title')).toHaveText('Сохранить изменения в «work»?');
    await expect(sheet(page)).toContainText('Если не сохранить, изменения будут потеряны.');
    await expect(btn(page, 'Сохранить')).toBeFocused();
    await expect(sheet(page).locator('img')).toHaveAttribute('width', '48');
    expect(Math.round((await sheet(page).boundingBox())!.width)).toBe(440);
    await unwritable(page); // the disk is writable again
    await page.keyboard.press('Enter');
    await expect(sheet(page)).toHaveCount(0);
    expect((await disk(page))['/mock/work.org']).toBe('* Q4 2026 правка\n** TODO Бюджет\nтекст\n');
    await expect(panes(page).nth(0).getByText('Нет открытых вкладок')).toBeVisible();
  });

  test('«Не сохранять» (⌘D) closes the tab and leaves the file on disk as it was', async ({ page }) => {
    await open(page);
    await failEdit(page, 'work', ' правка');
    await page.keyboard.press('Meta+w');
    await page.keyboard.press('Meta+d');
    await expect(sheet(page)).toHaveCount(0);
    expect(await labels(page)).toEqual([]);
    expect((await disk(page))['/mock/work.org']).toBe('* Q4 2026\n** TODO Бюджет\nтекст\n');
    await navRow(page, 'work').click(); // the edit is gone in the app too
    await expect(page.locator('.cm-line').first()).toHaveText('* Q4 2026');
  });

  test('«Отмена» (Esc, ⌘.) goes back to the editor with the text and the caret where they were', async ({ page }) => {
    await open(page);
    await failEdit(page, 'work', ' правка');
    const where = await panes(page).nth(0).locator('.status').innerText();
    await page.keyboard.press('Meta+w');
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await page.keyboard.press('Meta+w');
    await page.keyboard.press('Meta+.');
    await expect(sheet(page)).toHaveCount(0);
    expect(await labels(page)).toEqual(['work']);
    await expect(page.locator('.cm-line').first()).toHaveText('* Q4 2026 правка');
    expect((await panes(page).nth(0).locator('.status').innerText()).split('\n')[0]).toBe(where.split('\n')[0]);
    await page.keyboard.type('!'); // the focus is back in the editor, at the caret
    await expect(page.locator('.cm-line').first()).toHaveText('* Q4 2026 правка!');
  });

  test('a failed write keeps the tab and says why', async ({ page }) => {
    await open(page);
    await failEdit(page, 'work', ' правка');
    await page.keyboard.press('Meta+w');
    await page.keyboard.press('Enter'); // still unwritable
    const err = sheet(page);
    await expect(err.locator('#cs-title')).toHaveText('Не удалось сохранить «work»');
    await expect(err).toContainText('Нет прав на запись. Текст остался в редакторе.');
    await btn(page, 'ОК').click();
    expect(await labels(page)).toEqual(['work']);
    await expect(page.locator('.cm-line').first()).toHaveText('* Q4 2026 правка');
  });

  test('a file without changes, and one whose save is only waiting, close at once', async ({ page }) => {
    await open(page);
    await page.locator('.cm-line').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' быстро');
    await page.keyboard.press('Meta+w'); // within the half second: written now, no question
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(async () => (await disk(page))['/mock/work.org']).toBe('* Q4 2026 быстро\n** TODO Бюджет\nтекст\n');
    await navRow(page, 'journal').click();
    await page.keyboard.press('Meta+w');
    await expect(sheet(page)).toHaveCount(0);
  });
});

test.describe('a new note', () => {
  test('«Сохранить заметку «…»?»; «Сохранить…» opens Save As with the same name; cancelling it keeps the tab', async ({ page }) => {
    await open(page);
    await note(page, '\n** Идеи для ретро\nпервая мысль');
    await page.keyboard.press('Meta+w');
    await expect(sheet(page).locator('#cs-title')).toHaveText('Сохранить заметку «Идеи для ретро»?');
    await expect(sheet(page)).toContainText('Текст пока не записан в файл. Нажмите «Сохранить…», чтобы выбрать, куда его сохранить.');
    await expect(btn(page, 'Сохранить…')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(saveAs(page).getByLabel('Сохранить как:')).toHaveValue('Идеи для ретро');
    await page.keyboard.press('Escape');
    expect(await labels(page)).toEqual(['work', 'Без названия']);
    await page.keyboard.press('Meta+w');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter'); // save in the root
    await expect.poll(async () => Object.keys(await disk(page))).toContain('/mock/Идеи для ретро.org');
    await expect.poll(() => labels(page)).toEqual(['work']);
  });

  test('a long first line is cut to 40 characters in the title and in Save As', async ({ page }) => {
    await open(page);
    await note(page, 'Очень длинная первая строка заметки, которая не помещается');
    await page.keyboard.press('Meta+w');
    await expect(sheet(page).locator('#cs-title')).toHaveText('Сохранить заметку «Очень длинная первая строка заметки, ко…»?');
    await page.keyboard.press('Enter');
    await expect(saveAs(page).getByLabel('Сохранить как:')).toHaveValue('Очень длинная первая строка заметки, ко…');
  });

  test('only spaces and blank lines: no dot, closes without a question', async ({ page }) => {
    await open(page);
    await note(page, '   \n\n  ');
    await expect(tabs(page).last()).not.toHaveClass(/dirty/);
    await page.keyboard.press('Meta+w');
    await expect(sheet(page)).toHaveCount(0);
    expect(await labels(page)).toEqual(['work']);
  });
});

test.describe('several tabs', () => {
  test('"Закрыть остальные" lists only the other tabs with changes, never the kept one', async ({ page }) => {
    await open(page);
    await note(page, 'черновик один'); // kept, unsaved: not in the list
    await navRow(page, 'hiring').click({ modifiers: [] });
    await page.keyboard.press('Meta+2');
    await note(page, 'черновик два');
    await page.keyboard.press('Meta+t');
    await note(page, '* План на неделю');
    // tabs: work, Без названия, hiring, Агенда, Без названия 2, Без названия 3, Без названия 4
    await tabs(page).nth(1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Закрыть остальные/ }).click();
    await expect(sheet(page).locator('#cs-title')).toHaveText('Сохранить изменения в 2 вкладках?');
    await expect(sheet(page)).toContainText('Для новой заметки откроется «Сохранить как».');
    const rows = sheet(page).locator('li');
    await expect(rows.locator('.nm')).toHaveText(['черновик два', 'План на неделю']);
    await expect(rows.locator('.st')).toHaveText(['новая заметка', 'новая заметка']);
    await expect(rows.first().locator('.nm')).toHaveCSS('font-style', 'italic');
    await expect(rows.first().locator('.dot')).toHaveCount(1);
    await expect(btn(page, 'Сохранить всё')).toBeFocused();
    await btn(page, 'Не сохранять').click();
    expect(await labels(page)).toEqual(['Без названия']);
  });

  test('without changes among the others they close at once', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Meta+2');
    await note(page, 'черновик');
    await page.keyboard.press('Alt+Meta+w');
    await expect(sheet(page)).toHaveCount(0);
    expect(await labels(page)).toEqual(['Без названия']);
  });

  test('«Сохранить всё»: files are written at once, each note gets Save As in turn; a cancel closes nothing', async ({ page }) => {
    await open(page);
    await failEdit(page, 'work', ' правка');
    await note(page, '* Первая');
    await note(page, '* Вторая');
    await page.keyboard.press('Meta+q');
    await expect(sheet(page).locator('#cs-title')).toHaveText('Сохранить изменения в 3 вкладках?');
    await expect(sheet(page).locator('li .nm')).toHaveText(['work', 'Первая', 'Вторая']);
    await expect(sheet(page).locator('li .st')).toHaveText(['изменён', 'новая заметка', 'новая заметка']);
    await unwritable(page);
    await page.keyboard.press('Enter');
    await expect(saveAs(page).getByLabel('Сохранить как:')).toHaveValue('Первая');
    expect((await disk(page))['/mock/work.org']).toContain('правка'); // written before the first Save As
    await page.keyboard.press('Enter');
    await expect(saveAs(page).getByLabel('Сохранить как:')).toHaveValue('Вторая');
    await page.keyboard.press('Escape'); // stop: nothing closes, the app keeps running
    await expect(saveAs(page)).toHaveCount(0);
    expect((await log(page)).some((e) => e[0] === 'quit')).toBe(false);
    expect(await labels(page)).toEqual(['work', 'Первая', 'Без названия 2']);
    await expect(tabs(page).nth(0)).not.toHaveClass(/dirty/);
    await expect(tabs(page).nth(1)).not.toHaveClass(/dirty/);
    await expect(tabs(page).nth(2)).toHaveClass(/dirty/);
  });

  test('a list longer than six rows scrolls', async ({ page }) => {
    await open(page);
    for (let i = 1; i <= 8; i++) await note(page, `заметка ${i}`);
    await page.keyboard.press('Meta+q');
    await expect(sheet(page).locator('#cs-title')).toHaveText('Сохранить изменения в 8 вкладках?');
    const list = sheet(page).locator('ul');
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await list.evaluate((el) => Math.round(el.clientHeight))).toBeLessThanOrEqual(6 * 24 + 8);
  });
});

test.describe('the same file in two panes', () => {
  test('closing one of its tabs asks nothing; closing the last one asks', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Второй редактор' }).click(); // work in both panes
    await failEdit(page, 'work', ' правка', 1);
    await page.keyboard.press('Meta+w'); // the right one: the left still has the text
    await expect(sheet(page)).toHaveCount(0);
    await expect(panes(page)).toHaveCount(1);
    await page.keyboard.press('Meta+w');
    await expect(sheet(page).locator('#cs-title')).toHaveText('Сохранить изменения в «work»?');
  });

  test('in the list of several tabs it shows and counts once', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Второй редактор' }).click();
    await failEdit(page, 'work', ' правка', 1);
    await note(page, 'черновик');
    await page.keyboard.press('Meta+q');
    await expect(sheet(page).locator('#cs-title')).toHaveText('Сохранить изменения в 2 вкладках?');
    await expect(sheet(page).locator('li')).toHaveCount(2);
  });
});

test.describe('quitting', () => {
  test('⌘Q: one sheet for both panes, without the agenda; «Отмена» keeps the app running', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Агенда' }).click();
    await note(page, 'справа');
    await panes(page).nth(0).locator('.cm-content').click();
    await note(page, 'слева');
    await page.keyboard.press('Meta+q');
    await expect(sheet(page).locator('li .nm')).toHaveText(['слева', 'справа']); // left pane first
    await btn(page, 'Отмена').click();
    expect((await log(page)).some((e) => e[0] === 'quit')).toBe(false);
    await page.keyboard.press('Meta+Shift+w'); // closing the window asks the same
    await expect(sheet(page).locator('li')).toHaveCount(2);
    await page.keyboard.press('Meta+d');
    await expect.poll(async () => (await log(page)).some((e) => e[0] === 'quit')).toBe(true);
  });

  test('nothing unsaved: quits without a question', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Meta+q');
    await expect.poll(async () => (await log(page)).some((e) => e[0] === 'quit')).toBe(true);
    await expect(sheet(page)).toHaveCount(0);
  });
});

test.describe('while the sheet is up', () => {
  test('⌘W again and clicks on the window do nothing; Tab goes round the buttons', async ({ page }) => {
    await open(page);
    await navRow(page, 'journal').click();
    await note(page, 'текст');
    await page.keyboard.press('Meta+w');
    await page.keyboard.press('Meta+w');
    await expect(sheet(page)).toHaveCount(1);
    await tabs(page).first().click({ force: true }); // blocked by the dim
    await page.mouse.click(400, 20); // the toolbar is covered too
    await expect(tabs(page).last()).toHaveClass(/on/);
    await expect(btn(page, 'Сохранить…')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(btn(page, 'Не сохранять')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(btn(page, 'Отмена')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(btn(page, 'Не сохранять')).toBeFocused();
    await page.keyboard.press('Enter'); // Return presses the chosen button
    await expect(sheet(page)).toHaveCount(0);
    await expect(tabs(page).filter({ hasText: 'Без названия' })).toHaveCount(0);
  });
});
