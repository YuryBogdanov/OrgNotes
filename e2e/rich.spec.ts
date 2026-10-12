import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';
import { FILES, WORK } from './richFixture';

// ТЗ «Оформленный текст в редакторе», этап 1.
const W = '/mock/work.org';
const disk = (page: Page, p = W) => page.evaluate((p) => (window as any).__disk[p] as string, p);
const ed = (page: Page) => page.locator('section.pane.active .cm-editor');
const line = (page: Page, text: string | RegExp) => ed(page).locator('.cm-line', { hasText: text }).first();

async function open(page: Page, rich = true, files: Record<string, string> = FILES()) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (rich) await page.addInitScript(() => localStorage.setItem('editor:rich', '1'));
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.locator('.nav .row[data-key="/mock/work.org"]').click();
  await expect(line(page, 'Подготовить бюджет')).toBeVisible();
}

test.describe('switching', () => {
  test('«Текст / Оформление» over the editor: every pane, kept on this Mac, the file not changed nor marked', async ({ page }) => {
    await open(page, false);
    await expect(ed(page)).not.toHaveClass(/cm-rich/);
    await page.keyboard.press('Meta+Backslash'); // a second pane
    await page.getByRole('group', { name: 'Вид текста' }).first().getByRole('button', { name: 'Оформление' }).click();
    await expect(page.locator('.cm-editor.cm-rich')).toHaveCount(2);
    expect(await page.evaluate(() => localStorage.getItem('editor:rich'))).toBe('1');
    expect(await disk(page)).toBe(WORK());
    await expect(page.locator('section.pane .tab.dirty')).toHaveCount(0);
    await page.keyboard.press('Shift+Meta+p');
    await page.keyboard.type('оформленный');
    await expect(page.getByRole('dialog', { name: 'Командная палитра' }).locator('.row.on .hint')).toHaveText('включён');
    await page.keyboard.press('Enter');
    await expect(page.locator('.cm-editor.cm-rich')).toHaveCount(0);
    expect(await disk(page)).toBe(WORK());
  });

  test('line numbers are hidden while drawn; the setting brings them back', async ({ page }) => {
    await open(page);
    await expect(ed(page).locator('.cm-lineNumbers')).toHaveCount(0);
    await openSettingsSheet(page, 'Основные');
    await page.getByRole('switch', { name: 'Номера строк в оформленном виде' }).click();
    await page.keyboard.press('Escape');
    await expect(ed(page).locator('.cm-lineNumbers')).toHaveCount(1);
  });
});

test.describe('drawn', () => {
  test('every element of the table, with the real text in the file', async ({ page }) => {
    await open(page);
    await expect(line(page, 'Работа')).toHaveText('Работа'); // #+TITLE: hidden
    await expect(line(page, 'Работа')).toHaveClass(/cm-r-title/);
    await expect(ed(page).locator('.cm-r-tags .tag')).toHaveText(['work', 'planning', 'budget', 'finance', 'cto', 'hr']);
    const h = line(page, 'Подготовить бюджет');
    await expect(h.locator('.cm-r-dot')).toHaveCount(1);
    await expect(h.locator('.cm-r-status')).toHaveText('TODO');
    await expect(h.locator('.cm-r-status')).toHaveAttribute('aria-label', 'Статус: TODO');
    await expect(h.locator('.cm-r-cap.prio')).toHaveText('A');
    await expect(h.locator('.cm-r-bar')).toHaveText('1/3');
    await expect(h).toHaveClass(/cm-r-h2/);
    const plan = line(page, 'Дедлайн');
    await expect(plan.locator('.cm-r-chip.dead')).toContainText('через 13 дн');
    await expect(plan.locator('.cm-r-chip.sched')).toContainText('через 3 дн');
    await expect(line(page, 'просрочен').locator('.cm-r-chip.dead.over')).toContainText('просрочен на 2 дн');
    await expect(ed(page).locator('.cm-r-chip.closed')).toContainText('Закрыто');
    await expect(ed(page).locator('.cm-r-chip.drawer')).toHaveText('Свойства');
    await expect(ed(page).locator('.cm-r-b')).toHaveText('пяти команд');
    await expect(ed(page).locator('.cm-r-code')).toHaveText('budget.xlsx');
    await expect(ed(page).locator('.cm-r-i')).toHaveText('обучение');
    await expect(ed(page).locator('.cm-r-box')).toHaveCount(3);
    await expect(ed(page).locator('.cm-r-box.on')).toHaveCount(1);
    await expect(ed(page).locator('.cm-r-bullet')).toHaveCount(1);
    await expect(line(page, 'Собрать заявки')).toHaveClass(/cm-r-hdone/);
    await expect(line(page, 'Команда')).toHaveClass(/cm-r-thead/);
    await expect(ed(page).locator('.cm-line.cm-r-trule')).toHaveCount(1);
    // nothing inside #+BEGIN_SRC
    await expect(line(page, 'не заголовок')).toHaveText('* TODO не заголовок');
    expect(await disk(page)).toBe(WORK());
  });
});

