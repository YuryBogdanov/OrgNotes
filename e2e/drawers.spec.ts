import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ «Сворачивание drawers (:PROPERTIES:, :LOGBOOK:)».
const IB = '/mock/inbox.org';
const INBOX = [
  '#+TITLE: Inbox',
  '',
  '* TODO Позвонить в банк про лимиты',
  ':PROPERTIES:',
  ':CREATED: [2026-10-11 Sun 09:12]',
  ':END:',
  'по карте компании, уточнить комиссию',
  '* TODO Согласовать отпуск с тимлидами',
  ':PROPERTIES:',
  ':CREATED: [2026-10-10 Sat 18:40]',
  ':END:',
  'до пятницы',
  '* DONE Продлить домен',
  'CLOSED: [2026-10-09 Fri 16:20]',
  ':LOGBOOK:',
  '- State "DONE"       from "TODO"       [2026-10-09 Fri 16:20]',
  ':END:',
  '* TODO Незакрытый',
  ':NOTES:',
  'без конца',
  '* TODO Пример',
  '#+BEGIN_SRC org',
  ':PROPERTIES:',
  ':END:',
  '#+END_SRC',
  '',
].join('\n');
const FILES = (cfg: object = { version: 1, inbox: { file: 'inbox.org' } }) => ({
  [IB]: INBOX,
  '/mock/work.org': '* Q4\n',
  '/mock/.orgnotes/config.json': JSON.stringify(cfg),
});

const lines = (page: Page) => page.locator('section.pane.active .cm-content .cm-line');
const line = (page: Page, text: string) => lines(page).filter({ hasText: text }).first();
const pills = (page: Page) => page.locator('section.pane.active .cm-foldPlaceholder');
const numbers = (page: Page) => page.locator('section.pane.active .cm-lineNumbers .cm-gutterElement').allInnerTexts();
const disk = (page: Page, p = IB) => page.evaluate((p) => (window as any).__disk[p] as string, p);

async function open(page: Page, files: Record<string, string> = FILES(), init?: () => void) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (init) await page.addInitScript(init);
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.locator('.nav .row[data-key="/mock/inbox.org"]').click();
  await expect(line(page, 'Позвонить в банк')).toBeVisible();
}

test.describe('folded when a file opens', () => {
  test('one line per drawer with «…», the line numbers jump; unclosed and #+BEGIN ones stay as text; the file is not changed', async ({ page }) => {
    await open(page);
    await expect(pills(page)).toHaveCount(3);
    await expect(line(page, ':CREATED:')).toHaveCount(0);
    await expect(line(page, 'State "DONE"')).toHaveCount(0);
    await expect(pills(page).first()).toHaveAttribute('title', 'Свёрнуто — Tab или клик, чтобы развернуть');
    const n = (await numbers(page)).filter((x) => /^\d+$/.test(x));
    expect(n.slice(0, 6)).toEqual(['1', '2', '3', '4', '7', '8']); // 4 → 7
    await expect(line(page, 'без конца')).toBeVisible(); // :NOTES: without :END:
    await expect(lines(page).filter({ hasText: /^:PROPERTIES:/ })).toHaveCount(3); // two folded («:PROPERTIES:…») + the one in #+BEGIN_SRC
    await expect(line(page, '#+BEGIN_SRC').locator('xpath=following-sibling::div[1]')).toHaveText(':PROPERTIES:');
    expect(await disk(page)).toBe(INBOX);
  });

  test('the setting off: drawers open; Tab still folds one', async ({ page }) => {
    await open(page, FILES(), () => localStorage.setItem('editor:drawers', '0'));
    await expect(pills(page)).toHaveCount(0);
    await expect(line(page, ':CREATED: [2026-10-11')).toBeVisible();
    await line(page, 'Позвонить в банк').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(pills(page)).toHaveCount(1);
  });
});

test.describe('Tab, the mouse and the cycle', () => {
  test('Tab on a drawer line opens and closes only it; arrows pass a folded one as one line', async ({ page }) => {
    await open(page);
    await line(page, 'Согласовать отпуск').click();
    await page.keyboard.press('ArrowDown'); // its :PROPERTIES:
    await page.keyboard.press('Tab');
    await expect(line(page, ':CREATED: [2026-10-10')).toBeVisible();
    await expect(line(page, ':CREATED: [2026-10-11')).toHaveCount(0); // the other one stays
    await expect(pills(page)).toHaveCount(2);
    await page.keyboard.press('Tab');
    await expect(line(page, ':CREATED: [2026-10-10')).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('section.pane.active .cm-activeLine')).toHaveText('до пятницы');
    expect(await disk(page)).toBe(INBOX);
  });

  test('a click on «…» opens it; the arrow in the gutter closes it again', async ({ page }) => {
    await open(page);
    await pills(page).first().click();
    await expect(line(page, ':CREATED: [2026-10-11')).toBeVisible();
    await expect(pills(page)).toHaveCount(2);
    await page.locator('section.pane.active .cm-foldGutter .cm-gutterElement').filter({ hasText: '⌄' }).nth(1).click(); // line 4: the open :PROPERTIES:
    await expect(line(page, ':CREATED: [2026-10-11')).toHaveCount(0);
    await expect(pills(page)).toHaveCount(3);
  });

  test('Tab on a heading and ⇧Tab do not open drawers', async ({ page }) => {
    await open(page);
    await line(page, 'Позвонить в банк').click();
    await page.keyboard.press('Tab'); // fold the subtree
    await expect(line(page, 'по карте компании')).toHaveCount(0);
    await page.keyboard.press('Tab'); // and open it
    await expect(line(page, 'по карте компании')).toBeVisible();
    await expect(line(page, ':CREATED: [2026-10-11')).toHaveCount(0);
    for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+Tab'); // everything folded, then open (one level here)
    await expect(line(page, 'до пятницы')).toBeVisible();
    await expect(line(page, ':CREATED:')).toHaveCount(0);
    await expect(pills(page)).toHaveCount(3);
  });
});

