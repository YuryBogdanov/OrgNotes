import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { FILES, iso, shift, stamp, NOW } from './todayFixture';

// ТЗ 32 (part A): «Сегодня» — the pinned tab first in the left pane, opened by itself at the start of the day; the
// note and the choice from the journal, the agenda of the day, the tasks, the overdue ones; «Настройки → Сегодня».

const disk = (page: Page, p: string) => page.evaluate((x) => (window as any).__disk[x] as string, p);
const screen = (page: Page) => page.getByRole('region', { name: 'Сегодня', exact: true });
const tabs = (page: Page) => page.locator('.pane').first().getByRole('tab');

async function open(page: Page, o: { auto?: boolean; ls?: Record<string, string> } = {}) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installTauriMock(page, FILES(), { today: o.auto ?? true });
  if (o.ls) await page.addInitScript((ls) => Object.entries(ls).forEach(([k, v]) => localStorage.setItem(k, v)), o.ls);
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await expect(page.locator('.pane').first()).toBeVisible();
}

test('at the start of the day it opens by itself: pinned, first, over the tabs there were; the day reads from the files', async ({ page }) => {
  await open(page);
  await expect(screen(page)).toBeVisible();
  await expect(tabs(page).first()).toHaveText(/Сегодня/);
  await expect(tabs(page).first()).toHaveClass(/pinned/);
  await expect(tabs(page).first().getByLabel('Закреплена')).toBeVisible();
  await expect(tabs(page)).toHaveCount(2); // yesterday's file tab stays
  await expect(screen(page).locator('.kick')).toContainText('НЕДЕЛЯ');

  const note = screen(page).getByRole('region', { name: 'Записка со вчера' });
  await expect(note).toContainText('18:42');
  await expect(note.locator('b')).toHaveText('бюджету');
  const focus = screen(page).getByRole('region', { name: 'Главное на сегодня' });
  await expect(focus).toContainText('выбрано вчера');
  await expect(focus).toContainText('дедлайн сегодня');
  await expect(focus).toContainText('Задача не найдена');

  const agenda = screen(page).getByRole('region', { name: 'Агенда на сегодня' });
  await expect(agenda.locator('.arow')).toHaveCount(5);
  await expect(agenda.locator('.arow').first()).toHaveClass(/past/);
  await expect(agenda.locator('.badge')).toHaveText('1-1');
  await expect(agenda.locator('.arow').last()).toContainText('весь день');

  const tasks = screen(page).getByRole('region', { name: 'Задачи' });
  await expect(tasks).toContainText('TODO, NEXT · 4');
  await expect(tasks.locator('.trow').first()).toContainText('Вопросы к ревью биллинга'); // [#A] first
  await expect(tasks).not.toContainText('Ждём ответа');

  const late = screen(page).getByRole('region', { name: 'Просрочено' });
  await expect(late.locator('.count')).toHaveText('3');
  await expect(late.locator('.orow').first()).toContainText('Еженедельный отчёт');
  await expect(late.locator('.orow').first()).toContainText('5 дней');
});

test('once a day: not again after a reload; ⇧⌘H opens it, ⌘W closes it', async ({ page }) => {
  await open(page);
  await expect(screen(page)).toBeVisible();
  await page.keyboard.press('Meta+w');
  await expect(screen(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await expect(screen(page)).toHaveCount(0);
  await page.keyboard.press('Shift+Meta+h');
  await expect(screen(page)).toBeVisible();
  await expect(tabs(page).first()).toHaveText(/Сегодня/);
});

test('«По команде»: it does not open by itself', async ({ page }) => {
  await open(page, { ls: { 'feature:today': JSON.stringify({ show: 'command' }) } });
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await expect(screen(page)).toHaveCount(0);
});

test('the tab stays first: rows open after it (a double click); it is not moved to the other pane; a restart keeps it pinned', async ({ page }) => {
  await open(page);
  await screen(page).getByRole('region', { name: 'Задачи' }).getByText('Ответить HR по вакансии SRE').dblclick(); // a click chooses, a double click opens (ТЗ 34)
  await expect(tabs(page)).toHaveCount(2);
  await expect(page.locator('.cm-activeLine')).toContainText('Ответить HR');
  await page.getByRole('tab', { name: /Сегодня/ }).click();
  await screen(page).getByRole('region', { name: 'Агенда на сегодня' }).getByText('Стендап платформы').dblclick();
  await expect(tabs(page)).toHaveCount(3);
  await expect(tabs(page).nth(0)).toHaveText(/Сегодня/);
  await expect(tabs(page).nth(1)).toHaveText(/work/);

  await page.keyboard.press('Meta+\\'); // a second pane
  await tabs(page).first().click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Переместить в соседний редактор/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+Meta+ArrowRight'); // swap the panes: it comes back to the left one
  await expect(tabs(page).first()).toHaveText(/Сегодня/);

  await page.reload();
  await expect(tabs(page).first()).toHaveText(/Сегодня/);
  await expect(tabs(page).first()).toHaveClass(/pinned/);
});

test('«Главное»: the box finishes the task in its file, ⌘Z takes it back', async ({ page }) => {
  await open(page);
  const focus = screen(page).getByRole('region', { name: 'Главное на сегодня' });
  await focus.getByRole('checkbox', { name: 'Выполнено: Бюджет на нагрузочное' }).click();
  await expect.poll(() => disk(page, '/mock/inbox.org')).toContain('* DONE Бюджет на нагрузочное');
  await expect(focus.locator('.frow.done')).toHaveCount(1);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page, '/mock/inbox.org')).toContain('* TODO Бюджет на нагрузочное');
});

