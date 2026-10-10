import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ «Файл изменился на диске»: the app never loses anyone's text without the user's choice.
const WORK = '* Q4 2026\n** TODO Бюджет\nСвести заявки до 25 октября.\n** NEXT План найма\n';
const FILES = () => ({ '/mock/work.org': WORK, '/mock/journal.org': '* Октябрь\n', '/mock/hiring.org': '* Вакансии\n' });
const W = '/mock/work.org';

const open = async (page: Page) => {
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.locator(`.nav .row[data-key="${W}"]`).click();
  await expect(page.locator('.cm-content').first()).toContainText('Q4 2026');
};
const disk = (page: Page, p = W) => page.evaluate((p) => (window as any).__disk[p] as string | undefined, p);
const setDisk = (page: Page, text: string, p = W) => page.evaluate(([p, t]) => (window as any).__setDisk(p, t), [p, text]);
const line = (page: Page, text: string) => page.locator('section.pane.active .cm-line', { hasText: text }).first();
const status = (page: Page) => page.locator('section.pane.active .status').innerText();
const sheet = (page: Page) => page.getByRole('alertdialog');
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const unwritable = (page: Page, ...paths: string[]) => page.evaluate((p) => ((window as any).__failWrites = p), paths);
/** Edits that cannot reach the disk: the tab stays «with edits». */
const editLocked = async (page: Page, text = ' моё') => {
  await unwritable(page, W);
  await line(page, 'Свести заявки').click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await expect(page.getByText('Не удалось сохранить: нет прав на запись').first()).toBeVisible();
};
const EXTERNAL = WORK.replace('до 25 октября', 'до конца месяца');

test.describe('a tab without edits', () => {
  test('updates by itself: the caret keeps its place, a note shows for 4 s, typing goes on', async ({ page }) => {
    await open(page);
    await line(page, 'Бюджет').click();
    await page.keyboard.press('End');
    const before = await status(page);
    await setDisk(page, WORK + '* Новый раздел\n');
    await expect(line(page, 'Новый раздел')).toBeVisible();
    expect((await status(page)).split('\n')[0]).toBe(before.split('\n')[0]); // the same line and column
    const toast = page.getByRole('status');
    await expect(toast).toHaveText('«work» обновлён с диска: файл изменила другая программа');
    await page.keyboard.type('!'); // not blocked
    await expect(line(page, 'Бюджет')).toHaveText('** TODO Бюджет!');
    await expect(toast).toHaveCount(0, { timeout: 6000 });
  });

  test('⌘Z after it does not bring the old text back', async ({ page }) => {
    await open(page);
    await line(page, 'План найма').click();
    await setDisk(page, WORK.replace('Бюджет', 'Бюджет 2027'));
    await expect(line(page, 'Бюджет 2027')).toBeVisible();
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(300);
    await expect(line(page, 'Бюджет 2027')).toBeVisible();
  });

  test('a touched file (same text, new date) shows nothing', async ({ page }) => {
    await open(page);
    await page.evaluate((p) => (window as any).__touchDisk(p), W);
    await page.waitForTimeout(800);
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(sheet(page)).toHaveCount(0);
  });

  test('several visible files: one note «Обновлено с диска: 2 файла»; a hidden tab updates quietly', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Второй редактор' }).click();
    await page.locator('.nav .row[data-key="/mock/journal.org"]').click();
    await page.locator('.nav .row[data-key="/mock/hiring.org"]').click({ modifiers: [] });
    await page.keyboard.press('Meta+t'); // hiring stays a hidden tab? no: make one hidden below
    await page.keyboard.press('Meta+w');
    await setDisk(page, WORK.replace('Q4', 'Q1'));
    await setDisk(page, '* Вакансии 2027\n', '/mock/hiring.org');
    await expect(page.getByRole('status')).toHaveText('Обновлено с диска: 2 файла');
  });

  test('an inactive tab: no note, the new text is there when shown', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Meta+2'); // the agenda in front, work behind it
    await setDisk(page, WORK.replace('Бюджет', 'Бюджет 2027'));
    await page.waitForTimeout(600);
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.locator('section.pane.active .tab').first().click();
    await expect(line(page, 'Бюджет 2027')).toBeVisible();
  });
});

