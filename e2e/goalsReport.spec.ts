import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';
import { FILES, NOW, PETROV, ME } from './goalsFixture';

// ТЗ 23, part 3: «Отчёт за квартал», «Перенести незакрытые», the settings of the goals.

async function open(page: Page, now = NOW) {
  await page.clock.setFixedTime(now);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    (window as any).__clip = '';
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => ((window as any).__clip = t) }, configurable: true });
  });
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.keyboard.press('Control+Meta+4');
  await page.getByRole('navigation', { name: 'Цели' }).getByRole('button', { name: /Обзор квартала/ }).click();
}
const view = (page: Page) => page.locator('section.pane.active .goals');
const disk = (page: Page, p: string) => page.evaluate((x) => (window as any).__disk[x] as string, p);
const clip = (page: Page) => page.evaluate(() => (window as any).__clip as string);

test('«Отчёт за квартал»: per person the goals with their result, the last marks; copied as text and Markdown', async ({ page }) => {
  await open(page);
  await view(page).getByRole('button', { name: 'Отчёт за квартал' }).click();
  const rep = page.getByRole('dialog', { name: 'Отчёт за квартал' });
  await expect(rep.locator('header b')).toHaveText('Отчёт за квартал · Q4 2026');
  await expect(rep.locator('h2')).toHaveText([/Иванова Мария/, /Петров Алексей/, /Смирнов Олег/, /Мои цели/]);
  const ci = rep.locator('article', { hasText: 'Сократить время сборки CI' });
  await expect(ci.locator('.dl')).toHaveText('срок 30 ноя · В работе');
  await expect(ci.locator('.f', { hasText: 'Ожидаемый результат' }).locator('.v')).toHaveText('- p90 сборки main ≤ 10 минут;\n- медиана PR ≤ 6 минут;\n- без роста флаки-тестов');
  await expect(ci.locator('.f', { hasText: 'Последние отметки' }).locator('.v b')).toHaveText(['Вт, 22 сен', 'Пт, 18 сен']);
  await rep.getByRole('combobox', { name: 'Чей отчёт' }).selectOption({ label: 'Петров Алексей' });
  await expect(rep.locator('h2')).toHaveCount(1);
  await rep.getByRole('button', { name: 'Скопировать как текст' }).click();
  await expect.poll(() => clip(page)).toContain('Цели Q4 2026\n\nПЕТРОВ АЛЕКСЕЙ\n\n1. Внедрить дежурства по on-call\nЧто делал: Регламент, ротация.\n9 окт: Ротация настроена.\nРезультат: Регламент дежурств принят');
  expect(await clip(page)).toContain('Срок: 30 ноября 2026\nСтатус: В работе');
  await expect(page.locator('.toast')).toContainText('Отчёт скопирован');
  await rep.getByRole('button', { name: 'Скопировать как Markdown' }).click();
  await expect.poll(() => clip(page)).toContain('# Цели Q4 2026\n\n## Петров Алексей\n\n### Внедрить дежурства по on-call\n**Что делал:** \nРегламент, ротация.');
  await page.keyboard.press('Escape');
  await expect(rep).toHaveCount(0);
});

test('a quarter gone by: «Перенести незакрытые» — all ticked; under the next quarter, the deadline at its end, a mark', async ({ page }) => {
  await open(page, new Date(2027, 0, 11, 14, 0)); // Mon 11 Jan 2027: Q4 2026 is over
  await view(page).getByRole('button', { name: 'Предыдущий квартал' }).click();
  await expect(view(page).locator('.qs .cur')).toHaveText('Q4 2026');
  await view(page).getByRole('button', { name: 'Перенести незакрытые в Q1 2027' }).click();
  const dlg = page.getByRole('dialog', { name: 'Перенести незакрытые' });
  await expect(dlg.locator('.row')).toHaveCount(8); // 9 goals, 1 closed
  await expect(dlg.locator('.row', { hasText: 'Сократить время сборки CI' }).locator('.dl')).toHaveText('30 ноя → 31 мар');
  await dlg.locator('.row', { hasText: 'Наставничество' }).getByRole('checkbox').uncheck();
  await dlg.getByRole('button', { name: 'Перенести 7 целей' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Перенесено в Q1 2027: 7');
  await expect.poll(() => disk(page, PETROV)).toContain('* Квартальные задачи\n** Квартал Q1 2027\n*** ACTIVE Внедрить дежурства по on-call\nDEADLINE: <2027-03-31 Ср>');
  const petrov = await disk(page, PETROV);
  expect(petrov).toContain('- [2027-01-11 Пн] Перенесена из Q4 2026');
  expect(petrov).toMatch(/\*\* Квартал Q4 2026\n\*\*\* BACKLOG Наставничество для двух мидлов/); // unticked: stays
  expect(await disk(page, ME)).toContain('** Квартал Q1 2027\n*** ACTIVE Провести перформанс-ревью без переносов');
  await expect(view(page).locator('.qs .cur')).toHaveText('Q1 2027'); // the view goes to the new quarter
  await expect(view(page).locator('.row')).toHaveCount(7);
});

test('no carry-over for the current quarter; the report offers it for a past one', async ({ page }) => {
  await open(page);
  await expect(view(page).getByRole('button', { name: /Перенести незакрытые/ })).toHaveCount(0);
  await page.clock.setFixedTime(new Date(2027, 0, 11, 14, 0));
  await view(page).getByRole('button', { name: 'Отчёт за квартал' }).click();
  await expect(page.getByRole('dialog', { name: 'Отчёт за квартал' }).getByRole('button', { name: 'Перенести незакрытые в Q1 2027' })).toBeVisible();
});

test('«Настройки → Агенды → Цели квартала»: «молчит» через 21 день — the CI goal of 20 days is not silent any more', async ({ page }) => {
  await open(page);
  await expect(view(page).locator('.tile', { hasText: 'молч' }).locator('b')).toHaveText('3');
  await openSettingsSheet(page, 'Агенды');
  await page.getByLabel('Цель «молчит» через').selectOption('21');
  await page.getByLabel('Предупреждать о сроке за').selectOption('8');
  // on this Mac (roadmap 0.6)
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('feature:goals') ?? '{}'))).toEqual({ silent: 21, soon: 8 });
  await page.keyboard.press('Escape');
  await expect(view(page).locator('.tile', { hasText: 'молч' }).locator('b')).toHaveText('1'); // Смирнов: 31 days
  await expect(view(page).locator('.row', { hasText: 'Сократить время сборки CI' }).locator('.note')).toHaveText('отметка 20 дней назад');
  await expect(view(page).locator('.row', { hasText: 'Сократить время сборки CI' }).locator('.dl')).toHaveClass(/soon/); // 49 days < 8 weeks
});