test('«Просрочено»: «Завтра» and «Сегодня» move the date that is past, the repeat kept; ⌘Z takes it back', async ({ page }) => {
  await open(page);
  const late = screen(page).getByRole('region', { name: 'Просрочено' });
  const weekly = late.locator('.orow', { hasText: 'Еженедельный отчёт' });
  await weekly.getByRole('button', { name: 'Завтра' }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toContain(`SCHEDULED: <${stamp(1, ' +1w')}>`);
  await expect(weekly).toHaveCount(0);
  await expect(late.locator('.count')).toHaveText('2');
  await late.locator('.orow', { hasText: 'Ревью перформанса Олега' }).getByRole('button', { name: 'Сегодня' }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toContain(`DEADLINE: <${iso(shift(0))}`);
  await expect(late.locator('.count')).toHaveText('1'); // the list drawn again before ⌘Z
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page, '/mock/work.org')).toContain(`DEADLINE: <${stamp(-3)}>`);
});

test('«Настройки → Сегодня»: after «Основные»; a block off leaves the screen, a status added comes in', async ({ page }) => {
  await open(page);
  await screen(page).getByRole('button', { name: 'Настроить экран' }).click();
  const sheet = page.getByRole('dialog', { name: 'Настройки' });
  const names = await sheet.locator('nav button, [role="tablist"] [role="tab"]').allInnerTexts();
  const i = names.findIndex((n) => n.trim() === 'Сегодня');
  expect(names[i - 1]?.trim()).toBe('Основные');
  await expect(sheet.getByRole('switch', { name: 'Поверх вчерашних вкладок' })).toBeChecked();

  await sheet.getByRole('list', { name: 'Блоки' }).getByRole('switch', { name: 'Просрочено' }).click();
  await sheet.getByRole('button', { name: 'Добавить статус' }).click();
  await sheet.getByRole('menuitem', { name: 'WAIT' }).click();
  await expect.poll(async () => JSON.parse((await disk(page, '/mock/.orgnotes/plugins/today.json')) ?? '{}').statuses).toEqual(['TODO', 'NEXT', 'WAIT']);
  await page.keyboard.press('Escape');
  await expect(screen(page).getByRole('region', { name: 'Просрочено' })).toHaveCount(0);
  await expect(screen(page).getByRole('region', { name: 'Задачи' })).toContainText('Ждём ответа');
});

test('«Время напоминания»: 15:00–21:00 by a quarter of an hour, 17:30 by default; off while the reminder is off; statuses are capsules', async ({ page }) => {
  await open(page);
  await expect(screen(page).getByRole('region', { name: 'Задачи' }).locator('.kw').first()).toHaveCSS('border-radius', '4px');
  await screen(page).getByRole('button', { name: 'Настроить экран' }).click();
  const sheet = page.getByRole('dialog', { name: 'Настройки' });
  const time = sheet.getByLabel('Время напоминания');
  await expect(time).toHaveValue('17:30');
  const opts = await time.locator('option').allInnerTexts();
  expect(opts[0]).toBe('15:00');
  expect(opts[1]).toBe('15:15');
  expect(opts[opts.length - 1]).toBe('21:00');
  expect(opts).toHaveLength(25);
  await expect(time).toBeDisabled(); // the tests turn the reminder off
  await sheet.getByRole('switch', { name: 'Напоминать завершить день' }).click();
  await expect(time).toBeEnabled();
});
