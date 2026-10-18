import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 47.3: the tab «Долгие дела» in the new interface — the kicker from the sources, the title in Yeseva One, the
// filter, «Источники…», «Начать обход ⌃⌘O» the main button; the columns «Дело и последний статус», «Давность · черта =
// норма», «Проверить»; «Пора проверить» in `todo`; «ждём: …» in `lampink`; the overdue in `todo`.

const NOW = new Date(2026, 9, 16, 11, 0);
const MID = ['#+TODO: TODO NEXT WAIT | DONE', '* NEXT Миграция биллинга', '* WAIT Квартальный план команды', ':PROPERTIES:', ':WAITING_ON: бизнес', ':END:', '* NEXT Обновить SLA', ':PROPERTIES:', ':NEXT_REVIEW: [2026-11-25 Ср]', ':END:', ''].join('\n');
const view = (page: Page) => page.locator('.lmv.next');

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await page.addInitScript((m) => ((window as any).__mtimeInit = m), { '/mock/Midterm.org': new Date(2026, 8, 1).getTime() });
  await openApp(page, { files: { '/mock/Midterm.org': MID, '/mock/work.org': '* TODO Онбординг :long:\n' }, now: NOW, ready: false, viewport: { width: 1440, height: 900 } });
  await pluginsReady(page);
  await page.keyboard.press('Control+Meta+9');
  await page.getByRole('button', { name: 'Открыть список ›' }).click();
  await expect(view(page)).toBeVisible();
}

test('the new look: the kicker from the sources, the Yeseva title, the tools; the columns; the groups and the rows', async ({ page }) => {
  await open(page);
  await expect(view(page).locator('.kick')).toHaveText('Midterm.org · первый уровень + тег :long:');
  expect(await view(page).locator('h1').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Yeseva One');
  await expect(view(page).getByRole('tab', { name: /^Все · \d+$/ })).toHaveAttribute('aria-selected', 'true');
  await expect(view(page).getByRole('button', { name: 'Источники…' })).toBeVisible();
  await expect(view(page).locator('.tools .main')).toContainText('Начать обход');
  await expect(view(page).locator('.cols span')).toHaveText(['Дело и последний статус', 'Давность · черта = норма', 'Проверить']);
  const due = view(page).locator('.grp.due');
  await expect(due).toContainText('Пора проверить');
  const todo = await due.evaluate((e) => getComputedStyle(e).color);
  expect(await view(page).locator('.due.late').first().evaluate((e) => getComputedStyle(e).color)).toBe(todo);
  await expect(view(page).locator('.row .wait')).toHaveText('ждём: бизнес');
  expect(await view(page).locator('.row .nm').first().evaluate((e) => getComputedStyle(e).fontSize)).toBe('15px');
  // «В норме» folded; «Начать обход» starts the walk
  await expect(view(page).locator('.grp.ok')).toHaveAttribute('aria-expanded', 'false');
  await view(page).locator('.tools .main').click();
  await expect(page.getByRole('region', { name: 'Обход долгих дел' })).toBeVisible();
});
