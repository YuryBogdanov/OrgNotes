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

test('Option+Left/Right promote and demote the heading alone; with Shift, the whole subtree', async ({ page }) => {
  await open(page);
  await place(page, 'Alpha one', 'end');
  // "Alpha one" matches "Alpha one deep" too: pick the exact level-2 line
  await page.locator('.cm-line', { hasText: /^\*\* Alpha one$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Alt+ArrowRight'); // the heading alone: «Alpha one deep» stays at level 3
  await expect.poll(async () => doc(page)).toContain('*** Alpha one\none body\n*** Alpha one deep\n** Alpha two');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(async () => doc(page)).toContain('** Alpha one\none body\n*** Alpha one deep\n** Alpha two');
  await page.keyboard.press('Alt+Shift+ArrowRight'); // with its subtree
  await expect.poll(async () => doc(page)).toContain('*** Alpha one\none body\n**** Alpha one deep\n** Alpha two');
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await page.keyboard.press('Alt+Shift+ArrowLeft');
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
  // the lines' text (the file's: in the structural view only one star of a heading is seen)
  const headings = async () =>
    (await page.locator('.cm-line').allTextContents()).filter((t) => /^\*+ /.test(t)).map((t) => t.replace(/…$/, ''));
  const bodies = async () => (await page.locator('.cm-line').allTextContents()).filter((t) => /body/.test(t));

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

const CONFIG = JSON.stringify({
  version: 1,
  workflows: [
    { name: 'Задачи', states: [{ name: 'NEW' }, { name: 'TODO' }, { name: 'DONE', done: true }] },
    { name: 'Встречи', states: [{ name: 'MEETING' }, { name: 'FINISHED', done: true }] },
    { name: 'Цели', states: [{ name: 'BACKLOG' }, { name: 'ACTIVE' }, { name: 'COMPLETED', done: true }] },
  ],
});

test.describe('status rotation', () => {
  const openStatuses = async (page: Page, line = '* Заметка') => {
    await installTauriMock(page, { '/mock/Keys.org': `${line}\nтекст\n`, '/mock/.orgnotes/config.json': CONFIG });
    await page.goto('/');
    await expect(page.locator('.cm-content')).toContainText('текст');
    await page.locator('.cm-line').first().click();
    await page.keyboard.press('End');
  };
  const firstLine = (page: Page) => page.locator('.cm-line').first().innerText();

  test('Shift+Right walks the statuses of the heading\'s workflow and removes the status after the last', async ({ page }) => {
    await openStatuses(page);
    await page.keyboard.press('Shift+ArrowRight');
    expect(await firstLine(page)).toBe('* NEW Заметка'); // none -> first status of the first workflow
    await page.keyboard.press('Shift+ArrowRight');
    expect(await firstLine(page)).toBe('* TODO Заметка');
    await page.keyboard.press('Shift+ArrowRight');
    expect(await firstLine(page)).toBe('* DONE Заметка');
    await page.keyboard.press('Shift+ArrowRight');
    expect(await firstLine(page)).toBe('* Заметка'); // after the last: plain heading
  });

  test('Shift+Left goes back and clears the status on the first status of any workflow', async ({ page }) => {
    await openStatuses(page, '* TODO Заметка');
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await firstLine(page)).toBe('* NEW Заметка');
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await firstLine(page)).toBe('* Заметка');
    await page.keyboard.press('Shift+ArrowLeft'); // no status: first status of the first workflow again
    expect(await firstLine(page)).toBe('* NEW Заметка');
  });

  test('a status that is the first of a later workflow is cleared by Shift+Left too', async ({ page }) => {
    await openStatuses(page, '* ACTIVE Цель');
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await firstLine(page)).toBe('* BACKLOG Цель');
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await firstLine(page)).toBe('* Цель');
  });

  test('Ctrl+Shift+Right jumps to the first status of the next workflow, and off the last', async ({ page }) => {
    await openStatuses(page);
    await page.keyboard.press('Control+Shift+ArrowRight');
    expect(await firstLine(page)).toBe('* NEW Заметка');
    await page.keyboard.press('Control+Shift+ArrowRight');
    expect(await firstLine(page)).toBe('* MEETING Заметка');
    await page.keyboard.press('Control+Shift+ArrowRight');
    expect(await firstLine(page)).toBe('* BACKLOG Заметка');
    await page.keyboard.press('Control+Shift+ArrowRight');
    expect(await firstLine(page)).toBe('* Заметка');
  });

  test('Ctrl+Shift+Left goes to the previous workflow and clears the status from the first one', async ({ page }) => {
    await openStatuses(page, '* COMPLETED Цель');
    await page.keyboard.press('Control+Shift+ArrowLeft');
    expect(await firstLine(page)).toBe('* MEETING Цель');
    await page.keyboard.press('Control+Shift+ArrowLeft');
    expect(await firstLine(page)).toBe('* NEW Цель');
    await page.keyboard.press('Control+Shift+ArrowLeft');
    expect(await firstLine(page)).toBe('* Цель');
  });

  test('finishing sets CLOSED, leaving removes it, the caret stays on the heading', async ({ page }) => {
    await openStatuses(page, '* TODO Заметка');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.locator('.cm-line').nth(1)).toContainText('CLOSED:');
    await page.keyboard.type('!');
    expect(await firstLine(page)).toBe('* DONE Заметка!');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(page.locator('.cm-content')).not.toContainText('CLOSED:');
    expect(await firstLine(page)).toBe('* TODO Заметка!');
  });

  test('in body text Shift+arrows still select', async ({ page }) => {
    await openStatuses(page);
    await page.locator('.cm-line', { hasText: 'текст' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.type('X');
    await expect(page.locator('.cm-line', { hasText: 'текс' })).toHaveText('тексX'); // the selected last letter was replaced
    expect(await firstLine(page)).toBe('* Заметка');
  });
});

test('the bug: a new heading after «1-1 meetings», then ⌥→ — the meetings below stay its siblings', async ({ page }) => {
  await installTauriMock(page, { '/mock/Keys.org': '* Employee\n** 1-1 meetings\n*** Second 1-1 meeting\n*** First 1-1 meeting\n' });
  await page.goto('/');
  await page.locator('.cm-line', { hasText: '1-1 meetings' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.type('Third 1-1 meeting');
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => doc(page)).toBe('* Employee\n** 1-1 meetings\n*** Third 1-1 meeting\n*** Second 1-1 meeting\n*** First 1-1 meeting\n');
});
