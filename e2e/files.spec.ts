import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

const FILES = () => ({
  '/mock/Index.org': '#+TITLE: Index\n\n* Ссылки\nСм. [[file:Weekly.org::*Первая][неделя]] и [[file:Other.org]].\n',
  '/mock/Weekly.org': '#+TITLE: Weekly\n\n* TODO Первая\nназад: [[file:Index.org]]\n* TODO Вторая\n',
  '/mock/Other.org': '* Другая\n',
  '/mock/Team/lead.org': '* Тимлид\nсм. [[file:../Weekly.org]]\n',
});

const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const log = (page: Page) => page.evaluate(() => (window as any).__log as unknown[][]);
const open = async (page: Page, files: Record<string, string> = FILES()) => {
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.nav .row').first()).toBeVisible();
};
const row = (page: Page, label: string) => page.locator('.nav .row').filter({ has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) });
const menuItem = (page: Page, name: string) => page.getByRole('menuitem', { name });

test('creates a file from the + menu, opens it and writes a title', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Создать…' }).click();
  await menuItem(page, 'Новый файл').click();
  await page.getByRole('textbox', { name: 'Имя нового файла' }).fill('Идеи');
  await page.keyboard.press('Enter');

  await expect(page.locator('.tab')).toContainText('Идеи');
  expect((await disk(page))['/mock/Идеи.org']).toBe('#+TITLE: Идеи\n\n');
  await expect(row(page, 'Идеи')).toBeVisible();
});

test('creates a folder, including an empty one, from the empty-area menu', async ({ page }) => {
  await open(page);
  await page.locator('.nav .list').click({ button: 'right', position: { x: 60, y: 560 } });
  await menuItem(page, 'Новая папка').click();
  await page.getByRole('textbox', { name: 'Имя новой папки' }).fill('Архив');
  await page.keyboard.press('Enter');

  await expect(row(page, 'Архив')).toBeVisible();
});

test('rejects a clashing name with a message and changes nothing', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Создать…' }).click();
  await menuItem(page, 'Новый файл').click();
  await page.getByRole('textbox', { name: 'Имя нового файла' }).fill('Other');
  await page.keyboard.press('Enter');

  await expect(page.locator('.status')).toContainText('уже существует');
  expect((await disk(page))['/mock/Other.org']).toBe('* Другая\n');
});

test('renames a note and repairs links that point at it', async ({ page }) => {
  await open(page);
  await row(page, 'Weekly').click({ button: 'right' });
  await menuItem(page, 'Переименовать').click();
  await page.getByRole('textbox', { name: 'Новое имя' }).fill('Неделя');
  await page.keyboard.press('Enter');

  await expect(row(page, 'Неделя')).toBeVisible();
  await expect(row(page, 'Weekly')).toHaveCount(0);
  await expect(page.locator('.status')).toContainText('Обновлено ссылок: 2');
  await expect.poll(async () => (await disk(page))['/mock/Index.org']).toContain('[[file:Неделя.org::*Первая][неделя]]');
  await expect.poll(async () => (await disk(page))['/mock/Team/lead.org']).toContain('[[file:../Неделя.org]]');
  // unrelated link untouched
  expect((await disk(page))['/mock/Index.org']).toContain('[[file:Other.org]]');
});

test('moves a note into a folder via the dialog and recomputes its own relative links', async ({ page }) => {
  await open(page);
  await row(page, 'Weekly').click({ button: 'right' });
  await menuItem(page, 'Переместить…').click();
  await page.getByRole('option', { name: /Team/ }).click();

  await expect.poll(async () => Object.keys(await disk(page))).toContain('/mock/Team/Weekly.org');
  const d = await disk(page);
  expect(d['/mock/Weekly.org']).toBeUndefined();
  await expect.poll(async () => (await disk(page))['/mock/Index.org']).toContain('[[file:Team/Weekly.org::*Первая][неделя]]');
  // the moved note now lives one level down: its link to Index must go up
  await expect.poll(async () => (await disk(page))['/mock/Team/Weekly.org']).toContain('[[file:../Index.org]]');
  // a note next to it that pointed at it with ../ now points at a sibling
  await expect.poll(async () => (await disk(page))['/mock/Team/lead.org']).toContain('[[file:Weekly.org]]');
});

test('moves a note by dropping it onto a folder, and refuses a folder dropped into itself', async ({ page }) => {
  await open(page);
  // Playwright cannot start a native drag in WebKit, so the HTML5 drag events are dispatched directly.
  const drag = (from: string, to: string) =>
    page.evaluate(
      ([a, b]) => {
        const find = (label: string) =>
          [...document.querySelectorAll('.nav .row')].find((r) => r.querySelector('.label')?.textContent === label) as HTMLElement;
        const dt = new DataTransfer();
        const src = find(a);
        const dst = find(b);
        src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      },
      [from, to],
    );
  await drag('Other', 'Team');
  await expect.poll(async () => Object.keys(await disk(page))).toContain('/mock/Team/Other.org');
  expect(Object.keys(await disk(page))).not.toContain('/mock/Other.org');

  // a folder onto itself does nothing
  await drag('Team', 'Team');
  await page.waitForTimeout(300);
  expect(Object.keys(await disk(page))).toContain('/mock/Team/lead.org');
});

test('deleting asks first, sends to the Trash and closes the file\'s tab', async ({ page }) => {
  await open(page);
  await row(page, 'Other').click();
  await expect(page.locator('.tab')).toContainText('Other');

  await row(page, 'Other').click({ button: 'right' });
  await menuItem(page, 'Переместить в Корзину…').click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Other');
  await expect(dlg).toContainText('восстановить');
  // cancelling deletes nothing
  await dlg.getByRole('button', { name: 'Отмена' }).click();
  expect((await disk(page))['/mock/Other.org']).toBeDefined();

  await row(page, 'Other').click({ button: 'right' });
  await menuItem(page, 'Переместить в Корзину…').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Переместить в Корзину' }).click();

  await expect(row(page, 'Other')).toHaveCount(0);
  expect((await log(page)).some((e) => e[0] === 'trash' && e[1] === '/mock/Other.org')).toBe(true);
  // its tab is closed; it was the only one, so the pane shows its empty state
  await expect(page.locator('.tab', { hasText: 'Other' })).toHaveCount(0);
  await expect(page.getByText('Нет открытых вкладок')).toBeVisible();
});

test('unsaved typing is not lost when the note is renamed right after', async ({ page }) => {
  await open(page);
  await row(page, 'Other').click();
  await page.locator('.cm-line', { hasText: 'Другая' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!!!', { delay: 20 });

  await row(page, 'Other').click({ button: 'right' });
  await menuItem(page, 'Переименовать').click();
  await page.getByRole('textbox', { name: 'Новое имя' }).fill('Прочее');
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await disk(page))['/mock/Прочее.org']).toBe('* Другая!!!\n');
  await expect(page.locator('.tab')).toContainText('Прочее');
});
