import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 43.6: an alarm badge — `ui.setBadge(…, { tone: 'alert' })`: «Долгие дела» red when something is «Пора проверить»,
// as any when nothing is; the old navigator shows the number as before.

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
  const c = row(page).locator('.c');
  await expect(c).toHaveText('2');
  await expect(c).toHaveClass(/alert/);
  expect(await c.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(196, 67, 47)'); // `todo` of «Синька»
  await expect(row(page)).toHaveAccessibleName(/пора посмотреть/);
});

test('nothing due: how many matters, as any', async ({ page }) => {
  await open(page, new Date(2026, 9, 14));
  const c = row(page).locator('.c');
  await expect(c).toHaveText('2');
  await expect(c).not.toHaveClass(/alert/);
});

test('the old navigator: the number on the section\'s button, the tone not drawn', async ({ page }) => {
  await open(page, new Date(2026, 8, 1), false);
  const b = page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Долгие дела' });
  await expect(b.locator('.badge')).toHaveText('2');
});