test.describe('a tab with edits', () => {
  test('asks: two versions with times, three buttons; Return compares', async ({ page }) => {
    await open(page);
    await editLocked(page);
    await setDisk(page, EXTERNAL);
    const s = sheet(page);
    await expect(s).toContainText('Файл «work» изменён другой программой');
    await expect(s.locator('li')).toHaveCount(2);
    await expect(s.locator('li').first()).toContainText('Моя версия');
    await expect(s.locator('li').first()).toContainText(/изменена в \d\d:\d\d/);
    await expect(s.locator('li').nth(1)).toContainText('Версия на диске');
    await expect(s.getByRole('button')).toHaveText(['Загрузить с диска', 'Оставить мою версию', 'Сравнить…']);
    await expect(btn(page, 'Сравнить…')).toBeFocused();
    await expect(page.locator('section.pane.active .tab.on')).toHaveClass(/dirty/);
    await page.keyboard.press('Enter');
    const cmp = page.getByRole('dialog', { name: 'Сравнение версий «work»' });
    await expect(cmp).toContainText('отличий: 1');
    await expect(cmp.locator('.ln.minus .tx')).toHaveText(['Свести заявки до конца месяца.']);
    await expect(cmp.locator('.ln.plus .tx')).toHaveText(['Свести заявки до 25 октября. моё']);
    await expect(cmp.locator('.ln.minus .sg')).toHaveText(['−']);
    await expect(cmp.locator('.ln.plus .sg')).toHaveText(['+']);
    await page.keyboard.press('Escape'); // back to the choice
    await expect(sheet(page)).toContainText('изменён другой программой');
    expect(await disk(page)).toBe(EXTERNAL); // nothing written meanwhile
  });

  test('«Загрузить с диска» takes the disk text and drops the dot; ⌘Z brings mine back', async ({ page }) => {
    await open(page);
    await editLocked(page);
    await setDisk(page, EXTERNAL);
    await btn(page, 'Загрузить с диска').click();
    await expect(line(page, 'Свести заявки')).toHaveText('Свести заявки до конца месяца.');
    await expect(page.locator('section.pane.active .tab.on')).not.toHaveClass(/dirty/);
    await line(page, 'План найма').click();
    await page.keyboard.press('Meta+z');
    await expect(line(page, 'Свести заявки')).toHaveText('Свести заявки до 25 октября. моё');
  });

  test('«Оставить мою версию» keeps the text, writes it over the disk and does not ask again until the next change', async ({ page }) => {
    await open(page);
    await editLocked(page);
    await setDisk(page, EXTERNAL);
    await unwritable(page);
    await btn(page, 'Оставить мою версию').click();
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => disk(page)).toBe(WORK.replace('до 25 октября.', 'до 25 октября. моё'));
    await page.waitForTimeout(600);
    await expect(sheet(page)).toHaveCount(0);
    // a change after that is a new conflict, if there are edits again
    await editLocked(page, '!');
    await setDisk(page, EXTERNAL);
    await expect(sheet(page)).toContainText('изменён другой программой');
  });

  test('Esc puts it off: the tab keeps the conflict; ⌘S asks again and writes nothing', async ({ page }) => {
    await open(page);
    await editLocked(page);
    await setDisk(page, EXTERNAL);
    await expect(sheet(page)).toContainText('изменён другой программой');
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await unwritable(page);
    await line(page, 'План найма').click();
    await page.keyboard.type(' ещё');
    await page.waitForTimeout(800);
    expect(await disk(page)).toBe(EXTERNAL); // autosave holds back while the conflict is open
    await page.keyboard.press('Meta+s');
    await expect(sheet(page)).toContainText('изменён другой программой');
    expect(await disk(page)).toBe(EXTERNAL);
  });

  test('closing the tab with «Сохранить» asks for the version first', async ({ page }) => {
    await open(page);
    await editLocked(page);
    await setDisk(page, EXTERNAL);
    await expect(sheet(page)).toContainText('изменён другой программой');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Meta+w');
    await expect(sheet(page)).toContainText('Сохранить изменения в «work»?');
    await unwritable(page);
    await btn(page, 'Сохранить').click();
    await expect(sheet(page)).toContainText('изменён другой программой');
    await btn(page, 'Оставить мою версию').click();
    await expect.poll(() => disk(page)).toContain('моё');
    await expect(page.locator('section.pane.active .tab')).toHaveCount(0);
  });

  test('a change found only when writing (no event) still asks before writing', async ({ page }) => {
    await open(page);
    await line(page, 'Свести заявки').click();
    await page.keyboard.press('End');
    await page.evaluate(([p, t]) => ((window as any).__disk[p] = t), [W, EXTERNAL]); // no watcher event
    await page.keyboard.type(' моё');
    await expect(sheet(page)).toContainText('изменён другой программой');
    expect(await disk(page)).toBe(EXTERNAL);
  });

  test('the same file in two panes: one question, the answer goes for both', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Второй редактор' }).click();
    await editLocked(page);
    await setDisk(page, EXTERNAL);
    await expect(sheet(page)).toHaveCount(1);
    await btn(page, 'Загрузить с диска').click();
    await expect(page.locator('section.pane').nth(0).locator('.cm-line', { hasText: 'Свести' })).toHaveText('Свести заявки до конца месяца.');
    await expect(page.locator('section.pane').nth(1).locator('.cm-line', { hasText: 'Свести' })).toHaveText('Свести заявки до конца месяца.');
  });

  test('a hidden tab is asked about only when it is shown', async ({ page }) => {
    await open(page);
    await editLocked(page);
    await page.keyboard.press('Meta+2');
    await setDisk(page, EXTERNAL);
    await page.waitForTimeout(600);
    await expect(sheet(page)).toHaveCount(0);
    await page.locator('section.pane.active .tab').first().click();
    await expect(sheet(page)).toContainText('изменён другой программой');
  });
});

