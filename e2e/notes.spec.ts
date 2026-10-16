import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';

// ТЗ 40.3: «Добавить заметку…» — ⌃C ⌃Z in the editor (and the editor's menu, the palette, the core's command
// `heading.note` for plugins): the field «Новый статус», the three last notes, ↩ writes the note into :LOGBOOK:.

const WORK = [
  '* WAIT Миграция биллинга',
  ':LOGBOOK:',
  '- Note taken on [2026-10-02 Чт 11:20] \\\\',
  '  черновик у Глеба',
  '- State "WAIT"       from "NEXT"       [2026-10-12 Пн 09:00] \\\\',
  '  ждём бизнес',
  '- Note taken on [2026-09-20 Вс 10:00] \\\\',
  '  самая старая',
  '- Note taken on [2026-09-25 Пт 10:00] \\\\',
  '  третья',
  ':END:',
  'Описание миграции.',
  '* Найм в команду',
  'Вакансия.',
  '',
].join('\n');
const line = (page: Page, t: string) => page.locator('.cm-line', { hasText: t });
const pop = (page: Page) => page.getByRole('dialog', { name: 'Добавить заметку' });
const text = (page: Page) => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.files.find((f: any) => f.name === 'work.org').text as string);
async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('plugins:updatesChecked', String(Date.now())));
  await installTauriMock(page, { '/mock/work.org': WORK });
  await page.goto('/');
  await pluginsReady(page);
  await expect(page.locator('.cm-content')).toBeVisible();
}
async function chord(page: Page) {
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+z');
}

test('⌃C ⌃Z in the body: the heading above, its three last notes the newest first; ↩ writes the note on top of :LOGBOOK:', async ({ page }) => {
  await open(page);
  await line(page, 'Описание миграции.').click();
  await chord(page);
  await expect(pop(page)).toBeVisible();
  await expect(pop(page)).toContainText('Миграция биллинга');
  await expect(pop(page).getByRole('textbox', { name: 'Новый статус' })).toBeFocused();
  await expect(pop(page).locator('.note .tx')).toHaveText(['ждём бизнес', 'черновик у Глеба', 'третья']);
  await expect(pop(page)).toContainText('Запишется в :LOGBOOK: с датой');
  await page.keyboard.type('бизнес ответил');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('стартуем после 4.2');
  await page.keyboard.press('Enter');
  await expect(pop(page)).toBeHidden();
  await expect.poll(() => text(page)).toMatch(/^\* WAIT Миграция биллинга\n:LOGBOOK:\n- Note taken on \[\d{4}-\d{2}-\d{2} [А-Яа-я]{2} \d{2}:\d{2}\] \\\\\n {2}бизнес ответил\n {2}стартуем после 4\.2\n- Note taken on \[2026-10-02/);
  // the focus is back in the editor; the next opening shows the new note first
  await expect(page.locator('.cm-content')).toBeFocused();
  await chord(page);
  await expect(pop(page).locator('.note .tx').first()).toHaveText('бизнес ответил стартуем после 4.2');
  await expect(pop(page).locator('.note .at').first()).toContainText('сегодня');
  // ⌘Z in the editor takes the note back
  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => text(page)).toBe(WORK);
});

test('⎋ and an empty ↩ close it with the file as it was; a heading without notes says so', async ({ page }) => {
  await open(page);
  await line(page, 'Найм в команду').click();
  await chord(page);
  await expect(pop(page)).toContainText('Заметок пока нет');
  await page.keyboard.type('черновик');
  await page.keyboard.press('Escape');
  await expect(pop(page)).toBeHidden();
  await chord(page);
  await page.keyboard.press('Enter');
  await expect(pop(page)).toBeHidden();
  expect(await text(page)).toBe(WORK);
});

test('«Добавить заметку…» of the editor\'s menu and of the palette; the core\'s command heading.note for a plugin', async ({ page }) => {
  await open(page);
  await line(page, 'Найм в команду').click();
  await line(page, 'Найм в команду').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Добавить заметку…/ }).click();
  await expect(pop(page)).toContainText('Найм в команду');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('заметк');
  await page.getByRole('option', { name: /^Добавить заметку…/ }).click();
  await expect(pop(page)).toContainText('Найм в команду');
  await page.keyboard.type('открыта');
  await page.keyboard.press('Enter');
  await expect.poll(() => text(page)).toMatch(/\* Найм в команду\n:LOGBOOK:\n- Note taken on \[[^\]]+\] \\\\\n {2}открыта\n:END:\nВакансия\./);
  // a plugin: the popover at its point
  await page.evaluate(async () => {
    const { plugins } = await import('/src/api/host.svelte.ts' as string);
    const ctx = (plugins as any).ctxOf({ ...plugins.manifest('hello'), permissions: ['index.read'], net: [] });
    await ctx.commands.run('heading.note', { ref: { path: 'work.org', line: 0, title: 'Миграция биллинга' }, x: 300, y: 200 });
  });
  await expect(pop(page)).toContainText('Миграция биллинга');
  const box = await pop(page).boundingBox();
  expect([Math.round(box!.x), Math.round(box!.y)]).toEqual([300, 200]);
});
