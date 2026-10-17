import { expect, test, type Page } from '@playwright/test';
import { diskAll as disk, openApp } from './helpers';

// ТЗ 44.4 (§4): the sheets of the new interface — «Сохранить изменения?» (the tabs' names of §11, ⌘D), «Файл изменён
// другой программой» (the two plates with a line of difference each, ↩ compares, «Сравнить…» 720 pt), the tree's
// «В Корзину?», «Сохранить как»; and what the window lacked — ⌃C ⌃Z's note, the quick entry ⇧⌘I.

const A = '/mock/Команда/Безопасность/Ольга.org';
const B = '/mock/Команда/Платформа/Ольга.org';
const WORK = '* Роадмап\nтекст\n* Переезд хранилища\nодин\n';
const F = { '/mock/work.org': WORK, [A]: '* 1-1\n', [B]: '* 1-1\n', '/mock/inbox.org': '* X\n' };
const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', 'layout', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store, await import('/src/layout.ts' as string)), code);

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  await expect.poll(() => store(page, 'return store.loaded')).toBe(true);
}

test('«Сохранить изменения?»: the tabs by their names, «Не сохранять ⌘D», «Отмена», the main one focused', async ({ page }) => {
  await open(page);
  await page.evaluate((p) => ((window as any).__failWrites = p), [A, B]); // the edits stay in the tabs
  await store(page, `store.open(store.files.findIndex((f) => f.path === '${A}'), 0); layout.openFile(store.layout, 0, '${B}', 0, { replace: false }); layout.openFile(store.layout, 0, '/mock/inbox.org', 0, { replace: false });`);
  await store(page, `store.setText('* 1-1\\nправка\\n', '${A}'); store.setText('* 1-1\\nещё\\n', '${B}');`);
  await store(page, `const p = store.layout.panes[0]; void store.closeOthers(0, p.active);`); // «Закрыть остальные» from inbox
  const s = page.getByRole('alertdialog', { name: /Сохранить изменения в 2/ });
  await expect(s).toBeVisible();
  expect(await s.evaluate((e) => !e.closest('.compat'))).toBe(true);
  await expect(s.locator('li .nm')).toHaveText(['Ольга — Безопасность', 'Ольга — Платформа']);
  await expect(s.getByRole('button', { name: /Сохранить всё/ })).toBeFocused();
  await page.keyboard.press('Meta+d');
  await expect(s).toHaveCount(0);
});

test('«Файл изменён другой программой»: 520 pt, the two plates with a line each; ↩ compares (720 pt); «Оставить мою версию»', async ({ page }) => {
  await open(page);
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'work' }).click();
  await page.evaluate(() => ((window as any).__failWrites = ['/mock/work.org']));
  await store(page, `store.setText('* Роадмап\\nтекст\\n* Переезд хранилища\\nодин\\nдва\\nтри\\nчетыре\\n', '/mock/work.org');`);
  await page.evaluate((t) => (window as any).__setDisk('/mock/work.org', t), '* Роадмап\nтекст\nс диска\n* Переезд хранилища\nодин\n');
  const s = page.getByRole('alertdialog', { name: /изменён другой программой/ });
  await expect(s).toBeVisible();
  expect(Math.round((await s.boundingBox())!.width)).toBe(520);
  await expect(s.getByLabel('Моя версия')).toContainText('+3 строки в «Переезд хранилища»');
  await expect(s.getByLabel('На диске')).toContainText('+1 строка в «Роадмап»');
  await expect(s.getByRole('button', { name: 'Сравнить…' })).toBeFocused();
  await page.keyboard.press('Enter');
  const cmp = page.getByRole('dialog', { name: 'Сравнение версий «work»' });
  await expect(cmp).toBeVisible();
  expect(Math.round((await cmp.boundingBox())!.width)).toBe(720);
  await cmp.getByRole('button', { name: 'Оставить мою версию' }).click();
  await expect(cmp).toHaveCount(0);
});

test('the tree\'s «В Корзину?» and «Сохранить как» for a new note: the new sheets', async ({ page }) => {
  await open(page);
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'inbox' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Корзину/ }).click();
  const del = page.getByRole('alertdialog', { name: 'Удаление' });
  await expect(del).toContainText('Переместить «inbox» в Корзину?');
  await del.getByRole('button', { name: 'Отмена' }).click();
  await expect(del).toHaveCount(0);
  await page.getByRole('button', { name: 'Новая вкладка' }).click();
  await store(page, "store.tab.text = 'Черновик плана\\nтекст';");
  await page.keyboard.press('Meta+s');
  const sa = page.getByRole('dialog', { name: 'Сохранить как' });
  await expect(sa).toBeVisible();
  await expect(sa.getByLabel('Сохранить как:')).toHaveValue('Черновик плана');
  await page.keyboard.press('Enter');
  await expect(sa).toHaveCount(0);
  await expect.poll(async () => Object.keys(await disk(page))).toContain('/mock/Черновик плана.org');
});

test('what the window lacked: ⌃C ⌃Z\'s note, the quick entry', async ({ page }) => {
  await open(page);
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'work' }).click();
  await page.locator('.cm-line', { hasText: 'Роадмап' }).click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('dialog', { name: /заметк/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Meta+i');
  await expect(page.locator('.capscrim')).toBeVisible();
});
