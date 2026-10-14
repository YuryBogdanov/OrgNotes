import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { FILES } from './kanbanFixture';

// ТЗ 33 (part C): «В архив» and «Удалить» while a card is dragged (the archive as Emacs keeps it: «<file>_archive»,
// ARCHIVE_* properties, one transaction over two files), ⌘⌫; the card at the side with its subtree edited right there.

const P = '/mock/work/platform.org';
const A = '/mock/work/platform.org_archive';
const disk = (page: Page, p = P) => page.evaluate((x) => (window as any).__disk[x] as string | undefined, p);
const board = (page: Page) => page.locator('.kanban');
const card = (page: Page, title: string) => board(page).locator('.kb-card', { hasText: title });
const toast = (page: Page) => page.locator('.toast');

async function open(page: Page, files: Record<string, string> = FILES()) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await installTauriMock(page, files);
  await page.goto('/');
  await pluginsReady(page);
  await page.getByRole('treeitem', { name: /work/ }).click();
  await page.getByRole('treeitem', { name: /platform/ }).click();
  await expect(board(page)).toBeVisible();
}
async function dragToZone(page: Page, title: string, zone: 'archive' | 'delete') {
  const b = (await card(page, title).boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + 30, b.y + 20, { steps: 3 });
  const z = page.locator(`[data-zone="${zone}"]`);
  await expect(z).toBeVisible();
  const r = (await z.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 8 });
  await expect(z).toHaveClass(/on/);
  await expect(z).toContainText(zone === 'delete' ? 'Отпустите — карточка и её содержимое удалятся из файла' : 'Отпустите — карточка уйдёт в архив');
  await page.mouse.up();
}

test('the zones only while dragging; «В архив»: the subtree to «platform.org_archive» with ARCHIVE_*, out of the file; «Отменить» brings it back', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-zone]')).toHaveCount(0);
  const before = await disk(page);
  await dragToZone(page, 'Переезд в новый ДЦ', 'archive');
  await expect(card(page, 'Переезд в новый ДЦ')).toHaveCount(0);
  await expect.poll(() => disk(page, A)).toMatch(/\* DOING \[#A\] Переезд в новый ДЦ \[2\/5\] +:infra:dc:\n:PROPERTIES:\n:ARCHIVE_TIME: \d{4}-\d\d-\d\d \S+ \d\d:\d\d\n:ARCHIVE_FILE: \/mock\/work\/platform\.org\n:ARCHIVE_CATEGORY: platform\n:ARCHIVE_TODO: DOING\n:END:\n\*\* Чек-лист\n- \[X\] Инвентаризация/);
  expect(await disk(page)).not.toContain('Переезд в новый ДЦ');
  await expect(toast(page)).toContainText('Перенесено в архив');
  // the archive: in the navigator, not in the agenda
  await expect(page.getByRole('treeitem', { name: /platform\.org_archive/ })).toBeVisible();
  await toast(page).getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(() => disk(page)).toBe(before);
  await expect.poll(() => disk(page, A)).not.toContain('Переезд');
  await expect(card(page, 'Переезд в новый ДЦ')).toBeVisible();
});

test('«Удалить»: the card and its subtree out of the file, «Карточка удалена · Отменить», ⌘Z; ⌘⌫ on the chosen one', async ({ page }) => {
  await open(page);
  const before = await disk(page);
  await dragToZone(page, 'RFC логирования', 'delete');
  await expect.poll(() => disk(page)).not.toContain('RFC логирования');
  expect(await disk(page)).not.toContain('- [X] раз');
  await expect(toast(page)).toContainText('Карточка удалена');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page)).toBe(before);
  await card(page, 'Алерты v2: дизайн').click(); // chosen (ТЗ 34: a click opens nothing)
  await page.keyboard.press('Meta+Backspace');
  await expect.poll(() => disk(page)).not.toContain('Алерты v2');
});

test('the card at the side: a double click opens it (a click with it open switches it), its subtree edited right there goes to the file; the status menu, «В файле ›», ⎋', async ({ page }) => {
  await open(page);
  await card(page, 'Переезд в новый ДЦ').dblclick();
  const peek = board(page).getByRole('dialog', { name: 'Карточка' });
  await expect(peek).toBeVisible();
  await expect(peek.locator('.kb-pt')).toHaveText('Переезд в новый ДЦ');
  await expect(peek.locator('.cm-line')).toHaveCount(3); // the heading, «Чек-лист», its line — not the next card
  await expect(peek.locator('.cm-gutters')).toHaveCount(0);
  await peek.locator('.cm-line', { hasText: 'Инвентаризация' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' сервисов');
  await expect.poll(() => disk(page)).toContain('- [X] Инвентаризация сервисов');
  // another card switches it
  await card(page, 'RFC логирования').click();
  await expect(peek.locator('.kb-pt')).toHaveText('RFC логирования');
  await peek.getByRole('button', { name: /REVIEW/ }).click();
  await page.getByRole('menuitem', { name: 'DONE' }).click();
  await expect.poll(() => disk(page)).toMatch(/\* DONE RFC логирования +:docs:\nCLOSED: \[/);
  await peek.locator('.cm-content').click();
  await page.keyboard.press('Escape');
  await expect(peek).toHaveCount(0);
  await card(page, 'Обновить Kafka до 3.8').dblclick();
  await board(page).getByRole('button', { name: 'В файле ›' }).click();
  await expect(board(page)).toHaveCount(0);
  await expect(page.locator('.cm-activeLine')).toContainText('Обновить *Kafka* до 3.8');
});

test('↩ on the chosen card opens it at the side; ⌘↩ in a new card\'s field makes it and opens it', async ({ page }) => {
  await open(page);
  await card(page, 'Миграция логов в ClickHouse').click();
  await expect(board(page).getByRole('dialog', { name: 'Карточка' })).toHaveCount(0); // a click only chooses
  await page.keyboard.press('Enter');
  await expect(board(page).getByRole('dialog', { name: 'Карточка' }).locator('.kb-pt')).toHaveText('Миграция логов в ClickHouse');
  await page.keyboard.press('Escape');
  await board(page).getByRole('listitem', { name: 'TODO', exact: true }).getByRole('button', { name: '+ Карточка' }).click();
  await page.keyboard.type('Новая с панелью');
  await page.keyboard.press('Meta+Enter');
  await expect(board(page).getByRole('dialog', { name: 'Карточка' }).locator('.kb-pt')).toHaveText('Новая с панелью');
  await expect.poll(() => disk(page)).toContain('* TODO Новая с панелью');
});

test('an archive («.org_archive») is in the navigator and opens, but its tasks are not in the agenda', async ({ page }) => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const files = { ...FILES(), [A]: `* TODO Из архива\nSCHEDULED: <${today}>\n`, '/mock/work/live.org': `* TODO Живая задача\nSCHEDULED: <${today}>\n` };
  await page.setViewportSize({ width: 1600, height: 900 });
  await installTauriMock(page, files);
  await page.goto('/');
  await pluginsReady(page);
  await page.getByRole('treeitem', { name: /work/ }).click();
  await page.getByRole('treeitem', { name: /platform\.org_archive/ }).click();
  await expect(page.locator('.cm-content')).toContainText('Из архива');
  await page.keyboard.press('Meta+2');
  await expect(page.locator('.agenda')).toContainText('Живая задача');
  await expect(page.locator('.agenda')).not.toContainText('Из архива');
});
