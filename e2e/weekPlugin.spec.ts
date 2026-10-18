import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installTauriMock, pluginsReady } from './tauriMock';
import { diskFile as disk } from './helpers';

// ТЗ 36: the plugin «Неделя» — an outside plugin (its own repository, panopticon-week next to this one), installed
// from the app's folder of plugins as a user would. Skipped when it is not built there. Every scenario in both
// shells (ТЗ 51): the old one and the new, where the plugin draws its new look.

const DIST = fileURLToPath(new URL('../../panopticon-week/dist/', import.meta.url));
const built = existsSync(DIST + 'main.js');
test.skip(!built, 'the plugin «Неделя» is not built next to the app (../panopticon-week: npm run build)');

const now = new Date();
const DAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // the local day (not UTC's: after midnight they differ)
// a meeting with its stamp in the title, as the calendar writes it: an event for the API
const WORK = ['* Работа', '** TODO Подготовить слайды', 'DEADLINE: <' + DAY + '>', '** Синк с CTO <' + DAY + ' 11:00>', ''].join('\n');

let UI: 'old' | 'next' = 'old';
async function open(page: Page, files: Record<string, string> = {}, at?: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (at) await page.clock.setFixedTime(new Date(at));
  await page.addInitScript((next) => {
    if (next) localStorage.setItem('ui:next', '1');
    localStorage.setItem('plugins:enabled', JSON.stringify({ week: true }));
    localStorage.setItem('plugins:trusted', JSON.stringify({ week: JSON.stringify([['files.edit', 'index.read'], []]) }));
  }, UI === 'next');
  await installTauriMock(page, {
    '/mock/work.org': WORK,
    '/config/plugins/week/manifest.json': readFileSync(DIST + 'manifest.json', 'utf8'),
    '/config/plugins/week/main.js': readFileSync(DIST + 'main.js', 'utf8'),
    ...files,
  }, { today: true });
  await page.goto('/');
  await pluginsReady(page);
}
const today = (page: Page) => page.getByRole('region', { name: 'Сегодня', exact: true });
// the plugin's own element of a block (the new screen wraps its blocks in a place of the same name too)
const block = (page: Page, id: string) => today(page).locator(`.ptb[data-block="${id}"]`);
const BANNER = /Итоги 42 недели (не подведены|— можно подвести)/;

