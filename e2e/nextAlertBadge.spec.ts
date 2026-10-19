import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 43.6: an alarm badge — `ui.setBadge(…, { tone: 'alert' })`: «Долгие дела» red when something is «Пора проверить»,
// no badge when nothing is (fix-50); the old navigator shows the number as before.

const NOW = new Date(2026, 9, 16, 11);
const MID = ['* TODO Квартальный план команды', '* TODO Регламент дежурств', ''].join('\n');
const row = (page: Page) => page.getByRole('navigation', { name: 'Разделы плагинов' }).getByRole('button', { name: /Долгие дела/ });

async function open(page: Page, touched: Date, next = true) {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(([m, n]) => { (window as any).__mtimeInit = m; if (n) localStorage.setItem('ui:next', '1'); }, [{ '/mock/Midterm.org': touched.getTime() }, next] as const);
  await openApp(page, { files: { '/mock/Midterm.org': MID }, now: NOW, ready: !next, viewport: { width: 1440, height: 820 } });
}

test('due matters: the number of «Пора проверить», red', async ({ page }) => {
  await open(page, new Date(2026, 8, 1));
  const c = row(page).locator('.bd');
  await expect(c).toHaveText('2');
  await expect(c).toHaveClass(/alert/);
  // the rail's badge (ТЗ 50 §1): on `todo` of «Синька», white
  expect(await c.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(196, 67, 47)');
  expect(await c.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
  await expect(row(page)).toHaveAccessibleName(/пора посмотреть/);
});

test('nothing due: no badge (fix-50: only what waits for an action)', async ({ page }) => {
  await open(page, new Date(2026, 9, 14));
  await expect(row(page)).toBeVisible();
  await expect(row(page).locator('.bd')).toHaveCount(0);
});

test('the old navigator: the number on the section\'s button, the tone not drawn', async ({ page }) => {
  await open(page, new Date(2026, 8, 1), false);
  const b = page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Долгие дела' });
  await expect(b.locator('.badge')).toHaveText('2');
});

// fix-50: «Входящие» — the entries to sort; red when the oldest has lain longer than «Красный счётчик…» (7 days)
test('«Входящие»: the number of entries; red with one older than 7 days', async ({ page }) => {
  const { pluginsReady } = await import('./tauriMock');
  const entry = (t: string, d: string) => `* TODO ${t}\n:PROPERTIES:\n:CREATED: [${d} 10:00]\n:END:\n`;
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/inbox.org': entry('Свежее', '2026-10-15 Чт') + entry('Старое', '2026-10-02 Пт') }, now: NOW, ready: false, viewport: { width: 1440, height: 820 } });
  await pluginsReady(page);
  await page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.setInbox({ file: 'inbox.org' }));
  const bd = page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: /Входящие/ }).locator('.bd');
  await expect(bd).toHaveText('2');
  await expect(bd).toHaveClass(/alert/);
});
