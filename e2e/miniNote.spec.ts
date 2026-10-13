import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ 31, PR B1: the note in the mini window — the same state of the files as the main window (it mirrors them: the
// main window sends them, it sends its edits back), a heading narrowed or a file whole, ⌘P, ⌥↩ on the root, «Доступно
// в главном окне». Here the mini window's page is driven alone: what the main window would send is sent by hand.

const W = '/mock/Work.org';
const TEXT = '* Созвон\n** Что показали\n- миграция биллинга\n* Другое\nтекст\n';
const log = (page: Page) => page.evaluate(() => (window as any).__log as unknown[][]);
const edits = async (page: Page) => (await log(page)).filter((e) => e[0] === 'emit' && e[2] === 'mini-edit').map((e) => (e[3] as { text: string }).text);
const send = (page: Page, event: string, payload: unknown) => page.evaluate(([e, p]) => (window as any).__emitEvent(e, p), [event, payload] as const);
const snapshot = (text = TEXT, note: unknown = { path: 'Work.org', line: 0, title: 'Созвон' }) => ({
  dir: '/mock', configRaw: null, note,
  files: [{ name: 'Work.org', path: W, text, disk: text, diskRaw: text, eol: '\n' }, { name: 'Дом.org', path: '/mock/Дом.org', text: '* Покупки\n', disk: '* Покупки\n', diskRaw: '* Покупки\n', eol: '\n' }],
});
const mini = (page: Page) => page.getByRole('application', { name: 'Мини-окно' });
const lines = (page: Page) => mini(page).locator('.cm-line');

async function open(page: Page, note?: unknown) {
  await page.setViewportSize({ width: 440, height: 330 });
  await page.addInitScript(() => localStorage.clear());
  await installTauriMock(page, {});
  await page.goto('/#mini');
  await expect(mini(page)).toBeVisible();
  await expect.poll(async () => (await log(page)).some((e) => e[0] === 'emit' && e[2] === 'mini-hello')).toBe(true); // it asks the main window
  await send(page, 'mini-snapshot', snapshot(TEXT, note === undefined ? { path: 'Work.org', line: 0, title: 'Созвон' } : note));
}

test('the heading narrowed: its subtree only, no gutter; the header; typing goes to the main window', async ({ page }) => {
  await open(page);
  await expect(mini(page).locator('header .path')).toHaveText(/Work\.org ›\s*Созвон/);
  await expect(lines(page)).toHaveText(['* Созвон', '** Что показали', '- миграция биллинга']);
  await expect(mini(page).locator('.cm-lineNumbers')).toHaveCount(0);
  await page.keyboard.type(' и тарифов'); // the caret is at the end of the subtree
  await expect.poll(async () => (await edits(page)).at(-1)).toBe('* Созвон\n** Что показали\n- миграция биллинга и тарифов\n* Другое\nтекст\n');
});

test('an edit from the main window (or the disk) comes in; the heading gone: «Заголовок удалён»', async ({ page }) => {
  await open(page);
  await send(page, 'mini-file', { path: W, text: '* Созвон\n** Что показали\n- миграция биллинга\n- дашборд SLA\n* Другое\n', disk: '', diskRaw: '' });
  await expect(lines(page)).toHaveText(['* Созвон', '** Что показали', '- миграция биллинга', '- дашборд SLA']);
  await send(page, 'mini-file', { path: W, text: '* Другое\n', disk: '', diskRaw: '' });
  await expect(mini(page)).toContainText('Заголовок удалён');
  await expect(mini(page).getByRole('button', { name: 'Выбрать заметку · ⌘P' })).toBeVisible();
});

test('⌥↩ on the root heading: the next one after its subtree, the note there', async ({ page }) => {
  await open(page);
  await lines(page).first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Alt+Enter');
  await expect.poll(async () => (await edits(page)).at(-1)).toBe('* Созвон\n** Что показали\n- миграция биллинга\n* \n* Другое\nтекст\n');
  await page.keyboard.type('Договорились');
  await expect(mini(page).locator('header .path b')).toHaveText('Договорились');
  await expect.poll(async () => (await edits(page)).at(-1)).toContain('\n* Договорились\n* Другое');
});

test('⌘P: the headings and files; ↩ a heading narrowed, ⌘↩ its file whole; ⎋ closes it', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+p');
  const pal = page.getByRole('dialog', { name: 'Сменить заметку' });
  await expect(pal).toBeVisible();
  await expect.poll(async () => (await log(page)).some((e) => e[0] === 'mini_pin' && (e[1] as { on: boolean }).on)).toBe(true); // full while open
  await page.keyboard.type('друг');
  await expect(pal.locator('.row.on .t')).toHaveText('Другое');
  await page.keyboard.press('Enter');
  await expect(pal).toHaveCount(0);
  await expect(lines(page)).toHaveText(['* Другое', 'текст']);
  await page.keyboard.press('Meta+p');
  await page.keyboard.type('покуп');
  await page.keyboard.press('Meta+Enter');
  await expect(mini(page).locator('header .path')).toHaveText('Дом.org'); // the file whole
  await expect(lines(page)).toHaveText(['* Покупки', '']);
  await page.keyboard.press('Meta+p');
  await page.keyboard.press('Escape');
  await expect(pal).toHaveCount(0);
});

test('no note yet: the palette at once; a command of the big window says so; ⎋ gives the keys back', async ({ page }) => {
  await open(page, null);
  await expect(page.getByRole('dialog', { name: 'Сменить заметку' })).toBeVisible();
  await page.keyboard.type('созв');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Meta+f'); // search in every file: the big window's
  await expect(mini(page).getByRole('status')).toHaveText('Доступно в главном окне');
  await page.keyboard.press('Escape'); // the hint goes
  await page.keyboard.press('Escape'); // then the keys go back
  await expect.poll(async () => (await log(page)).some((e) => e[0] === 'mini_return_focus')).toBe(true);
  await page.getByRole('button', { name: 'Открыть в главном окне' }).click();
  await expect.poll(async () => (await log(page)).find((e) => e[0] === 'emit' && e[2] === 'mini-open-main')?.[3]).toEqual({ path: 'Work.org', line: 0 });
});
