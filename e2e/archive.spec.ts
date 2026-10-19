import { expect, test, type Page } from '@playwright/test';
import { diskAll, openApp, palette, toast } from './helpers';

// ТЗ 41.0 (§7): «Архивировать поддерево» of the core, as Emacs's `org-archive-subtree`: ⌃C ⌃X ⌃S, the palette, the
// heading's menu in both interfaces; the place by `:ARCHIVE:` of the heading or its ancestors, then «#+ARCHIVE:», then
// «<file>.org_archive» at its top level; ARCHIVE_* properties; one step of ⌘Z over both files.

const WORK = '#+TITLE: Работа\n* Q4\n** TODO Бюджет 2027\nСвести заявки.\n*** Заявки отделов\n** NEXT План найма\n';
const disk = async (page: Page, p: string) => (await diskAll(page))[p];

async function open(page: Page, files: Record<string, string>, next = false) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  if (next) await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files, ready: false, viewport: { width: 1440, height: 820 } });
  if (next) await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'work' }).click();
  else await page.getByRole('treeitem', { name: /work/ }).first().click();
}
async function caretOn(page: Page, text: string) {
  await page.locator('.cm-line', { hasText: text }).first().click();
}
const chord = async (page: Page) => {
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+x');
  await page.keyboard.press('Control+s');
};

test('⌃C ⌃X ⌃S: the subtree to «work.org_archive» at its top level with ARCHIVE_*, out of the file; ⌘Z brings both back', async ({ page }) => {
  await open(page, { '/mock/work.org': WORK });
  await caretOn(page, 'Бюджет 2027');
  await chord(page);
  await expect
    .poll(() => disk(page, '/mock/work.org_archive'))
    .toMatch(/^\* TODO Бюджет 2027\n:PROPERTIES:\n:ARCHIVE_TIME: \d{4}-\d\d-\d\d \S\S \d\d:\d\d\n:ARCHIVE_FILE: \/mock\/work\.org\n:ARCHIVE_OLPATH: Q4\n:ARCHIVE_CATEGORY: work\n:ARCHIVE_TODO: TODO\n:END:\nСвести заявки\.\n\*\* Заявки отделов\n?$/);
  expect(await disk(page, '/mock/work.org')).toBe('#+TITLE: Работа\n* Q4\n** NEXT План найма\n');
  await expect(toast(page)).toContainText('В архиве');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page, '/mock/work.org')).toBe(WORK);
  await expect.poll(() => disk(page, '/mock/work.org_archive')).not.toContain('Бюджет');
});

test('the place: «:ARCHIVE:» of an ancestor wins over «#+ARCHIVE:»; «::* Heading» — under it, made when missing; the same file', async ({ page }) => {
  const text = '#+ARCHIVE: old.org::\n* Q4\n:PROPERTIES:\n:ARCHIVE: ::* Архив\n:END:\n** DONE Бюджет 2027\n* Q1\n** DONE Ретро\n';
  await open(page, { '/mock/work.org': text, '/mock/old.org': '* Прошлое\n' });
  await caretOn(page, 'Бюджет 2027');
  await chord(page);
  await expect.poll(() => disk(page, '/mock/work.org')).toMatch(/\* Q1\n\*\* DONE Ретро\n\n\* Архив\n\*\* DONE Бюджет 2027\n:PROPERTIES:\n:ARCHIVE_TIME: [^\n]+\n:ARCHIVE_FILE: \/mock\/work\.org\n:ARCHIVE_OLPATH: Q4\n/);
  expect(await disk(page, '/mock/work.org')).not.toMatch(/:END:\n\*\* DONE Бюджет 2027\n\* Q1/);
  await caretOn(page, 'Ретро');
  await chord(page);
  await expect.poll(() => disk(page, '/mock/old.org')).toMatch(/^\* Прошлое\n\n\* DONE Ретро\n:PROPERTIES:/);
  expect(await disk(page, '/mock/work.org')).not.toContain('Ретро');
});

test('the palette «Архивировать поддерево» and the old editor menu «В архив»', async ({ page }) => {
  await open(page, { '/mock/work.org': WORK });
  await caretOn(page, 'План найма');
  await page.keyboard.press('Shift+Meta+p');
  await expect(palette(page).getByRole('combobox').first()).toBeFocused();
  await page.keyboard.type('архивировать');
  await expect(palette(page).getByRole('option', { name: /Архивировать поддерево/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page, '/mock/work.org_archive')).toContain('* NEXT План найма');
  await page.locator('.cm-line', { hasText: 'Бюджет 2027' }).click({ button: 'right' });
  const item = page.getByRole('menuitem', { name: /В архив/ });
  await expect(item).toContainText('⌃C ⌃X ⌃S');
  await item.click();
  await expect.poll(() => disk(page, '/mock/work.org_archive')).toContain('* TODO Бюджет 2027');
  await expect.poll(() => disk(page, '/mock/work.org')).toMatch(/^#\+TITLE: Работа\n\* Q4\n?$/); // the source is written after the archive
});

test('the new interface: «В архив» in the heading menu; none in an archive file', async ({ page }) => {
  await open(page, { '/mock/work.org': WORK, '/mock/old.org_archive': '* DONE Было\n' }, true);
  await page.locator('.cm-line', { hasText: 'Бюджет 2027' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /В архив/ }).click();
  await expect.poll(() => disk(page, '/mock/work.org_archive')).toContain('* TODO Бюджет 2027');
  await expect(page.locator('.cm-line', { hasText: 'Бюджет 2027' })).toHaveCount(0);
});
