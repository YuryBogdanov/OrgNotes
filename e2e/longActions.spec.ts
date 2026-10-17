import { expect, test, type Page } from '@playwright/test';
import { openApp, diskFile as disk } from './helpers';

// ТЗ 40.5: the actions on a long matter — S «Статус…», R «Проверить через…», W «Ждём…» / «Больше не ждём», O «Осмотрено»,
// the menu of a row («Убрать из долгих дел»), the palette and the heading's menu on a long matter only.

const NOW = new Date(2026, 9, 16, 11, 0);
const MID = [
  '#+TODO: TODO NEXT WAIT | DONE',
  '* NEXT Миграция биллинга',
  ':LOGBOOK:',
  '- State "NEXT"       from "TODO"       [2026-08-20 Чт 10:00]',
  ':END:',
  'Описание.',
  '* Квартальный план команды',
  ':PROPERTIES:',
  ':WAITING_ON: бизнес',
  ':END:',
  '',
].join('\n');
const WORK = ['* TODO Обновить онбординг :long:team:', '* TODO Просто задача', ''].join('\n');
const MIDTERM = '/mock/Midterm.org';

async function open(page: Page) {
  const old = new Date(2026, 8, 1).getTime(); // 45 days ago: both overdue
  await page.addInitScript((m) => ((window as any).__mtimeInit = m), { [MIDTERM]: old, '/mock/work.org': old });
  await openApp(page, { files: { [MIDTERM]: MID, '/mock/work.org': WORK }, now: NOW });
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Долгие дела' }).click();
  await page.getByRole('navigation', { name: 'Долгие дела' }).getByRole('button', { name: 'Открыть список ›' }).click();
  await expect(grid(page).locator('.row')).toHaveCount(3);
}
const grid = (page: Page) => page.getByRole('grid', { name: 'Долгие дела' });
const row = (page: Page, t: string) => grid(page).locator('.row', { hasText: t });
async function choose(page: Page, t: string) {
  await row(page, t).click();
  await expect(row(page, t)).toHaveClass(/on/);
}
const groupOf = (page: Page, t: string) =>
  grid(page).evaluate((g, t) => {
    let name = '';
    for (const el of g.children) {
      if (el.classList.contains('grp')) name = el.querySelector('span')!.textContent!;
      else if (el.classList.contains('row') && el.textContent!.includes(t)) return name;
    }
    return null;
  }, t);
const undo = (page: Page) => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.undoLast());

test('R «Проверить через месяц»: :NEXT_REVIEW: with the file\'s day names, out of «Пора проверить»; «Убрать срок»', async ({ page }) => {
  await open(page);
  await choose(page, 'Миграция биллинга');
  expect(await groupOf(page, 'Миграция биллинга')).toBe('Пора проверить');
  await page.keyboard.press('r');
  await page.getByRole('menuitem', { name: 'Через месяц' }).click();
  await expect.poll(() => disk(page, MIDTERM)).toContain('* NEXT Миграция биллинга\n:PROPERTIES:\n:NEXT_REVIEW: [2026-11-15 Вс]\n:END:\n');
  await expect.poll(() => groupOf(page, 'Миграция биллинга')).toBe('В норме');
  await expect(row(page, 'Миграция биллинга')).toHaveClass(/on/); // still chosen, in its new group
  await expect(row(page, 'Миграция биллинга').locator('.due')).toHaveText('15 ноя');
  await page.keyboard.press('r');
  await page.getByRole('menuitem', { name: 'Убрать срок' }).click();
  await expect.poll(() => disk(page, MIDTERM)).not.toContain('NEXT_REVIEW');
});

