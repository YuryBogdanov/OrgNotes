import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { diskFile as disk } from './helpers';
import { FILES, iso, shift, NOW } from './todayFixture';

// ТЗ 45.1 (§2): «Сегодня» in the new interface — not a bridge; the kicker in IBM Plex Mono, the title in Yeseva One;
// the blocks as cards (the note on `lampsoft`), the rows with their capsules in a 46 pt column, the files' names
// without «.org»; the same workings as the old screen: the choice of «Главное» ticked, an overdue one moved, the rows
// one list of tasks (↑↓, ↩), its menu.

const screen = (page: Page) => page.getByRole('region', { name: 'Сегодня', exact: true });
const block = (page: Page, name: string) => screen(page).getByRole('region', { name });

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await installTauriMock(page, FILES(), { today: true });
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await expect(screen(page)).toBeVisible();
}

test('the new screen: its own (no compatibility layer), the head, the cards; the day read as on the old one', async ({ page }) => {
  await open(page);
  expect(await screen(page).evaluate((e) => !e.closest('.compat'))).toBe(true);
  await expect(screen(page).locator('.kick')).toContainText('НЕДЕЛЯ');
  expect(await screen(page).locator('h1').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Yeseva One');
  await expect(screen(page).getByRole('button', { name: /Завершить день…/ })).toBeVisible();
  const note = block(page, 'Записка со вчера');
  await expect(note).toContainText('18:42');
  await expect(note.locator('b')).toHaveText('бюджету');
  expect(await note.locator('.ntext').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('IBM Plex Mono');
  const focus = block(page, 'Главное на сегодня');
  await expect(focus).toContainText('выбрано вчера');
  await expect(focus).toContainText('дедлайн сегодня');
  const agenda = block(page, 'Агенда на сегодня');
  await expect(agenda.locator('.arow')).toHaveCount(5);
  await expect(agenda.locator('.arow').first()).toHaveClass(/past/);
  const tasks = block(page, 'Задачи');
  await expect(tasks).toContainText('TODO, NEXT · 4');
  await expect(tasks.locator('.grp').first()).not.toContainText('.ORG');
  const late = block(page, 'Просрочено');
  await expect(late.locator('.count')).toHaveText('3');
  await expect(late.locator('.orow').first()).toContainText('5 дней');
  expect(Math.round((await late.locator('.orow .kc').first().boundingBox())!.width)).toBe(46);
});

test('the actions: «Главное» ticked; an overdue one «Завтра»; ↑↓ over the rows, ↩ opens', async ({ page }) => {
  await open(page);
  const focus = block(page, 'Главное на сегодня');
  const box = focus.getByRole('checkbox').first();
  const name = (await box.getAttribute('aria-label'))!.replace('Выполнено: ', '');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => Object.values(await page.evaluate(() => (window as any).__disk as Record<string, string>)).some((t) => new RegExp(`\\* DONE .*${name}`).test(t))).toBe(true);
  await block(page, 'Просрочено').locator('.orow', { hasText: 'Написать Ане' }).getByRole('button', { name: 'Завтра' }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toContain(`SCHEDULED: <${iso(shift(1))}`);
  // one list of tasks
  const tasks = block(page, 'Задачи');
  await tasks.locator('[data-k]').first().click();
  await expect(screen(page).locator('[data-k].sel')).toHaveCount(1);
  const first = await screen(page).locator('[data-k].sel').textContent();
  await page.keyboard.press('ArrowDown');
  await expect(screen(page).locator('[data-k].sel')).not.toHaveText(first!);
  await page.keyboard.press('Enter');
  await expect(screen(page)).toHaveCount(0); // the task's file opened in the tab
});
