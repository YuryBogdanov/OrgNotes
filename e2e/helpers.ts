import { expect, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';

// What the e2e specs share (tech sprint 0.3): the mock's disk and log, the app's sheets and toasts, the palette,
// and one way to open the app. A spec imports them under the names it used (`import { diskAll as disk }`).

/** Every file of the mock's disk, by its path. */
export const diskAll = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
/** One file of the mock's disk (undefined when there is none). */
export const diskFile = (page: Page, p: string) => page.evaluate((x) => (window as any).__disk[x] as string, p);
/** What the mock was asked (commands that write, panels, windows): `[name, …args]`. */
export const log = (page: Page) => page.evaluate(() => (window as any).__log as unknown[][]);

export const settingsSheet = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });
export const palette = (page: Page) => page.getByRole('dialog', { name: 'Командная палитра' });
export const toast = (page: Page) => page.locator('.toast');

/** ⇧⌘P, and the palette open with its field in focus (keys pressed before that would be lost). */
export async function openPalette(page: Page) {
  await page.keyboard.press('Shift+Meta+p');
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).getByRole('textbox').first()).toBeFocused();
}

export interface OpenApp {
  /** The notes (path → text) and anything else of the mock's disk (plugins under /config/plugins/…). */
  files: Record<string, string>;
  /** Plugins on and trusted, with the rights they were trusted for: `{ canvas: ['files.edit', 'index.read'] }`. */
  plugins?: Record<string, string[]>;
  /** The window's clock, fixed (timers still run). */
  now?: Date;
  viewport?: { width: number; height: number };
  /** localStorage before the app starts. */
  local?: Record<string, string>;
  /** The mock's options (`today`, `remind`, delays). */
  mock?: Parameters<typeof installTauriMock>[2];
  /** Wait for the editor and the plugins (default); false — the start screen, a test of the loading itself. */
  ready?: boolean;
}
/** The app opened as the tests usually need it: the window size, the clock, the plugins, the folder read. */
export async function openApp(page: Page, o: OpenApp) {
  await page.setViewportSize(o.viewport ?? { width: 1440, height: 900 });
  if (o.now) await page.clock.setFixedTime(o.now);
  const local: Record<string, string> = { 'plugins:updatesChecked': String(Date.now()), ...(o.local ?? {}) };
  if (o.plugins) {
    local['plugins:enabled'] = JSON.stringify(Object.fromEntries(Object.keys(o.plugins).map((id) => [id, true])));
    local['plugins:trusted'] = JSON.stringify(Object.fromEntries(Object.entries(o.plugins).map(([id, rights]) => [id, JSON.stringify([[...rights].sort(), []])])));
  }
  await page.addInitScript((ls) => {
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
  }, local);
  await installTauriMock(page, o.files, o.mock);
  await page.goto('/');
  if (o.ready === false) return;
  await expect(page.locator('.cm-content, .toolbar').first()).toBeVisible();
  await pluginsReady(page);
}
