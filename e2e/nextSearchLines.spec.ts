import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 50.6: the search of the sidebar's panel — a result one line of 24 pt (a heading's capsule and title, or the line
// of text; the heading it is under in the tip); a file's row of 24 pt with its icon; past 40 results the files after
// the third folded; ↑↓ over the files' rows too, → ← on one unfold and fold it; a window of 900 pt shows 25 rows.

const files = (n: number, per: number) => {
  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    const lines = [`* TODO Переезд ${i}`];
    for (let k = 1; k < per; k++) lines.push(`Строка про переезд ${k}`);
    out[`/mock/f${String(i).padStart(2, '0')}.org`] = lines.join('\n') + '\n';
  }
  return out;
};
const res = (page: Page) => page.getByRole('listbox', { name: 'Результаты поиска' });
async function search(page: Page, f: Record<string, string>) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: f, ready: false, viewport: { width: 1300, height: 900 } });
  await page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('button', { name: /Поиск/ }).click();
  const q = page.getByRole('textbox', { name: 'Поиск по всем файлам' });
  await q.fill('переезд');
  await q.press('Enter');
  await expect(res(page).locator('.file').first()).toBeVisible();
  return q;
}

test('one line a result, 24 pt: a heading — its capsule and title; a text line; the heading in the tip; a file\'s row with its icon', async ({ page }) => {
  await search(page, files(2, 3));
  const hits = res(page).locator('.hit');
  await expect(hits.first()).toHaveCSS('height', '24px');
  await expect(hits.first().locator('.kw')).toHaveText('TODO');
  await expect(hits.first().locator('.frag')).toHaveText('Переезд 0');
  await expect(hits.first().locator('mark')).toHaveCSS('font-weight', '600');
  await expect(hits.nth(1).locator('.kw')).toHaveCount(0);
  await expect(hits.nth(1)).toHaveAttribute('title', 'Переезд 0');
  const file = res(page).locator('.file').first();
  await expect(file).toHaveCSS('height', '24px');
  await expect(file.locator('.fi')).toBeVisible();
  await expect(file.locator('.fn')).toHaveText('f00');
});

test('a window of 900 pt: at least 25 rows of results in sight', async ({ page }) => {
  await search(page, files(10, 3)); // 30 results, every file open
  const list = (await res(page).boundingBox())!;
  const rows = await res(page).locator('.file, .hit').evaluateAll((els, b) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.top >= b.y && r.bottom <= b.y + b.height; }).length, list);
  expect(rows).toBeGreaterThanOrEqual(25);
});

test('past 40 results: the files after the third folded; → ← on a file\'s row; ↩ on it folds it', async ({ page }) => {
  const q = await search(page, files(15, 3)); // 45 results
  const f = res(page).locator('.file');
  await expect(f.nth(2)).toHaveAttribute('aria-expanded', 'true');
  await expect(f.nth(3)).toHaveAttribute('aria-expanded', 'false');
  await q.press('ArrowDown');
  await expect(f.first()).toHaveClass(/sel/);
  await res(page).press('ArrowLeft');
  await expect(f.first()).toHaveAttribute('aria-expanded', 'false');
  await res(page).press('ArrowDown'); // the next file's row: the first has no results shown now
  await expect(f.nth(1)).toHaveClass(/sel/);
  await res(page).press('Enter');
  await expect(f.nth(1)).toHaveAttribute('aria-expanded', 'false');
  await res(page).press('ArrowRight');
  await expect(f.nth(1)).toHaveAttribute('aria-expanded', 'true');
});
