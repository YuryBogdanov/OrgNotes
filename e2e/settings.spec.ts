import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

const CONFIG = {
  version: 1,
  note: 'hand-written, must survive',
  workflows: [
    { name: 'Задачи', states: [{ name: 'NEW', key: 'n' }, { name: 'TODO' }, { name: 'DONE', done: true }] },
    { name: 'Встречи', states: [{ name: 'MEETING' }, { name: 'FINISHED', done: true }] },
  ],
};
const NOTES = '* TODO Подготовить бюджет\n* MEETING Планёрка\n* Просто заголовок\n';

const config = (page: Page) =>
  page.evaluate(() => {
    const raw = (window as any).__disk['/mock/.orgnotes/config.json'];
    return raw ? JSON.parse(raw) : null;
  });
const rawConfig = (page: Page) => page.evaluate(() => (window as any).__disk['/mock/.orgnotes/config.json'] as string);
const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);

const open = async (page: Page) => {
  await installTauriMock(page, { '/mock/Work.org': NOTES, '/mock/.orgnotes/config.json': JSON.stringify(CONFIG) });
  await page.goto('/');
  await expect(page.locator('.cm-content')).toContainText('Планёрка');
  await page.getByRole('button', { name: /Настройки/ }).click();
  await expect(page.getByRole('dialog', { name: 'Настройки' })).toBeVisible();
};
const dlg = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });
const names = (page: Page) => dlg(page).locator('input.nm').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

test('shows the project workflows with their states and the Org line', async ({ page }) => {
  await open(page);
  await expect(dlg(page).locator('aside .wf')).toHaveCount(2);
  expect(await names(page)).toEqual(['NEW', 'TODO', 'DONE']);
  await expect(dlg(page).getByLabel('Строка #+TODO')).toHaveText('#+TODO: NEW(n) TODO | DONE');
  await expect(dlg(page).locator('.start')).toHaveText('NEW');
  // nothing was written just by looking
  await page.waitForTimeout(600);
  expect(JSON.parse(await rawConfig(page))).toEqual(CONFIG);
});

test('⌘, opens settings and Escape closes them', async ({ page }) => {
  await installTauriMock(page, { '/mock/Work.org': NOTES });
  await page.goto('/');
  await expect(page.locator('.cm-content')).toContainText('Планёрка');
  await page.keyboard.press('Meta+Comma');
  await expect(dlg(page)).toBeVisible();
  // with no config file the built-in workflow is shown as the starting point
  expect(await names(page)).toEqual(['TODO', 'NEXT', 'WAIT', 'DONE', 'CANCELLED']);
  await page.keyboard.press('Escape');
  await expect(dlg(page)).toHaveCount(0);
  expect(await config(page)).toBeNull(); // still no file
});

test('renaming a status with a space writes a dashed keyword, keeps unknown keys and applies at once', async ({ page }) => {
  await open(page);
  const input = dlg(page).locator('input.nm').nth(1); // TODO
  await input.fill('IN PROGRESS');
  await expect(dlg(page).locator('.srow').nth(1).locator('.kwcol')).toContainText('IN-PROGRESS');
  await expect.poll(async () => (await config(page))?.workflows[0].states[1].name).toBe('IN-PROGRESS');
  expect((await config(page)).note).toBe('hand-written, must survive');
  await expect(dlg(page).getByLabel('Строка #+TODO')).toHaveText('#+TODO: NEW(n) IN-PROGRESS | DONE');
});

test('a status in use asks for confirmation before it is removed, and says how many headings use it', async ({ page }) => {
  await open(page);
  const todo = dlg(page).locator('.srow').nth(1);
  await expect(todo.locator('.kwcol')).toContainText('· 1');
  await todo.getByRole('button', { name: 'Удалить состояние' }).click();
  await expect(todo.getByRole('button', { name: 'Удалить состояние' })).toContainText('Удалить (1)?');
  expect(await names(page)).toEqual(['NEW', 'TODO', 'DONE']); // still there
  await todo.getByRole('button', { name: 'Удалить состояние' }).click();
  await expect.poll(async () => names(page)).toEqual(['NEW', 'DONE']);
  await expect.poll(async () => (await config(page)).workflows[0].states.map((s: any) => s.name)).toEqual(['NEW', 'DONE']);
});