test.describe('editing', () => {
  test('the line the caret goes to by keys shows its real text, the next lines do not move; leaving draws it again', async ({ page }) => {
    await open(page);
    const plan = line(page, 'Дедлайн');
    const next = line(page, 'Свойства');
    const h0 = (await plan.boundingBox())!.height;
    const y0 = (await next.boundingBox())!.y;
    await line(page, 'Подготовить бюджет').locator('.cm-r-bar').click(); // a drawn element: no reveal
    await expect(line(page, 'Подготовить бюджет').locator('.cm-r-status')).toHaveCount(1);
    await line(page, 'Свести заявки').click({ position: { x: 200, y: 8 } });
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    const raw = line(page, 'DEADLINE: <');
    await expect(raw).toBeVisible();
    expect(Math.abs((await raw.boundingBox())!.height - h0)).toBeLessThanOrEqual(1);
    expect(Math.abs((await next.boundingBox())!.y - y0)).toBeLessThanOrEqual(1);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(line(page, 'DEADLINE: <')).toHaveCount(0);
  });

  test('typing TODO gives a capsule; removing an emphasis mark takes the look away', async ({ page }) => {
    await open(page);
    await line(page, 'Тимлиды').click({ position: { x: 300, y: 10 } });
    await page.keyboard.press('Home'); // the real text shows: «* Тимлиды»
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('TODO ');
    await page.keyboard.press('ArrowUp');
    await expect(line(page, 'Тимлиды').locator('.cm-r-status')).toHaveText('TODO');
    await expect.poll(() => disk(page)).toContain('\n* TODO Тимлиды\n');
    await line(page, 'Свести заявки').click({ position: { x: 20, y: 8 } });
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight'); // after «Свести заявки *»
    await page.keyboard.press('Backspace');
    await page.keyboard.press('ArrowDown');
    await expect(ed(page).locator('.cm-r-b')).toHaveCount(0);
    await expect.poll(() => disk(page)).toContain('Свести заявки пяти команд* и');
  });

  test('a click on the status: the set’s menu; the choice is written like the command, the line stays drawn', async ({ page }) => {
    await open(page);
    await line(page, 'Свести расходы').locator('.cm-r-status').click();
    const menu = page.getByRole('menu', { name: 'Статус' });
    await expect(menu.locator('.row .cap')).toHaveText(['TODO', 'NEXT', 'WAIT', 'DONE', 'CANCELLED']);
    await expect(menu.locator('.row', { hasText: 'NEXT' }).locator('.hint')).toHaveText('сейчас');
    await expect(menu.locator('.sep')).toHaveCount(1);
    await expect(menu).toContainText('⇧← ⇧→ — предыдущий / следующий статус');
    await menu.locator('.row', { hasText: 'DONE' }).click();
    await expect.poll(() => disk(page)).toMatch(/\*\*\* DONE Свести расходы по направлениям \[1\/3\]\nCLOSED: \[/);
    await expect(line(page, 'Свести расходы').locator('.cm-r-status')).toHaveText('DONE');
  });

  test('the priority menu and the date calendar; a checkbox ticks and the cookie is counted again; «› Свойства» opens the drawer', async ({ page }) => {
    await open(page);
    await line(page, 'Подготовить бюджет').locator('.cm-r-cap.prio').click();
    await page.getByRole('menu', { name: 'Приоритет' }).locator('.row', { hasText: 'B' }).click();
    await expect.poll(() => disk(page)).toContain('** TODO [#B] Подготовить бюджет 2027');
    await ed(page).locator('.cm-r-chip.sched', { hasText: 'завтра' }).click();
    await expect(page.getByRole('dialog', { name: 'Командная палитра' }).locator('.cal')).toBeVisible(); // the palette's calendar (ТЗ 20)
    await page.keyboard.press('.'); // today
    await page.keyboard.press('Shift+ArrowDown'); // a week on
    await page.keyboard.press('Enter');
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await expect.poll(() => disk(page)).toContain(`*** NEXT Свести расходы по направлениям [1/3]\nSCHEDULED: <${iso}`);
    await ed(page).locator('.cm-r-box').nth(1).click();
    await expect.poll(() => disk(page)).toContain('- [X] найм');
    expect(await disk(page)).toContain('Свести расходы по направлениям [2/3]'); // the heading above, its cookie counted again
    await ed(page).locator('.cm-r-chip.drawer').click();
    await expect(line(page, ':Effort:')).toBeVisible();
  });
});

test('a 50 000-line file opens and scrolls drawn about as fast as plain', async ({ page }) => {
  const big = Array.from({ length: 5000 }, (_, i) => `* TODO Задача ${i} [1/2] :tag:\nSCHEDULED: <2026-10-${String((i % 28) + 1).padStart(2, '0')} Wed>\n- [X] *один*\n- [ ] /два/\nтекст =код= и ещё\n| a | b |\n|---+---|\n| 1 | 2 |\nстрока\n`).join('');
  const files = { '/mock/work.org': big, '/mock/arch.org': '* A\n' };
  const timeIt = async (rich: boolean) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((r) => localStorage.setItem('editor:rich', r ? '1' : '0'), rich);
    await installTauriMock(page, files);
    await page.goto('/');
    await expect(page.locator('.cm-content').first()).toBeVisible();
    const t0 = Date.now();
    await page.locator('.nav .row[data-key="/mock/work.org"]').click();
    await expect(line(page, 'Задача 0')).toBeVisible();
    for (let i = 0; i < 10; i++) await ed(page).locator('.cm-scroller').evaluate((el) => (el.scrollTop += 4000));
    await expect(line(page, /Задача \d+/)).toBeVisible();
    return Date.now() - t0;
  };
  const plain = await timeIt(false);
  const drawn = await timeIt(true);
  expect(drawn).toBeLessThan(plain * 2 + 1500);
});
