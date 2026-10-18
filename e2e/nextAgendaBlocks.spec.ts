import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { MY_DAY, NOTES, withAgenda } from './agendaFixture';

// ТЗ 45.4 (§3.1, §3.3): the agendas of blocks in the new interface — a custom one («Мой день»): the kicker, the name,
// «Редактировать…», each block's dot, name, conditions in IBM Plex Mono and number, rows of 44 pt with the file under
// the title; ↑↓ choose (on `lampsoft`); the built-in «Неделя», «Сегодня», «Все задачи» of the sidebar's panel, read-only.

const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);
async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: withAgenda(NOTES(), MY_DAY), ready: false, viewport: { width: 1440, height: 900 } });
  await expect.poll(() => store(page, 'return store.loaded')).toBe(true);
  await page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: /Агенда/ }).click();
}
const list = (page: Page) => page.getByRole('navigation', { name: 'Список агенд' });

test('«Мой день»: the head, the blocks with their conditions, the rows; ↑↓ choose; «Редактировать…» the builder', async ({ page }) => {
  await open(page);
  await list(page).getByRole('button', { name: 'Мой день' }).click();
  const scr = page.getByRole('region', { name: 'Мой день' });
  await expect(scr).toBeVisible();
  expect(await scr.evaluate((e) => !e.closest('.compat'))).toBe(true);
  await expect(scr.locator('.kick')).toHaveText(/Моя агенда · \d+ задач\S* · work, inbox/i);
  await expect(scr.locator('.bh .bn')).toHaveText(['Просрочено', 'На сегодня', 'Жду ответа', 'Дедлайны на 14 дней']);
  await expect(scr.locator('.bh').nth(2).locator('.cond')).toHaveText('status:WAIT');
  const first = scr.locator('.row').first();
  await expect(first.locator('.t')).toHaveText('Ревизия целей команд');
  await expect(first.locator('.file')).toHaveText('work');
  await expect(first.locator('.mark')).toHaveClass(/late/);
  await scr.focus();
  await page.keyboard.press('ArrowDown');
  await expect(scr.locator('.row.sel')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(scr.locator('.row.sel .t')).not.toHaveText('Ревизия целей команд');
  await scr.getByRole('button', { name: 'Редактировать…' }).click();
  await expect(page.getByRole('region', { name: 'Конструктор агенды' })).toBeVisible(); // a tab (ТЗ 48 §5)
  await expect(page.getByRole('tablist', { name: 'Вкладки' }).getByRole('tab').filter({ hasText: 'Мой день — правка' })).toHaveCount(1);
});

test('the built-in «Неделя», «Сегодня», «Все задачи»: blocks, read-only; «Все задачи» by file', async ({ page }) => {
  await open(page);
  await list(page).getByRole('button', { name: 'Неделя' }).click();
  const week = page.getByRole('region', { name: 'Неделя' });
  await expect(week.locator('.bh .bn')).toHaveText(['Просрочено', 'Сроки недели', 'Запланировано на неделю']);
  await expect(week.getByRole('button', { name: 'Редактировать…' })).toHaveCount(0);
  await expect(list(page).getByRole('button', { name: 'Неделя' })).toHaveAttribute('aria-current', 'true');
  await list(page).getByRole('button', { name: 'Сегодня' }).click();
  const today = page.getByRole('region', { name: 'Сегодня', exact: true });
  await expect(today.locator('.bh').nth(2).locator('.n')).toHaveText('3'); // the planned for today: «Свести расходы», «Отложенное», «Разобрать входящие»
  await list(page).getByRole('button', { name: 'Все задачи' }).click();
  const all = page.getByRole('region', { name: 'Все задачи' });
  await expect(all.locator('.gh > span:first-child')).toHaveText(['список', 'inbox', 'work']); // by file, as the builder groups
  await expect(all).not.toContainText('Закрыть квартал'); // done ones left out
});