test.describe('drawers the app adds come folded; hand-typed ones stay open', () => {
  test('a status change that writes :LOGBOOK: adds one line', async ({ page }) => {
    await open(page, FILES({ version: 1, inbox: { file: 'inbox.org' }, behavior: { logbook: true } }));
    const before = await lines(page).count();
    await line(page, 'Согласовать отпуск').click();
    await page.keyboard.press('Shift+ArrowRight'); // TODO → the next open status: a :LOGBOOK: line is written
    await expect.poll(() => disk(page)).toContain('Согласовать отпуск с тимлидами\n:PROPERTIES:');
    await expect(lines(page).filter({ hasText: /^:LOGBOOK:…$/ })).toHaveCount(2); // the DONE one and the new one
    await expect(line(page, '- State')).toHaveCount(0);
    expect(await lines(page).count()).toBe(before + 1);
  });

  test('a quick entry into the open Inbox file: its :PROPERTIES: folded', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Shift+Meta+i');
    await page.keyboard.type('Новая');
    await page.keyboard.press('Enter');
    await expect(line(page, 'TODO Новая')).toBeVisible();
    await expect(pills(page)).toHaveCount(4);
    await expect(line(page, ':CREATED:')).toHaveCount(0);
  });

  test('a drawer typed by hand stays open, the caret stays in it', async ({ page }) => {
    await open(page);
    await line(page, 'до пятницы').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(':NOTES:');
    await page.keyboard.press('Enter');
    await page.keyboard.type('заметка');
    await page.keyboard.press('Enter');
    await page.keyboard.type(':END:');
    await expect(line(page, 'заметка')).toBeVisible();
    await expect(pills(page)).toHaveCount(3);
    await page.keyboard.type(' x');
    await expect(page.locator('section.pane.active .cm-activeLine')).toHaveText(':END: x');
  });

  test('changed on disk: an opened drawer stays open, a new one comes folded; a broken one shows its text', async ({ page }) => {
    await open(page);
    await pills(page).first().click(); // open the first one
    await expect(line(page, ':CREATED: [2026-10-11')).toBeVisible();
    const next = INBOX.replace('до пятницы\n', 'до пятницы\n:LOGBOOK:\n- note\n:END:\n').replace(':CREATED: [2026-10-10 Sat 18:40]\n:END:\n', ':CREATED: [2026-10-10 Sat 18:40]\n');
    await page.evaluate(([p, t]) => (window as any).__setDisk(p, t), [IB, next]);
    await expect(line(page, '- note')).toHaveCount(0); // the new :LOGBOOK: folded
    await expect(line(page, ':CREATED: [2026-10-11')).toBeVisible(); // still open
    await expect(line(page, ':CREATED: [2026-10-10')).toBeVisible(); // no :END: any more: plain text
  });
});

test.describe('only the view', () => {
  test('a selection over a folded drawer takes its hidden lines; ⌘Z putting the caret inside opens it', async ({ page }) => {
    await open(page);
    await line(page, 'по карте компании').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+ArrowUp'); // up over the folded drawer to the heading (Shift+↓ on it is the priority)
    await page.keyboard.type('X');
    await expect.poll(() => disk(page)).toContain('Xпо карте компании'); // (the star marker stays: the caret cannot go before it)
    expect(await disk(page)).not.toContain('Позвонить в банк');
    expect(await disk(page)).not.toContain(':CREATED: [2026-10-11'); // the hidden lines went with the selection
    await page.keyboard.press('Meta+z');
    await expect.poll(() => disk(page)).toBe(INBOX);
    // typing inside an opened drawer, folding it, then ⌘Z: the caret goes back inside, the drawer opens
    await pills(page).first().click();
    await line(page, ':CREATED: [2026-10-11').click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await line(page, 'Позвонить в банк').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(line(page, ':CREATED: [2026-10-11')).toHaveCount(0);
    await page.keyboard.press('Meta+z');
    await expect(line(page, ':CREATED: [2026-10-11 Sun 09:12]')).toBeVisible();
    await expect.poll(() => disk(page)).toBe(INBOX);
  });
});

test('the switch in Settings › Основные › Drawers is kept on this Mac', async ({ page }) => {
  await installTauriMock(page, FILES());
  await page.goto('/#settings');
  await page.getByRole('tab', { name: 'Основные' }).click();
  const sw = page.getByRole('switch', { name: 'Сворачивать drawers при открытии файла' });
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => localStorage.getItem('editor:drawers'))).toBe('0');
});