test('W «Ждём…» with the status: one transaction, ⌘Z takes it all back; «Больше не ждём» — the first open status without a journal', async ({ page }) => {
  await open(page);
  await choose(page, 'Миграция биллинга');
  await page.keyboard.press('w');
  const sheet = page.getByRole('dialog', { name: 'Ждём: Миграция биллинга' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('switch', { name: 'Поставить статус WAIT' })).toBeChecked();
  // the earlier ones are offered
  await sheet.getByRole('textbox', { name: 'Кого или что ждём' }).fill('би');
  await sheet.getByRole('button', { name: 'бизнес', exact: true }).click();
  await sheet.getByRole('button', { name: 'Ждём', exact: true }).click();
  await expect.poll(() => disk(page, MIDTERM)).toMatch(/^#\+TODO: .*\n\* WAIT Миграция биллинга\n:PROPERTIES:\n:WAITING_ON: бизнес\n:END:\n/);
  await expect.poll(() => row(page, 'Миграция биллинга').textContent()).toContain('ждём: бизнес');
  await undo(page);
  await expect.poll(() => disk(page, MIDTERM)).toBe(MID);
  await expect(row(page, 'Миграция биллинга')).not.toContainText('ждём:'); // read again
  // again, then «Больше не ждём»: no change to WAIT in the :LOGBOOK: (the file keeps no journal) — the first open status
  await choose(page, 'Миграция биллинга');
  await page.keyboard.press('w');
  await sheet.getByRole('textbox', { name: 'Кого или что ждём' }).fill('Ирина');
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page, MIDTERM)).toContain(':WAITING_ON: Ирина');
  await choose(page, 'Миграция биллинга');
  await page.keyboard.press('w');
  await expect.poll(() => disk(page, MIDTERM)).not.toContain('WAITING_ON: Ирина');
  expect(await disk(page, MIDTERM)).toContain('* TODO Миграция биллинга');
});

test('O «Осмотрено»: the file as it was, «0 дн.», the day to look in 14 days; S «Статус…» writes the note under the row', async ({ page }) => {
  await open(page);
  await choose(page, 'Обновить онбординг');
  await page.keyboard.press('o');
  await expect.poll(() => groupOf(page, 'Обновить онбординг')).toBe('В норме');
  await expect(row(page, 'Обновить онбординг').locator('.age')).toContainText('0 дн. без касания');
  await expect(row(page, 'Обновить онбординг').locator('.due')).toHaveText('30 окт');
  expect(await disk(page, '/mock/work.org')).toBe(WORK);
  // «Статус…»: the core's popover under the row
  await choose(page, 'Квартальный план');
  await page.keyboard.press('s');
  const pop = page.getByRole('dialog', { name: 'Добавить заметку' });
  await expect(pop).toContainText('Квартальный план команды');
  const r = await row(page, 'Квартальный план').boundingBox();
  const p = await pop.boundingBox();
  expect(Math.abs(p!.y - (r!.y + r!.height)) < 8).toBe(true);
  await page.keyboard.type('черновик у Глеба');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Квартальный план').locator('.nt')).toHaveText('черновик у Глеба');
});

test('the menu of a row: «Убрать из долгих дел» takes the tag away; by place — off, with the reason', async ({ page }) => {
  await open(page);
  await row(page, 'Квартальный план').click({ button: 'right' });
  const off = page.getByRole('menuitem', { name: /Убрать из долгих дел/ });
  await expect(off).toBeDisabled();
  await expect(page.locator('.menu, [role="menu"]').first()).toContainText('Закройте дело или перенесите его из Midterm.org');
  await page.keyboard.press('Escape');
  await row(page, 'Обновить онбординг').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Больше не ждём' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: /Убрать из долгих дел/ }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toContain('* TODO Обновить онбординг :team:\n');
  await expect(grid(page).locator('.row')).toHaveCount(2);
});

test('the palette and the heading\'s menu: the actions on a long matter only', async ({ page }) => {
  await open(page);
  await page.getByRole('navigation', { name: 'Долгие дела' }).locator('.row', { hasText: 'Миграция' }).click();
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('осмотр');
  await expect(page.getByRole('option', { name: /^Осмотрено/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.cm-line', { hasText: 'Миграция биллинга' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Проверить через…' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Ждём…' })).toBeVisible();
  await page.keyboard.press('Escape');
  // not a long matter: none of them
  await page.locator('.tab', { hasText: 'Midterm' }).click();
  await page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.open((await import('/src/store.svelte.ts' as string)).store.files.findIndex((f: any) => f.name === 'work.org'), 1));
  await page.locator('.cm-line', { hasText: 'Просто задача' }).click();
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('осмотр');
  await expect(page.getByRole('option', { name: /^Осмотрено/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('.cm-line', { hasText: 'Просто задача' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Проверить через…' })).toHaveCount(0);
});
