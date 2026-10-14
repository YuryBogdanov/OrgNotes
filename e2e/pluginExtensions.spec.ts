import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { CONFIG, FILES, NOW } from './goalsFixture';

// API 1.8 (ТЗ 36, PR C1): a plugin puts its pieces into a place another one declares (the calendar's
// `calendar.weekCell`), calls what another plugin exports («Цели квартала»: `myActiveGoals`), and reads the moves of
// a task's date the app notes in :LOGBOOK: while the workflow keeps a journal.

const PROBE = '/config/plugins/probe';
const MANIFEST = JSON.stringify({
  id: 'probe', name: 'Зонд', version: '0.1.0', api: '^1.8', permissions: ['index.read', 'files.edit'],
  contributes: { commands: [{ id: 'probe.goals', title: 'Зонд: цели квартала' }, { id: 'probe.move', title: 'Зонд: перенести' }] },
});
const MAIN = `export default { activate(ctx) {
  ctx.ui.slot('calendar.weekCell', (el, d) => {
    const b = document.createElement('button');
    b.className = 'probe'; b.textContent = 'W' + d.week; b.dataset.monday = d.monday; b.dataset.view = d.view;
    el.append(b);
    return () => b.remove();
  });
  ctx.commands.on('probe.goals', async () => {
    const mine = await ctx.plugins.call('quarter-goals', 'myActiveGoals');
    const none = await ctx.plugins.call('nobody', 'x');
    ctx.ui.notify('Цели: ' + mine.map((g) => g.title + ' до ' + g.deadline + ' в ' + g.ref.path).join('; ') + ' · нет: ' + String(none));
  });
  ctx.commands.on('probe.move', async () => {
    const [h] = await ctx.index.outline('work.org');
    await ctx.edit.transaction('Перенести', (tx) => tx.setPlanning(h.ref, 'SCHEDULED', new Date(2026, 9, 15)));
    const [after] = await ctx.index.outline('work.org');
    const wf = await ctx.index.workflow('work.org');
    ctx.ui.notify('Переносов: ' + (after.reschedules ?? []).length + ' · журнал: ' + wf.logbook);
  });
} };`;

const disk = (page: Page, p: string) => page.evaluate((x) => (window as any).__disk[x] as string | undefined, p);
async function open(page: Page, files: Record<string, string>) {
  await page.clock.setFixedTime(NOW); // Mon 12 Oct 2026: W42
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('plugins:enabled', JSON.stringify({ probe: true }));
    localStorage.setItem('plugins:trusted', JSON.stringify({ probe: JSON.stringify([['files.edit', 'index.read'], []]) }));
  });
  await installTauriMock(page, { [PROBE + '/manifest.json']: MANIFEST, [PROBE + '/main.js']: MAIN, ...files });
  await page.goto('/');
  await pluginsReady(page);
}
async function run(page: Page, title: string) {
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
}

test('calendar.weekCell: a piece by every week of the month (the column wider, the week now in accent) and by the title of the week view', async ({ page }) => {
  await open(page, FILES());
  await page.keyboard.press('Meta+3');
  const cal = page.getByRole('application', { name: 'Календарь' });
  const rows = cal.locator('.month .row');
  await expect(cal.locator('.month .wk button.probe')).toHaveCount(await rows.count());
  await expect(cal.locator('.month .wk.now')).toContainText('42');
  await expect(cal.locator('.month .wk.now button.probe')).toHaveAttribute('data-monday', '2026-10-12');
  expect(Math.round((await cal.locator('.month .wk').first().boundingBox())!.width)).toBe(32);
  await cal.getByRole('tab', { name: 'Неделя' }).click();
  await expect(cal.locator('.hslot button.probe')).toHaveText('W42');
  await expect(cal.locator('.hslot button.probe')).toHaveAttribute('data-view', 'week');
  await cal.getByRole('button', { name: 'Вперёд' }).click();
  await expect(cal.locator('.hslot button.probe')).toHaveText('W43'); // drawn again with the new week
  await expect(cal.locator('.hslot button.probe')).toHaveCount(1);
});

test('ctx.plugins.call: «Цели квартала» give my active goals of the quarter; a plugin not there gives undefined', async ({ page }) => {
  await open(page, FILES());
  await run(page, 'Зонд: цели квартала');
  await expect(page.locator('.toast')).toContainText(
    'Цели: Провести перформанс-ревью без переносов до 2026-12-18 в Работа/me.org; Запустить гильдию тимлидов до 2026-12-31 в Работа/me.org · нет: undefined',
  );
});

test('the journal on: a SCHEDULED moved is noted in :LOGBOOK: as Org does; the API reads it back', async ({ page }) => {
  await open(page, {
    '/mock/work.org': '* TODO Отчёт\nSCHEDULED: <2026-10-12 Пн>\n',
    '/mock/.orgnotes/config.json': JSON.stringify({ ...CONFIG, goals: undefined, behavior: { logbook: true } }),
  });
  await run(page, 'Зонд: перенести');
  await expect(page.locator('.toast')).toContainText('Переносов: 1 · журнал: true');
  expect(await disk(page, '/mock/work.org')).toBe('* TODO Отчёт\nSCHEDULED: <2026-10-15 Чт>\n:LOGBOOK:\n- Rescheduled from "<2026-10-12 Пн>" on [2026-10-12 Mon 14:00]\n:END:\n');
});