test.describe('deleted or moved', () => {
  test('moved within the folder: the tab follows the new path quietly', async ({ page }) => {
    await open(page);
    await page.evaluate(([a, b]) => (window as any).__mvDisk(a, b), [W, '/mock/Архив/work-2026.org']);
    await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('work-2026');
    await expect(page.locator('.path')).toContainText('Архив');
    await expect(sheet(page)).toHaveCount(0);
  });

  test('deleted, no edits: the tab stays (italic, «Файла нет на диске»), gone from the navigator, closes without asking', async ({ page }) => {
    await open(page);
    await page.evaluate((p) => (window as any).__rmDisk(p), W);
    await expect(page.locator(`.nav .row[data-key="${W}"]`)).toHaveCount(0);
    const tab = page.locator('section.pane.active .tab.on');
    await expect(tab).toHaveClass(/gone/);
    expect(await tab.locator('.lbl').evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');
    await expect(page.locator('section.pane.active .status')).toContainText('Файла нет на диске');
    await expect(line(page, 'План найма')).toBeVisible(); // the text is still there
    await expect(sheet(page)).toHaveCount(0);
    await page.keyboard.press('Meta+w');
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('section.pane.active .tab')).toHaveCount(0);
  });

  test('deleted with edits: «Оставить открытой» keeps the text; ⌘S writes the file again at its path', async ({ page }) => {
    await open(page);
    await editLocked(page);
    await page.evaluate((p) => (window as any).__rmDisk(p), W);
    const s = sheet(page);
    await expect(s).toContainText('Файл «work» удалён или перемещён');
    await expect(s.getByRole('button')).toHaveText(['Закрыть без сохранения', 'Оставить открытой', 'Сохранить как…']);
    await expect(btn(page, 'Сохранить как…')).toBeFocused();
    await btn(page, 'Оставить открытой').click();
    await expect(line(page, 'Свести заявки')).toContainText('моё');
    await page.keyboard.press('Meta+s');
    await expect.poll(() => disk(page)).toContain('Свести заявки до 25 октября. моё');
    await expect(page.locator('section.pane.active .tab.on')).not.toHaveClass(/gone/);
  });

  test('deleted with edits: «Сохранить как…» suggests the old name; the tab moves to the new file', async ({ page }) => {
    await open(page);
    await editLocked(page);
    await page.evaluate((p) => (window as any).__rmDisk(p), W);
    await btn(page, 'Сохранить как…').click();
    const sa = page.getByRole('dialog', { name: 'Сохранить как' });
    await expect(sa.getByLabel('Сохранить как:')).toHaveValue('work');
    await sa.getByLabel('Сохранить как:').fill('work-копия');
    await page.keyboard.press('Enter');
    await expect.poll(() => disk(page, '/mock/work-копия.org')).toContain('моё');
    await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('work-копия');
  });

  test('deleted with edits: «Закрыть без сохранения» closes the tab', async ({ page }) => {
    await open(page);
    await editLocked(page);
    await page.evaluate((p) => (window as any).__rmDisk(p), W);
    await btn(page, 'Закрыть без сохранения').click();
    await expect(page.locator('section.pane.active .tab')).toHaveCount(0);
  });

  test('deleted in the navigator (here): its tab closes as before', async ({ page }) => {
    await open(page);
    await page.locator(`.nav .row[data-key="${W}"]`).click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Корзину/ }).click();
    await page.getByRole('button', { name: /Переместить в Корзину|Удалить/ }).last().click();
    await expect(page.locator('section.pane.active .tab')).toHaveCount(0);
  });
});