for (const ui of ['old', 'next'] as const)
  test.describe(ui === 'next' ? 'the new interface' : 'the old interface', () => {
    test.beforeEach(() => void (UI = ui));

    test('no plan: «Спланировать» on «Сегодня»; the plan writes weeks.org — the week, its goals, one a task; the block shows them', async ({ page }) => {
      await open(page);
      const block = today(page).getByRole('region', { name: 'Цели недели' });
      await expect(block).toContainText('План на неделю не составлен');
      await expect(block.locator('.wk-plug')).toHaveText('Неделя');
      await block.getByRole('button', { name: 'Спланировать' }).click();
      const sheet = page.getByRole('dialog', { name: /План на \d+ неделю/ });
      await expect(sheet).toBeVisible();
      await sheet.getByLabel('Цель 1').fill('Закрыть найм SRE');
      await sheet.getByRole('checkbox', { name: 'задачей' }).check();
      await sheet.getByLabel('Цель 2').fill('Не брать встречи после 17:00');
      await page.keyboard.press('Meta+Enter');
      await expect(sheet).toHaveCount(0);
      await expect.poll(() => disk(page, '/mock/weeks.org')).toMatch(/^\* \d{4}-W\d{2} · .+\n\*\* Цели\n\*\*\* TODO Закрыть найм SRE\n\*\*\* Не брать встречи после 17:00/m);
      await expect(block.locator('.wk-tile')).toHaveCount(2);
      await expect(block.locator('.wk-tile').first()).toContainText('TODO');
    });

    test('the tab «Неделя»: the goals, «+ Цель», «Сделать задачей…» with a day; the days of the week; its neighbours', async ({ page }) => {
      await open(page);
      await page.keyboard.press('Control+Meta+7');
      const view = page.locator('.wk-view');
      await expect(view.locator('.wk-kick')).toContainText('НЕДЕЛЯ · СЕЙЧАС');
      await expect(view).toContainText('Целей пока нет');
      await view.getByLabel('Новая цель').fill('Согласовать бюджет');
      await page.keyboard.press('Enter');
      await expect(view.locator('.wk-goal')).toHaveCount(1);
      await expect.poll(() => disk(page, '/mock/weeks.org')).toContain('*** Согласовать бюджет');
      await view.getByRole('button', { name: 'Сделать задачей…' }).click();
      const form = page.getByRole('dialog', { name: /Задачей: Согласовать бюджет/ });
      await form.getByRole('button', { name: 'Сделать задачей' }).click();
      await expect.poll(() => disk(page, '/mock/weeks.org')).toContain('*** TODO Согласовать бюджет');
      await expect(view.locator('.wk-goal').first().locator('.wk-cap')).toHaveText('TODO');
      await expect(view.locator('.wk-day.today')).toContainText(/(дедлайн: |⚑ )Подготовить слайды/);
      await expect(view.locator('.wk-day.today')).toContainText('Синк с CTO');
      await view.getByRole('button', { name: 'Следующая неделя' }).click();
      await expect(view.locator('.wk-kick')).toContainText('ВПЕРЕДИ');
      await expect(view.getByRole('button', { name: 'Запланировать…' })).toBeVisible();
    });

    // ---- the review (ТЗ 36 §4, PR B): the time fixed — W42 is 12–18 October 2026 ----------------------------------------

    const W42 = ['* 2026-W42 · 12–18 октября', '** Цели', '*** DONE Закрыть найм SRE', '*** Согласовать бюджет', 'Ждём финансы', '*** Не брать встречи после 17:00', ''].join('\n');
    const W42_WORK = ['* Работа', '** DONE Слайды', 'CLOSED: [2026-10-13 Вт 12:00]', '** TODO Отчёт', 'DEADLINE: <2026-10-14 Ср>', '** Синк с CTO <2026-10-15 Чт 11:00>', ''].join('\n');

    test('Friday: the banner on «Сегодня»; the review marks the goals, writes the answers, :REVIEWED:; then the plan of the next week with the goal carried', async ({ page }) => {
      await open(page, { '/mock/weeks.org': W42, '/mock/work.org': W42_WORK }, '2026-10-16T16:30:00');
      const banner = block(page, 'week.banner');
      await expect(banner).toContainText(BANNER);
      await banner.getByRole('button', { name: 'Подвести итоги' }).click();
      const rv = page.getByRole('region', { name: 'Итоги 42 недели' });
      await expect(rv).toContainText('Пятница, 16:30');
      await expect(rv.getByRole('radio', { name: 'Да' }).first()).toHaveAttribute('aria-checked', 'true'); // the task done
      await expect(rv.locator('.wk-stats')).toContainText('1задача закрыта');
      await expect(rv.locator('.wk-stats')).toContainText('1просрочено');
      await expect(rv.locator('.wk-stats')).toContainText('1встреча');
      await rv.getByRole('radiogroup', { name: 'Оценка: Согласовать бюджет' }).getByRole('radio', { name: 'Частично' }).click();
      await expect.poll(() => disk(page, '/mock/weeks.org')).toMatch(/\*\*\* Согласовать бюджет\n:PROPERTIES:\n:RESULT: +partial\n:END:\nЖдём финансы/);
      await rv.getByRole('radiogroup', { name: 'Оценка: Не брать встречи после 17:00' }).getByRole('radio', { name: 'Нет' }).click();
      await rv.getByLabel('Что получилось').fill('- Оффер у Марии');
      await rv.getByLabel('Что меняю на следующей неделе').fill('Созвоны с США — только вт и чт');
      await expect.poll(() => disk(page, '/mock/weeks.org')).toMatch(/\*\* Итоги\n\*\*\* Что получилось\n- Оффер у Марии\n\*\*\* Что меняю на следующей неделе\nСозвоны с США/);
      await page.keyboard.press('Meta+Enter');
      const sheet = page.getByRole('dialog', { name: 'План на 43 неделю' });
      await expect(sheet).toContainText('шаг 2 из 2');
      await expect(sheet).toContainText('не достигнуты по итогам');
      await expect(sheet.getByRole('checkbox', { name: /Согласовать бюджет/ })).toBeChecked();
      await expect(sheet.getByRole('checkbox', { name: /Не брать встречи/ })).not.toBeChecked();
      const text = (await disk(page, '/mock/weeks.org'))!;
      expect(text).toMatch(/\*\* Итоги\n:PROPERTIES:\n:REVIEWED: +\[2026-10-16 Пт 16:30\]\n:END:/);
      expect(text).toMatch(/\*\*\* DONE Закрыть найм SRE\n:PROPERTIES:\n:RESULT: +done/);
      await sheet.getByLabel('Цель 1').fill('Запустить нагрузочное');
      await page.keyboard.press('Meta+Enter');
      await expect.poll(() => disk(page, '/mock/weeks.org')).toMatch(/\* 2026-W43 · 19–25 октября\n\*\* Цели\n\*\*\* Согласовать бюджет\nЖдём финансы\n\*\*\* Запустить нагрузочное/);
      await expect(banner).toBeHidden();
      // the tab is back at the week, its review made
      await expect(page.locator('.wk-view')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Итоги…' })).toBeVisible();
    });

    test('Monday: «Пропустить неделю» on the banner writes :SKIPPED: and the banner goes', async ({ page }) => {
      await open(page, { '/mock/weeks.org': W42 }, '2026-10-19T09:40:00');
      const banner = block(page, 'week.banner');
      await expect(banner).toContainText(BANNER);
      await banner.getByRole('button', { name: 'Пропустить неделю' }).click();
      await expect.poll(() => disk(page, '/mock/weeks.org')).toMatch(/\*\* Итоги\n:PROPERTIES:\n:SKIPPED: +\[2026-10-19 Пн 09:40\]/);
      await expect(banner).toBeHidden();
      await expect(page.getByText('Итоги 42 недели пропущены')).toBeVisible(); // its notice, with «Отменить»
    });

    test('after its time a week not reviewed is skipped quietly; a past week opens to read — the review or «Итоги не подводились»', async ({ page }) => {
      const W41 = ['* 2026-W41 · 5–11 октября', '** Цели', '*** Запустить нагрузочное', ':PROPERTIES:', ':RESULT: partial', ':END:', '** Итоги', ':PROPERTIES:', ':REVIEWED: [2026-10-12 Пн 09:40]', ':END:', '*** Что получилось', '- Стенд поднят', ''].join('\n');
      await open(page, { '/mock/weeks.org': W41 + W42 }, '2026-10-22T10:00:00');
      await expect.poll(() => disk(page, '/mock/weeks.org')).toMatch(/\* 2026-W42[^]*\*\* Итоги\n:PROPERTIES:\n:SKIPPED: +\[2026-10-22 Чт 10:00\]/);
      await expect(block(page, 'week.banner')).toBeHidden();
      await page.keyboard.press('Control+Meta+7');
      const view = page.locator('.wk-view');
      await view.getByRole('button', { name: 'Предыдущая неделя' }).click();
      await expect(view.locator('.wk-kick')).toContainText('42 НЕДЕЛЯ · ПРОШЛА');
      await expect(view.getByRole('region', { name: 'Итоги недели' })).toContainText('Итоги не подводились');
      await view.getByRole('button', { name: 'Предыдущая неделя' }).click();
      await expect(view.locator('.wk-goal')).toContainText('Частично');
      await expect(view.getByRole('region', { name: 'Итоги недели' })).toContainText('- Стенд поднят');
      await expect(view.getByRole('region', { name: 'Неделя в цифрах' })).toBeVisible();
    });

    // ---- the calendar's buttons, the quarter's goals in the plan, «перенесено» (ТЗ 36, PR C2; API 1.8) ------------------

    const W41_DONE = ['* 2026-W41 · 5–11 октября', '** Цели', '*** Запустить нагрузочное', '** Итоги', ':PROPERTIES:', ':REVIEWED: [2026-10-12 Пн 09:40]', ':END:', ''].join('\n');
    const cell = (page: Page, week: number) => page.getByRole('application', { name: 'Календарь' }).locator('.month .wk', { hasText: String(week) }).locator('button.wk-cb');

    test('the calendar: a button by every week — reviewed, now, to plan; the card of the week now; the review from Friday', async ({ page }) => {
      await open(page, { '/mock/weeks.org': W41_DONE + W42 }, '2026-10-14T10:00:00'); // Wednesday
      await page.keyboard.press('Meta+3');
      await expect(cell(page, 41)).toHaveClass(/\bok\b/);
      await expect(cell(page, 41)).toHaveAttribute('title', '41 неделя — итоги подведены · открыть');
      await expect(cell(page, 42)).toHaveClass(/\bnow\b/);
      await expect(cell(page, 43)).toHaveAttribute('title', '43 неделя — запланировать');
      await cell(page, 42).click();
      const card = page.getByRole('dialog', { name: '42 неделя' });
      await expect(card).toContainText('12–18 октября · сейчас');
      await expect(card).toContainText('Цели: 3 · одна уже выполнена');
      await expect(card.locator('.done')).toContainText('Закрыть найм SRE');
      await expect(card.getByRole('button', { name: 'Итоги с пятницы' })).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(card).toHaveCount(0);
      await cell(page, 43).click();
      await expect(page.getByRole('dialog', { name: 'План на 43 неделю' })).toBeVisible();
      await page.keyboard.press('Escape');
      await cell(page, 41).click();
      await expect(page.locator('.wk-view .wk-kick')).toContainText('41 НЕДЕЛЯ · ПРОШЛА');
    });

    test('the calendar on Friday: «Подвести итоги» in the card opens the review; in the week view the button is by the title', async ({ page }) => {
      await open(page, { '/mock/weeks.org': W42 }, '2026-10-16T16:30:00');
      await page.keyboard.press('Meta+3');
      await cell(page, 42).click();
      await page.getByRole('dialog', { name: '42 неделя' }).getByRole('button', { name: 'Подвести итоги' }).click();
      await expect(page.getByRole('region', { name: 'Итоги 42 недели' })).toBeVisible();
      await page.keyboard.press('Meta+3');
      const cal = page.getByRole('application', { name: 'Календарь' });
      await cal.getByRole('tab', { name: 'Неделя' }).click();
      await expect(cal.locator('.hslot button.wk-cb')).toHaveClass(/\bnow\b/);
    });

    test('on Monday the last week not reviewed is due: its button opens the review', async ({ page }) => {
      await open(page, { '/mock/weeks.org': W42 }, '2026-10-19T09:40:00');
      await page.keyboard.press('Meta+3');
      await expect(cell(page, 42)).toHaveClass(/\bdue\b/);
      await cell(page, 42).click();
      await expect(page.getByRole('region', { name: 'Итоги 42 недели' })).toBeVisible();
    });

    test('the plan shows my active goals of the quarter («Цели квартала» on); the review counts the tasks moved in the week', async ({ page }) => {
      const { FILES, CONFIG } = await import('./goalsFixture');
      const work = ['* TODO Отчёт', 'SCHEDULED: <2026-10-16 Пт>', ':LOGBOOK:', '- Rescheduled from "<2026-10-13 Вт>" on [2026-10-13 Tue 18:00]', ':END:', ''].join('\n');
      await open(page, { ...FILES({ ...CONFIG, behavior: { logbook: true } }), '/mock/weeks.org': W42, '/mock/work.org': work }, '2026-10-16T16:30:00');
      await page.keyboard.press('Meta+3');
      await cell(page, 43).click();
      const quarter = page.getByRole('dialog', { name: 'План на 43 неделю' }).getByLabel('Цели квартала');
      await expect(quarter).toContainText('Провести перформанс-ревью без переносов');
      await expect(quarter).toContainText('Запустить гильдию тимлидов');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+Meta+7');
      await page.getByRole('button', { name: 'Подвести итоги…' }).click();
      await expect(page.locator('.wk-stats')).toContainText('1перенесено');
    });
  });

// ---- ТЗ 51: the new look itself — the tokens, the app's fonts, the summaries of the panel «Сегодня» -------------------

test.describe('the new look (ТЗ 51)', () => {
  test.beforeEach(() => void (UI = 'next'));
  const W42 = ['* 2026-W42 · 12–18 октября', '** Цели', '*** DONE Закрыть найм SRE', '*** Согласовать бюджет', 'Ждём финансы', '*** Не брать встречи после 17:00', ''].join('\n');
  const font = (l: ReturnType<Page['locator']>) => l.evaluate((e) => getComputedStyle(e).fontFamily);

  test('the tab: the dates in Yeseva One, the goals and their notes in the file\'s text\'s font, the lamp\'s button, the grid', async ({ page }) => {
    await open(page, { '/mock/weeks.org': W42 }, '2026-10-16T16:30:00');
    await page.keyboard.press('Control+Meta+7');
    const view = page.locator('.wk-view.nx');
    await expect(view).toBeVisible();
    expect(await font(view.locator('h1'))).toContain('Yeseva');
    expect(await font(view.locator('.wk-gtitle').first())).toContain('Cormorant');
    expect(await font(view.locator('.wk-note').first())).toContain('Cormorant');
    expect(await font(view.locator('.wk-kick'))).toContain('Plex Mono');
    await expect(view.getByRole('button', { name: 'Подвести итоги…' })).toHaveCSS('background-color', 'rgb(227, 170, 60)');
    expect(await page.locator('.wk-tab.nx').evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('linear-gradient');
    await view.getByRole('button', { name: 'Подвести итоги…' }).click();
    const rv = page.getByRole('region', { name: 'Итоги 42 недели' });
    expect(await font(rv.locator('.wk-rgt').first())).toContain('Cormorant');
    expect(await font(rv.locator('textarea').first())).toContain('Cormorant');
    expect(await font(rv.locator('.wk-stats b').first())).toContain('Yeseva');
  });

  test('«Сегодня»: the banner on the plugin\'s ground, the goals in a row; the compact day — «Итоги недели — можно», «Цели недели — 1 из 3»', async ({ page }) => {
    await open(page, { '/mock/weeks.org': W42 }, '2026-10-16T16:30:00');
    const ban = block(page, 'week.banner').locator('.wk-ban.nx');
    await expect(ban).toContainText('Итоги 42 недели — можно подвести');
    expect(await font(block(page, 'week.goals').locator('.wk-tt').first())).toContain('Cormorant');
    await expect(block(page, 'week.goals').locator('.wk-plug')).toHaveText('Неделя');
    await page.getByRole('tab').first().click(); // a file's tab: the panel is the compact day
    await page.keyboard.press('Shift+Meta+h');
    const rows = page.getByRole('region', { name: 'Панель: Сегодня' }).getByRole('region', { name: 'Из плагинов' }).locator('.row');
    await expect(rows.filter({ hasText: 'Итоги недели' }).locator('.sum')).toHaveText('можно');
    await expect(rows.filter({ hasText: 'Итоги недели' }).locator('.sum')).toHaveClass(/alert/);
    await expect(rows.filter({ hasText: 'Цели недели' }).locator('.sum')).toHaveText('1 из 3');
  });

  test('no plan: the goals\' summary is «нет плана»', async ({ page }) => {
    await open(page, {}, '2026-10-14T10:00:00');
    await page.getByRole('tab').first().click();
    await page.keyboard.press('Shift+Meta+h');
    const rows = page.getByRole('region', { name: 'Панель: Сегодня' }).getByRole('region', { name: 'Из плагинов' }).locator('.row');
    await expect(rows.filter({ hasText: 'Цели недели' }).locator('.sum')).toHaveText('нет плана');
    await expect(rows.filter({ hasText: 'Цели недели' }).locator('.sum')).toHaveClass(/wait/);
  });

  test('the calendar: the weeks\' numbers in a column of 40 pt, Plex Mono; a button of 24 pt; the card in the app\'s layer', async ({ page }) => {
    await open(page, { '/mock/weeks.org': W42 }, '2026-10-14T10:00:00');
    await page.keyboard.press('Meta+3');
    const wk = page.getByRole('application', { name: 'Календарь' }).locator('.month .wk', { hasText: '42' });
    await expect(wk).toHaveCSS('width', '40px');
    expect(await font(wk)).toContain('Plex Mono');
    const b = wk.locator('button.wk-cb');
    await expect(b).toHaveCSS('width', '24px');
    await b.click();
    const card = page.getByRole('dialog', { name: '42 неделя' });
    expect(await card.evaluate((e) => !!e.closest('[data-ui="next"]'))).toBe(true);
    await expect(card.getByRole('button', { name: 'Открыть неделю' })).toHaveCSS('background-color', 'rgb(227, 170, 60)');
  });
});