test('a status that exists in another workflow is rejected and nothing is written', async ({ page }) => {
  await open(page);
  await dlg(page).locator('aside .wf').nth(1).click();
  await dlg(page).locator('input.nm').first().fill('TODO'); // MEETING -> TODO, already in "Задачи"
  await expect(dlg(page)).toContainText('«TODO» уже есть в наборе «Задачи»');
  await expect(dlg(page)).toContainText('Изменения не сохраняются');
  await page.waitForTimeout(600);
  expect(await config(page)).toEqual(CONFIG);
  // fixing it saves
  await dlg(page).locator('input.nm').first().fill('CALL');
  await expect.poll(async () => (await config(page)).workflows[1].states[0].name).toBe('CALL');
});

test('new workflow, colours, quick keys, and reordering with the separator', async ({ page }) => {
  await open(page);
  await dlg(page).getByRole('button', { name: '+ Новый набор' }).click();
  await expect(dlg(page).locator('aside .wf')).toHaveCount(3);
  await dlg(page).getByLabel('Название набора').fill('Цели');
  // states of a new workflow get names that do not clash with existing ones
  expect(await names(page)).toEqual(['NEW-2', 'DONE-2']);
  await dlg(page).locator('select[aria-label="Цвет состояния"]').first().selectOption('purple');
  await dlg(page).locator('input.qk').first().fill('g');
  await dlg(page).getByRole('button', { name: '+ Состояние' }).click();
  expect(await names(page)).toEqual(['NEW-2', 'STATE', 'DONE-2']);
  // move the new open state below the separator: it becomes a closing state
  await dlg(page).locator('.srow').nth(1).getByRole('button', { name: 'Ниже' }).click();
  await expect.poll(async () => (await config(page))?.workflows[2]?.states.map((s: any) => [s.name, !!s.done])).toEqual([
    ['NEW-2', false],
    ['STATE', true],
    ['DONE-2', true],
  ]);
  const saved = (await config(page)).workflows[2];
  expect(saved.name).toBe('Цели');
  expect(saved.states[0]).toEqual({ name: 'NEW-2', key: 'g', color: 'purple' });
});

test('dropping a row on the separator closes it, dropping above reorders', async ({ page }) => {
  await open(page);
  // Playwright cannot start a native drag in WebKit: dispatch the drag events
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role=dialog] .srow')] as HTMLElement[];
    const sep = document.querySelector('[role=dialog] .sep') as HTMLElement;
    const dt = new DataTransfer();
    const fire = (el: Element, type: string) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    fire(rows[1], 'dragstart'); // TODO
    fire(sep, 'dragover');
    fire(sep, 'drop');
    fire(rows[1], 'dragend');
  });
  await expect.poll(async () => (await config(page)).workflows[0].states.map((s: any) => [s.name, !!s.done])).toEqual([
    ['NEW', false],
    ['TODO', true],
    ['DONE', true],
  ]);
});

test('behaviour switches change what a status change writes', async ({ page }) => {
  await open(page);
  await dlg(page).getByRole('switch', { name: /CLOSED/ }).click();
  await dlg(page).getByRole('switch', { name: /LOGBOOK/ }).click();
  await expect.poll(async () => (await config(page)).behavior).toEqual({ closedTimestamp: false, logbook: true });
  await page.keyboard.press('Escape');

  // finish the first task from the inspector
  await page.locator('.cm-line', { hasText: 'Подготовить бюджет' }).click();
  await page.getByRole('button', { name: 'Выполнено' }).click();
  await expect.poll(async () => (await disk(page))['/mock/Work.org']).toContain('* DONE Подготовить бюджет\n:LOGBOOK:\n- State "DONE"       from "TODO"');
  const text = (await disk(page))['/mock/Work.org'];
  expect(text).not.toContain('CLOSED:');
});

test('the editor immediately understands a status added in settings', async ({ page }) => {
  await open(page);
  await dlg(page).locator('.srow').first().getByRole('button', { name: 'Ниже' }).click(); // just something harmless first
  await dlg(page).getByRole('button', { name: '+ Состояние' }).click();
  await dlg(page).locator('input.nm').nth(2).fill('BLOCKED'); // the new open state sits before DONE
  await expect.poll(async () => (await config(page)).workflows[0].states.map((s: any) => s.name)).toContain('BLOCKED');
  await page.keyboard.press('Escape');
  await page.locator('.cm-line', { hasText: 'Просто заголовок' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('BLOCKED ');
  await expect(page.locator('.nav .kw', { hasText: 'BLOCKED' })).toBeVisible();
});
