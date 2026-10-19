import { expect, test, type Page } from '@playwright/test';
import { diskFile as disk, openApp } from './helpers';

// ТЗ 48.2: «Добавить заметку…» ⌃C ⌃Z in the new interface — the popover of ТЗ 44, 440 pt, under the heading's line;
// «Заметка», the status capsule and the title; the field in the interface's font (fix-49); the two last notes (none — no block); ↩ writes
// it into :LOGBOOK: and closes, an empty field does nothing; ⎋ closes.

const WORK = [
  '* NEXT Миграция биллинга',
  ':LOGBOOK:',
  '- Note taken on [2026-10-12 Пн 10:00] \\\\',
  '  ждём бизнес',
  '- Note taken on [2026-10-02 Пт 10:00] \\\\',
  '  черновик у Глеба',
  '- Note taken on [2026-09-25 Пт 10:00] \\\\',
  '  третья',
  ':END:',
  '* TODO Без заметок',
  '',
].join('\n');
const pop = (page: Page) => page.getByRole('dialog', { name: 'Добавить заметку' });

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/work.org': WORK }, now: new Date(2026, 9, 16, 12, 0), ready: false, viewport: { width: 1440, height: 900 } });
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'work' }).click();
}
async function note(page: Page, line: string) {
  await page.locator('.cm-line', { hasText: line }).click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+z');
  await expect(pop(page)).toBeVisible();
}

test('the popover: 440 pt under the line, «Заметка», the capsule and the title, the interface font, the two last notes; ↩ writes and closes', async ({ page }) => {
  await open(page);
  await note(page, 'Миграция биллинга');
  expect(Math.round((await pop(page).boundingBox())!.width)).toBeGreaterThanOrEqual(440);
  const line = (await page.locator('.cm-line', { hasText: 'Миграция биллинга' }).boundingBox())!;
  expect((await pop(page).boundingBox())!.y).toBeGreaterThan(line.y);
  await expect(pop(page).locator('.hd b')).toHaveText('Заметка');
  await expect(pop(page).locator('.capsule')).toHaveText('NEXT');
  await expect(pop(page).locator('.ti')).toHaveText('Миграция биллинга');
  expect(await pop(page).getByRole('textbox', { name: 'Новый статус' }).evaluate((e) => getComputedStyle(e).fontFamily)).toContain('apple-system'); // the interface's font (fix-49)
  await expect(pop(page).locator('.note .tx')).toHaveText(['ждём бизнес', 'черновик у Глеба']);
  await expect(pop(page).locator('.foot')).toContainText('↩ записать · ⇧↩ строка · ⎋');
  // an empty field: ↩ does nothing
  await page.keyboard.press('Enter');
  await expect(pop(page)).toBeVisible();
  await page.keyboard.type('договорились о сроках');
  await page.keyboard.press('Enter');
  await expect(pop(page)).toHaveCount(0);
  await expect.poll(() => disk(page, '/mock/work.org')).toMatch(/- Note taken on \[2026-10-16 [^\]]+\] \\\\\n {2}договорились о сроках/);
});

test('no notes — no block; ⎋ closes and writes nothing', async ({ page }) => {
  await open(page);
  await note(page, 'Без заметок');
  await expect(pop(page).locator('.list')).toHaveCount(0);
  await page.keyboard.type('черновик');
  await page.keyboard.press('Escape');
  await expect(pop(page)).toHaveCount(0);
  expect(await disk(page, '/mock/work.org')).toBe(WORK);
});
