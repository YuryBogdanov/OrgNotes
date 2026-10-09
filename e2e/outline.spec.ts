import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

const DOC = [
  '#+TITLE: Org keys',
  '',
  '* Alpha',
  'alpha body',
  '** Alpha one',
  'one body',
  '*** Alpha one deep',
  '** Alpha two',
  '* Beta',
  'beta body',
  '* Gamma',
  '',
].join('\n');

const open = async (page: Page, text = DOC) => {
  await installTauriMock(page, { '/mock/Keys.org': text });
  await page.goto('/');
  await expect(page.locator('.cm-content')).toContainText('Org keys');
};
const doc = (page: Page) => page.evaluate(() => (window as any).__disk['/mock/Keys.org'] as string);
/** Editor text as the user sees it (folded text is hidden). */
const visible = async (page: Page) => (await page.locator('.cm-line').allInnerTexts()).filter((t) => t.trim() !== '' || true);
const place = async (page: Page, text: string, where: 'end' | 'start' = 'end') => {
  await page.locator('.cm-line', { hasText: text }).first().click();
  await page.keyboard.press(where === 'end' ? 'End' : 'Home');
};
const editorText = (page: Page) => page.locator('.cm-content').evaluate((el) => (el as any).cmView?.view?.state?.doc?.toString() as string | undefined);
const saved = async (page: Page, expected: string) => {
  await expect.poll(async () => doc(page)).toBe(expected);
};
const cursorLine = async (page: Page) => {
  const t = await page.locator('.status').innerText();
  return +/Стр\. (\d+)/.exec(t)![1];
};

test('Option+Enter makes a heading of the current level, at root, in content and on deeper levels', async ({ page }) => {
  await open(page);
  // on the level-1 heading's content -> level 1
  await place(page, 'beta body');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.type('Delta');
  // on a level-2 heading -> level 2
  await place(page, 'Alpha two');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.type('Alpha three');
  // on a level-3 heading -> level 3
  await place(page, 'Alpha one deep');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.type('Deeper');
  // before the first heading -> level 1
  await place(page, 'Org keys');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.type('Intro');

  await expect.poll(async () => doc(page)).toContain('#+TITLE: Org keys\n* Intro\n');
  const d = await doc(page);
  expect(d).toContain('beta body\n* Delta\n');
  expect(d).toContain('** Alpha two\n** Alpha three\n');
  expect(d).toContain('*** Alpha one deep\n*** Deeper\n');
});

test('Option+Shift+Enter starts the new heading as a task', async ({ page }) => {
  await open(page);
  await place(page, 'Gamma');
  await page.keyboard.press('Alt+Shift+Enter');
  await page.keyboard.type('Plan');
  await expect.poll(async () => doc(page)).toContain('* Gamma\n* TODO Plan\n');
});

test('Option+Left/Right promote and demote the heading with its whole subtree', async ({ page }) => {
  await open(page);
  await place(page, 'Alpha one', 'end');
  // "Alpha one" matches "Alpha one deep" too: pick the exact level-2 line
  await page.locator('.cm-line', { hasText: /^\*\* Alpha one$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => doc(page)).toContain('*** Alpha one\none body\n**** Alpha one deep\n** Alpha two');
  await page.keyboard.press('Alt+ArrowLeft');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(async () => doc(page)).toContain('* Alpha one\none body\n** Alpha one deep\n** Alpha two');
  // a level-1 heading cannot go higher: nothing happens, no word jump either
  const before = await doc(page);
  await page.keyboard.press('Alt+ArrowLeft');
  await page.waitForTimeout(700);
  expect(await doc(page)).toBe(before);
});

test('Option+Up/Down move the subtree among its siblings and the caret goes with it', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: /^\* Beta$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Alt+ArrowUp');
  await saved(
    page,
    DOC.replace('* Alpha\nalpha body\n** Alpha one\none body\n*** Alpha one deep\n** Alpha two\n* Beta\nbeta body\n', '* Beta\nbeta body\n* Alpha\nalpha body\n** Alpha one\none body\n*** Alpha one deep\n** Alpha two\n'),
  );
  // the caret is still on "* Beta": typing lands there
  await page.keyboard.type('!');
  await expect(page.locator('.cm-activeLine')).toHaveText('* Beta!');
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(async () => doc(page)).toContain('* Gamma\n* Beta!\nbeta body\n');
  // already last: nothing moves
  const before = await doc(page);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(700);
  expect(await doc(page)).toBe(before);
});

test('one undo reverts one structural command', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: /^\* Beta$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(async () => {
    const d = await doc(page);
    return d.indexOf('* Beta') < d.indexOf('* Alpha');
  }).toBe(true);
  await page.keyboard.press('Meta+z');
  await saved(page, DOC);
});

test('Shift+Up/Down set the priority on a heading line and select text elsewhere', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: /^\* Beta$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => doc(page)).toContain('* [#B] Beta\n');
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => doc(page)).toContain('* [#A] Beta\n');
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => doc(page)).toContain('* [#B] Beta\n');
  // in body text Shift+Arrow is still plain selection, nothing is written
  await place(page, 'beta body');
  const before = await doc(page);
  await page.keyboard.press('Shift+ArrowUp');
  await page.waitForTimeout(700);
  expect(await doc(page)).toBe(before);
});

test('Shift+Tab folds everything, then opens level by level, then everything, then folds again', async ({ page }) => {
  await open(page);
  const headings = async () =>
    (await page.locator('.cm-line').allInnerTexts()).filter((t) => /^\*+ /.test(t)).map((t) => t.replace(/…$/, ''));
  const bodies = async () => (await page.locator('.cm-line').allInnerTexts()).filter((t) => /body/.test(t));

  await page.locator('.cm-line', { hasText: /^\* Gamma$/ }).click();
  await page.keyboard.press('Shift+Tab'); // everything folded
  expect(await headings()).toEqual(['* Alpha', '* Beta', '* Gamma']);
  expect(await bodies()).toEqual([]);

  await page.keyboard.press('Shift+Tab'); // level 1 open: level-2 headings appear
  expect(await headings()).toEqual(['* Alpha', '** Alpha one', '** Alpha two', '* Beta', '* Gamma']);
  expect(await bodies()).toEqual(['alpha body', 'beta body']);

  await page.keyboard.press('Shift+Tab'); // level 2 open: level-3 appears
  expect(await headings()).toEqual(['* Alpha', '** Alpha one', '*** Alpha one deep', '** Alpha two', '* Beta', '* Gamma']);

  await page.keyboard.press('Shift+Tab'); // everything open (max level is 3: this is the last step)
  expect(await bodies()).toEqual(['alpha body', 'one body', 'beta body']);

  await page.keyboard.press('Shift+Tab'); // and around again
  expect(await headings()).toEqual(['* Alpha', '* Beta', '* Gamma']);
});

test('Tab still folds and unfolds the heading under the caret', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: /^\* Alpha$/ }).click();
  await page.keyboard.press('Tab');
  await expect(page.locator('.cm-line', { hasText: 'alpha body' })).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(page.locator('.cm-line', { hasText: 'alpha body' })).toHaveCount(1);
});

test('Option+Left/Right still move by word in body text', async ({ page }) => {
  await open(page);
  await place(page, 'alpha body', 'end');
  await page.keyboard.press('Alt+ArrowLeft');
  await page.keyboard.type('X');
  await expect(page.locator('.cm-activeLine')).toHaveText('alpha Xbody');
});
