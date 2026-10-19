import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// fix #315: «Долгие дела» — «Статус ожидания» offers every open state of «Статусы» by set; «Статусы бэклога»: matters
// in them are not watched, their own folded group «Бэклог» at the bottom; «В бэклог» / «Из бэклога» in a row's menu;
// no dot of a change in the plugin's settings.

const NOW = new Date(2026, 9, 16, 11, 0);
const MID = ['#+TODO: TODO NEXT WAIT SOMEDAY | DONE', '* NEXT Миграция биллинга', '* SOMEDAY Идея на потом', '* TODO Обновить SLA', ''].join('\n');
const view = (page: Page) => page.locator('.lmv.next');

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await page.addInitScript((m) => ((window as any).__mtimeInit = m), { '/mock/Midterm.org': new Date(2026, 8, 1).getTime() });
  await openApp(page, { files: { '/mock/Midterm.org': MID }, now: NOW, ready: false, viewport: { width: 1440, height: 900 } });
  await pluginsReady(page);
}

test('the settings: the waiting status by set, the backlog\'s chips; the list: «Бэклог» folded, not due; the menu takes it out', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+,');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await s.getByRole('tab', { name: 'Долгие дела', exact: true }).click();
  await expect(s.locator('.dot')).toHaveCount(0);
  // «Статус ожидания»: the open states, the set's name a line that is not chosen
  await s.getByRole('button', { name: /^Статус ожидания:/ }).click();
  const items = page.getByRole('menuitem');
  await expect(items.filter({ hasText: 'SOMEDAY' })).toHaveCount(1);
  await expect(items.filter({ hasText: 'NEXT' })).toHaveCount(1);
  await expect(page.getByRole('menuitem', { disabled: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  // «Статусы бэклога»: SOMEDAY
  await s.getByRole('button', { name: 'SOMEDAY', exact: true }).click();
  await expect(s.getByRole('button', { name: 'SOMEDAY', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  // the list: «Бэклог · 1» at the bottom, folded; «Идея на потом» not due
  await page.keyboard.press('Control+Meta+9');
  await page.getByRole('button', { name: 'Открыть список ›' }).click();
  await expect(view(page)).toBeVisible();
  const back = view(page).locator('.grp.backlog');
  await expect(back).toContainText('Бэклог');
  await expect(back).toHaveAttribute('aria-expanded', 'false');
  await expect(view(page).locator('.grp.due')).toBeVisible();
  await expect(view(page).locator('.row', { hasText: 'Идея на потом' })).toHaveCount(0);
  await back.click();
  const row = view(page).locator('.row', { hasText: 'Идея на потом' });
  await expect(row).toBeVisible();
  // «Из бэклога»: back to an open status out of the backlog
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Из бэклога' }).click();
  await expect(view(page).locator('.grp.backlog')).toHaveCount(0);
  // «В бэклог» on another
  await view(page).locator('.row', { hasText: 'Обновить SLA' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /В бэклог/ }).click();
  await expect(view(page).locator('.grp.backlog')).toContainText('1');
});
