import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';
import { FILES } from './kanbanFixture';

// fix-49-2 §1: the view is the file's, not the tab's — another file opened in the same tab is shown as that file is;
// every tab of a file shows it the same; a rename takes the view along; a saved tab's own view (before) becomes its
// file's.

const P = '/mock/work/platform.org';
const I = '/mock/inbox.org'; // a board of its own («#+BOARD»)
const A = '/mock/a.org'; // no board
const board = (page: Page) => page.locator('.kanban');
const run = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(async ([f, a]) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    const idx = (p: string) => store.files.findIndex((x: { path: string }) => x.path === p);
    const tab = () => store.layout.panes[store.layout.active].tabs[store.layout.panes[store.layout.active].active];
    const fns: Record<string, (...x: any[]) => unknown> = {
      open: (p: string) => store.open(idx(p), 0),
      showAs: (v: string) => store.showAs(tab(), v),
      views: () => store.layout.panes.map((p: any) => p.tabs.map((t: any) => `${t.path?.split('/').pop()}:${store.viewOf(t) || 'text'}`)),
      split: () => store.splitRight(),
      dup: () => store.duplicateTab(store.layout.active, store.layout.panes[store.layout.active].active),
      rename: (rel: string, name: string) => store.renameEntry(rel, name),
      memory: () => (store as any).viewMemory,
    };
    return fns[f as string](...(a as unknown[]));
  }, [fn, args] as const);

async function open(page: Page, local: Record<string, string> = {}) {
  const files = { ...FILES(true), [I]: '#+BOARD: Задачи\n* TODO x\n', [A]: '* TODO a\n' };
  await openApp(page, { files, ready: false, local, viewport: { width: 1600, height: 900 } });
  await pluginsReady(page);
}

test('the board of one file stays its own: another file in the same tab is text; back — the board again', async ({ page }) => {
  await open(page);
  await run(page, 'open', P);
  await expect(board(page)).toBeVisible(); // «#+BOARD»: a board by default
  await run(page, 'open', A);
  await expect(board(page)).toHaveCount(0);
  await expect(page.locator('section.pane .cm-content').first()).toBeVisible();
  await run(page, 'open', P);
  await expect(board(page)).toBeVisible();
  // platform.org as text, then inbox.org in the same tab: its own board; back — the text
  await run(page, 'showAs', '');
  await expect(board(page)).toHaveCount(0);
  await run(page, 'open', I);
  await expect(board(page)).toBeVisible();
  await run(page, 'open', P);
  await expect(board(page)).toHaveCount(0);
  await expect.poll(() => run(page, 'views')).toEqual([['platform.org:text']]);
});

test('every tab of a file shows it the same; switching one switches all; a rename keeps the view', async ({ page }) => {
  await open(page);
  await run(page, 'open', I);
  await run(page, 'split'); // the neighbour editor, with the same file
  await expect.poll(() => run(page, 'views')).toEqual([['inbox.org:kanban.board'], ['inbox.org:kanban.board']]);
  await run(page, 'showAs', '');
  await expect.poll(() => run(page, 'views')).toEqual([['inbox.org:text'], ['inbox.org:text']]);
  await run(page, 'showAs', 'kanban.board');
  await run(page, 'rename', 'inbox.org', 'Входящие');
  await expect.poll(() => run(page, 'views')).toEqual([['Входящие.org:kanban.board'], ['Входящие.org:kanban.board']]);
  expect(await run(page, 'memory')).toEqual({ 'Входящие.org': 'kanban.board' });
});

test('a saved layout from before: a plain tab\'s own view becomes its file\'s, unless the file has one', async ({ page }) => {
  const layout = JSON.stringify({ v: 1, active: 0, ratio: 0.5, panes: [{ active: 0, tabs: [
    { kind: 'file', path: A, cursor: { line: 0, col: 0 }, view: '' },
    { kind: 'file', path: P, cursor: { line: 0, col: 0 }, view: 'kanban.board' },
  ] }] });
  await open(page, { 'layout:/mock': layout, 'fileView:/mock': JSON.stringify({ 'work/platform.org': '' }) });
  await expect.poll(() => run(page, 'memory')).toEqual({ 'work/platform.org': '', 'a.org': '' });
  await expect.poll(() => run(page, 'views')).toEqual([['a.org:text', 'platform.org:text']]);
});
