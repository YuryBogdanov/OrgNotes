import { expect, test, type Page } from '@playwright/test';
import { openApp, settingsSheet } from './helpers';

// ТЗ 43.3: a plugin's section in the new sidebar — its panel drawn by the plugin as it is, in the compatibility
// layer (the old variables are the new tokens), the width the sidebar's less the fields; the panel failing — the
// plugin off as before, «Раздел плагина не загрузился» and «Подробнее» in its place.

const PROBE = '/config/plugins/probe';
const MANIFEST = JSON.stringify({
  id: 'probe', name: 'Зонд', version: '0.1.0', api: '^1.9', permissions: [],
  contributes: { navSections: [{ id: 'probe', title: 'Зонд', icon: 'M3 3h14v14H3z' }] },
});
const MAIN = `export default { activate(ctx) {
  ctx.ui.navSection('probe', (root) => {
    if (window.__breakPanel) throw new Error('панель сломалась');
    const d = document.createElement('div');
    d.className = 'probe-panel';
    d.style.color = 'var(--acc)';
    d.textContent = 'Зонд на месте';
    root.append(d);
  });
} };`;

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, {
    files: { [PROBE + '/manifest.json']: MANIFEST, [PROBE + '/main.js']: MAIN, '/mock/a.org': '* A\n' },
    plugins: { probe: [] },
    ready: false,
    viewport: { width: 1440, height: 820 },
  });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
}
const section = (page: Page) => page.getByRole('navigation', { name: 'Разделы плагинов' }).getByRole('button', { name: /Зонд/ });

test('the plugin draws its panel in the layer: the new colours, the sidebar\'s width less the fields', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page);
  await section(page).click();
  const panel = page.locator('.probe-panel');
  await expect(panel).toHaveText('Зонд на месте');
  expect(await panel.evaluate((e) => !!e.closest('.compat[data-ui="next"]'))).toBe(true);
  expect(await panel.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(138, 95, 14)'); // --acc → the lamp's ink #8a5f0e
  const side = await page.getByRole('complementary', { name: 'Боковая панель' }).boundingBox();
  const box = await panel.boundingBox();
  expect(Math.round(box!.width)).toBe(Math.round(side!.width) - 20 - 1); // 10 pt fields each side, the sidebar's line
});

test('the panel failing: the plugin off, «Раздел плагина не загрузился» and «Подробнее» in its place', async ({ page }) => {
  await open(page);
  await page.evaluate(() => ((window as any).__breakPanel = true));
  await section(page).click();
  const alert = page.getByRole('region', { name: 'Панель: Зонд' }).getByRole('alert');
  await expect(alert).toContainText('Раздел плагина не загрузился');
  await expect(alert).toContainText('панель сломалась');
  await expect(section(page)).toHaveCount(0); // the plugin is off, its section gone
  await alert.getByRole('button', { name: 'Подробнее' }).click();
  await expect(settingsSheet(page)).toBeVisible();
  await expect(settingsSheet(page)).toContainText('Плагины');
});
