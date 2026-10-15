import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, expandTree } from './tauriMock';
import { log } from './helpers';

// ТЗ «Перенос заголовка в другой файл (файл → заголовок)».
const W = '/mock/work.org';
const F = '/mock/Работа/Финансы/finance.org';
const IB = '/mock/inbox.org';
const WORK = '#+TITLE: Работа\n\n* Q4 2026\n** TODO [#A] Подготовить бюджет 2027 :budget:\nDEADLINE: <2026-10-24 Sat>\nСвести заявки.\n*** DONE Собрать заявки\n** NEXT План найма\n';
const FINANCE = [
  '#+TITLE: Финансы',
  '* Бюджеты',
  '** Бюджет 2026',
  '*** Заявки',
  '*** Расходы',
  '** DONE Бюджет 2025 :archive:',
  '*** Итоги',
  '** Шаблоны и правила',
  '',
  '* Отчётность',
  '** Квартальные отчёты',
  '*** TODO Отчёт за Q3 :report:',
  '*** NEXT Отчёт за Q4 :report:',
  '** Аудит 2026',
  '* Закупки',
  '** Отчёты поставщиков',
  '',
].join('\n');
const INBOX = '#+TITLE: Inbox\n* TODO Позвонить в банк про лимиты\n:PROPERTIES:\n:CREATED: [2026-10-11 Sun 09:12]\n:END:\nпо карте компании\n\n* TODO Согласовать отпуск\n';
const FILES = () => ({
  [W]: WORK,
  [F]: FINANCE,
  '/mock/journal.org': '* Октябрь\n',
  '/mock/Команда/hiring.org': '* Вакансии\n',
  [IB]: INBOX,
  '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'inbox.org' } }),
});

const disk = (page: Page, p: string) => page.evaluate((p) => (window as any).__disk[p] as string, p);
const dlg = (page: Page) => page.getByRole('dialog', { name: /^Перенести/ });
const field = (page: Page) => dlg(page).getByRole('combobox');
const fileTitles = (page: Page) => dlg(page).locator('.row .t').allInnerTexts();
const groups = (page: Page) => dlg(page).locator('.gh').allInnerTexts();
const node = (page: Page, title: string) => dlg(page).locator('.node', { has: page.locator('.nt', { hasText: new RegExp('^' + title + '$') }) });
const nodeTitles = (page: Page) => dlg(page).locator('.node .nt').allInnerTexts();
const on = (page: Page) => dlg(page).locator('[aria-selected="true"]');

async function open(page: Page, files: Record<string, string> = FILES(), init?: () => void) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (init) await page.addInitScript(init);
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.locator('.nav .row[data-key="/mock/work.org"]').click();
  await expect(page.locator('.cm-content').first()).toContainText('Q4 2026');
}
/** The palette's command on the heading with this text. */
async function refile(page: Page, heading = 'Подготовить бюджет') {
  await page.locator('section.pane .cm-line', { hasText: heading }).first().click();
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('перен');
  await page.keyboard.press('Enter');
  await expect(dlg(page)).toBeVisible();
}
async function toFile(page: Page, q: string) {
  await page.keyboard.type(q);
  await page.keyboard.press('Enter');
  await expect(dlg(page).locator('.tok')).not.toHaveText('Перенести в');
}

test.describe('step 1: the file', () => {
  test('the plate, the label, recent and all files; the own file is there (moving within it)', async ({ page }) => {
    await open(page, FILES(), () => localStorage.setItem('refile:recent:/mock', JSON.stringify([{ path: '/mock/Команда/hiring.org', key: '' }])));
    await refile(page);
    await expect(dlg(page)).toHaveAttribute('aria-label', 'Перенести заголовок');
    const plate = dlg(page).locator('.plate');
    await expect(plate.locator('.cap')).toHaveText('Переносится заголовок');
    await expect(plate.locator('.kw')).toHaveText('TODO');
    await expect(plate.locator('.ttl')).toHaveText('[#A] Подготовить бюджет 2027');
    await expect(plate.locator('.right')).toHaveText('+1 подзаголовок · из work');
    await expect(dlg(page).locator('.tok')).toHaveText('Перенести в');
    await expect(field(page)).toHaveAttribute('placeholder', 'файл…');
    await expect(field(page)).toBeFocused();
    expect(await groups(page)).toEqual(['НЕДАВНИЕ', 'ВСЕ ФАЙЛЫ']);
    expect((await fileTitles(page))[0]).toBe('hiring'); // the last place moved to comes first
    await expect(on(page).locator('.t')).toHaveText('hiring');
    await expect(dlg(page).locator('.row', { hasText: 'finance' }).locator('.hint')).toHaveText('Работа › Финансы');
    await expect(dlg(page).locator('.row', { hasText: 'journal' }).locator('.hint')).toHaveText('mock');
    await expect(dlg(page).locator('.row', { hasText: 'work' }).locator('.hint')).toHaveText('mock · этот файл');
    await expect(dlg(page).locator('.foot')).toHaveText(/↑ ↓выбрать.*↩к заголовкам файла.*⌘↩сразу на 1-й уровень.*⌫к командам.*⎋закрыть/);
  });

  test('a search by name and path: one group, a name match first; nothing found says so', async ({ page }) => {
    await open(page);
    await refile(page);
    await page.keyboard.type('раб');
    expect(await groups(page)).toEqual(['ФАЙЛЫ']);
    expect(await fileTitles(page)).toEqual(['finance']); // by the path «Работа»
    await field(page).fill('');
    await page.keyboard.type('zzz');
    await expect(dlg(page).locator('.row.empty')).toHaveText('Ничего не найдено');
  });

  test('⌫ on an empty field goes back to the commands; Esc cancels everything', async ({ page }) => {
    await open(page);
    await refile(page);
    await page.keyboard.press('Backspace');
    await expect(dlg(page)).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Командная палитра' })).toBeVisible();
    await page.keyboard.type('перен');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(dlg(page)).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Командная палитра' })).toHaveCount(0);
    expect(await disk(page, W)).toBe(WORK);
  });

  test('⌘↩ moves to the 1st level of the file at once', async ({ page }) => {
    await open(page);
    await refile(page);
    await page.keyboard.type('jour');
    await page.keyboard.press('Meta+Enter');
    await expect(dlg(page)).toHaveCount(0);
    await expect.poll(() => disk(page, '/mock/journal.org')).toBe('* Октябрь\n* TODO [#A] Подготовить бюджет 2027 :budget:\nDEADLINE: <2026-10-24 Sat>\nСвести заявки.\n** DONE Собрать заявки\n');
    expect(await disk(page, W)).toBe('#+TITLE: Работа\n\n* Q4 2026\n** NEXT План найма\n');
  });
});

test.describe('step 2: the place in the file', () => {
  test('the pinned row is chosen; the tree: guides, arrows, level marks, statuses, tags, counts of closed branches', async ({ page }) => {
    await open(page);
    await refile(page);
    await toFile(page, 'fin');
    await expect(dlg(page).locator('.tok')).toHaveText('finance');
    await expect(field(page)).toHaveAttribute('placeholder', 'Заголовок в finance…');
    await expect(on(page).locator('.t')).toHaveText('Перенести на 1-й уровень');
    await expect(on(page).locator('.hint')).toHaveText('в конец finance');
    await expect(on(page).locator('.key')).toHaveText('⌘↩');
    expect(await groups(page)).toEqual(['ЗАГОЛОВКИ · finance']);
    expect(await nodeTitles(page)).toEqual(['Бюджеты', 'Бюджет 2026', 'Бюджет 2025', 'Шаблоны и правила', 'Отчётность', 'Квартальные отчёты', 'Аудит 2026', 'Закупки', 'Отчёты поставщиков']);
    await expect(node(page, 'Бюджет 2026').locator('.guide')).toHaveCount(1);
    await expect(node(page, 'Бюджет 2026').locator('.cnt')).toHaveText('2');
    await expect(node(page, 'Бюджеты').locator('.cnt')).toHaveCount(0); // open
    await expect(node(page, 'Бюджеты').locator('.chev')).toHaveClass(/open/);
    await expect(node(page, 'Шаблоны и правила').locator('.chev')).toHaveClass(/none/);
    await expect(node(page, 'Бюджет 2025').locator('.kw')).toHaveText('DONE');
    await expect(node(page, 'Бюджет 2025').locator('.tags')).toHaveText(':archive:');
    await expect(node(page, 'Бюджеты').locator('.nt')).toHaveCSS('font-weight', '600');
    await expect(node(page, 'Бюджет 2026').locator('.nt')).toHaveCSS('font-weight', '400');
    const h1 = await node(page, 'Бюджеты').locator('.lv').evaluate((e) => getComputedStyle(e).backgroundColor);
    const h2 = await node(page, 'Бюджет 2026').locator('.lv').evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(h1).not.toBe(h2);
    await page.keyboard.press('ArrowDown');
    await expect(on(page).locator('.nt')).toHaveText('Бюджеты');
    await expect(on(page).locator('.will')).toHaveText('станет 2-м уровнем');
    await page.keyboard.press('ArrowDown');
    await expect(on(page).locator('.will')).toHaveText('станет 3-м уровнем');
    await expect(dlg(page).locator('.foot')).toHaveText(/↑ ↓выбрать.*← →свернуть \/ развернуть.*↩перенести сюда.*⌘↩на 1-й уровень.*⌫к файлам.*⎋закрыть/);
  });

  test('two ↩ move to the 1st level at the end of the file; the toast opens it or takes it back', async ({ page }) => {
    await open(page);
    await refile(page);
    await toFile(page, 'fin');
    await page.keyboard.press('Enter');
    await expect(dlg(page)).toHaveCount(0);
    await expect.poll(() => disk(page, F)).toBe(FINANCE + '* TODO [#A] Подготовить бюджет 2027 :budget:\nDEADLINE: <2026-10-24 Sat>\nСвести заявки.\n** DONE Собрать заявки\n');
    await expect(page.locator('.toast')).toContainText('Перенесено в finance');
    await page.locator('.toast').getByRole('button', { name: 'Отменить' }).click();
    await expect.poll(() => disk(page, F)).toBe(FINANCE);
    await expect.poll(() => disk(page, W)).toBe(WORK);
  });

  test('→ opens a branch or goes into it, ← closes it or goes to the parent; ↩ puts it as the last child, levels follow', async ({ page }) => {
    await open(page);
    await refile(page);
    await toFile(page, 'fin');
    await page.keyboard.press('ArrowDown'); // Бюджеты
    await page.keyboard.press('ArrowRight'); // open: into the first child
    await expect(on(page).locator('.nt')).toHaveText('Бюджет 2026');
    await page.keyboard.press('ArrowRight'); // closed: opens
    await expect(node(page, 'Заявки')).toBeVisible();
    await expect(node(page, 'Бюджет 2026').locator('.cnt')).toHaveCount(0);
    await page.keyboard.press('ArrowLeft'); // open: closes
    await expect(node(page, 'Заявки')).toHaveCount(0);
    await page.keyboard.press('ArrowLeft'); // closed: the parent
    await expect(on(page).locator('.nt')).toHaveText('Бюджеты');
    await page.keyboard.press('ArrowLeft');
    await expect(node(page, 'Бюджет 2026')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter'); // under «Бюджет 2026»
    await expect.poll(() => disk(page, F)).toContain('** Бюджет 2026\n*** Заявки\n*** Расходы\n*** TODO [#A] Подготовить бюджет 2027 :budget:\nDEADLINE: <2026-10-24 Sat>\nСвести заявки.\n**** DONE Собрать заявки\n** DONE Бюджет 2025 :archive:');
    await expect.poll(() => disk(page, W)).toBe('#+TITLE: Работа\n\n* Q4 2026\n** NEXT План найма\n');
    await expect(page.locator('.toast')).toContainText('Перенесено в finance › Бюджет 2026');
    // the caret: the heading that came after the moved one
    await expect(page.locator('section.pane.active .cm-activeLine')).toContainText('План найма');
    // «Открыть»: the target at the moved heading
    await page.locator('.toast').getByRole('button', { name: 'Открыть' }).click();
    await expect(page.locator('section.pane.active .cm-activeLine')).toContainText('Подготовить бюджет 2027');
  });

  test('under a heading with blank lines after its subtree: before them', async ({ page }) => {
    await open(page);
    await refile(page, 'План найма');
    await toFile(page, 'fin');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect.poll(() => disk(page, F)).toContain('** Шаблоны и правила\n** NEXT План найма\n\n* Отчётность');
  });

  test('a search: matches with ancestors (dimmed), the count, the first match chosen, the pinned row stays; ⌫ goes back step by step', async ({ page }) => {
    await open(page);
    await refile(page);
    await toFile(page, 'fin');
    await page.keyboard.type('отч');
    expect(await groups(page)).toEqual(['ЗАГОЛОВКИ · finance — 5 совпадений']);
    expect(await nodeTitles(page)).toEqual(['Отчётность', 'Квартальные отчёты', 'Отчёт за Q3', 'Отчёт за Q4', 'Закупки', 'Отчёты поставщиков']);
    await expect(node(page, 'Закупки')).toHaveClass(/dim/);
    await expect(on(page).locator('.nt')).toHaveText('Отчётность');
    await expect(on(page).locator('.nt b')).toHaveText('Отч');
    await expect(dlg(page).locator('.row', { hasText: 'Перенести на 1-й уровень' })).toBeVisible();
    await page.keyboard.press('ArrowRight'); // nothing in a search
    await expect(on(page).locator('.nt')).toHaveText('Отчётность');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
    await expect(field(page)).toHaveValue('');
    await page.keyboard.press('Backspace');
    await expect(dlg(page).locator('.tok')).toHaveText('Перенести в');
    await expect(on(page).locator('.t')).toHaveText('finance'); // the same file
  });

  test('the chosen heading is gone on disk: said, the tree renewed, the dialog stays', async ({ page }) => {
    await open(page);
    await refile(page);
    await toFile(page, 'fin');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown'); // Бюджет 2026
    await page.evaluate((p) => ((window as any).__disk[p] = (window as any).__disk[p].replace('** Бюджет 2026', '** Бюджет на 2026')), F);
    await page.keyboard.press('Enter');
    await expect(dlg(page).locator('.err')).toHaveText('Заголовок изменился, выберите место ещё раз');
    await expect(node(page, 'Бюджет на 2026')).toBeVisible();
    expect(await disk(page, W)).toBe(WORK);
  });

  test('a click on the arrow only opens or closes; a click on a row moves there', async ({ page }) => {
    await open(page);
    await refile(page);
    await toFile(page, 'fin');
    await node(page, 'Квартальные отчёты').locator('.chev').click();
    await expect(node(page, 'Отчёт за Q3')).toBeVisible();
    await expect(dlg(page)).toBeVisible();
    await node(page, 'Отчёт за Q3').hover();
    await expect(on(page).locator('.nt')).toHaveText('Отчёт за Q3');
    await node(page, 'Отчёт за Q3').click();
    await expect.poll(() => disk(page, F)).toContain('*** TODO Отчёт за Q3 :report:\n**** TODO [#A] Подготовить бюджет 2027');
  });

  test('the way to the last place moved to in the file is open', async ({ page }) => {
    await open(page, FILES(), () => localStorage.setItem('refile:recent:/mock', JSON.stringify([{ path: '/mock/Работа/Финансы/finance.org', key: ['Отчётность', 'Квартальные отчёты', 'Отчёт за Q3'].join('\u0001') }])));
    await refile(page);
    expect((await fileTitles(page))[0]).toBe('finance');
    await page.keyboard.press('Enter');
    await expect(node(page, 'Отчёт за Q3')).toBeVisible();
    await expect(node(page, 'Заявки')).toHaveCount(0);
  });

  test('what was opened in a file stays for the session', async ({ page }) => {
    await open(page);
    await refile(page);
    await toFile(page, 'fin');
    await node(page, 'Квартальные отчёты').locator('.chev').click();
    await page.keyboard.press('Escape');
    await refile(page);
    await toFile(page, 'fin');
    await expect(node(page, 'Отчёт за Q3')).toBeVisible(); // remembered
  });

  test('within the same file: the heading and what is inside it cannot be chosen', async ({ page }) => {
    await open(page);
    await refile(page);
    await toFile(page, 'work');
    expect(await nodeTitles(page)).toEqual(['Q4 2026', 'Подготовить бюджет 2027', 'План найма']);
    await expect(node(page, 'Подготовить бюджет 2027')).toHaveClass(/blocked/);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(on(page).locator('.nt')).toHaveText('План найма'); // skipped
    await page.keyboard.press('Enter');
    await expect.poll(() => disk(page, W)).toBe('#+TITLE: Работа\n\n* Q4 2026\n** NEXT План найма\n*** TODO [#A] Подготовить бюджет 2027 :budget:\nDEADLINE: <2026-10-24 Sat>\nСвести заявки.\n**** DONE Собрать заявки\n');
  });
});

test.describe('nothing is lost', () => {
  test('the target cannot be written: the source stays, the reason is said', async ({ page }) => {
    await open(page);
    await page.evaluate((p) => ((window as any).__failWrites = [p]), F);
    await refile(page);
    await toFile(page, 'fin');
    await page.keyboard.press('Enter');
    await expect(page.locator('section.pane.active')).toContainText('Не удалось записать «finance»: нет прав на запись'); // the status bar
    expect(await disk(page, F)).toBe(FINANCE);
    expect(await disk(page, W)).toBe(WORK);
    await expect(page.locator('section.pane .cm-line', { hasText: 'Подготовить бюджет' })).toBeVisible();
  });

  test('the target open with unsaved edits: they are saved first, the editor takes the move without a conflict', async ({ page }) => {
    await open(page);
    await expandTree(page); // folded by default (ТЗ 02)
    await page.locator('.nav .row[data-key="' + F + '"]').click();
    await page.locator('section.pane .cm-line', { hasText: 'Аудит 2026' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' срочно');
    await page.locator('.nav .row[data-key="/mock/work.org"]').click();
    await refile(page);
    await toFile(page, 'fin');
    await page.keyboard.press('Enter');
    await expect.poll(() => disk(page, F)).toContain('** Аудит 2026 срочно\n');
    // the edits are saved first, the move is written after: wait for it
    await expect.poll(() => disk(page, F)).toContain('* TODO [#A] Подготовить бюджет 2027');
    await expect(page.getByRole('dialog', { name: /изменился|Файл/ })).toHaveCount(0);
    expect((await log(page)).filter((e) => e[0] === 'conflict')).toEqual([]);
  });
});

test.describe('from the Inbox', () => {
  const inboxRows = (page: Page) => page.locator('.inbox .row');
  async function openInbox(page: Page) {
    await open(page);
    await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Inbox' }).click();
    await expect(inboxRows(page)).toHaveCount(2);
  }

  test('the same two steps: «Переносится задача · из inbox», no Inbox file, ⌫ does nothing; under a heading; the target first; gone from the list', async ({ page }) => {
    await openInbox(page);
    await inboxRows(page).first().getByRole('button', { name: 'Перенести' }).click({ force: true });
    await expect(dlg(page)).toHaveAttribute('aria-label', 'Перенести задачу');
    await expect(dlg(page).locator('.plate .cap')).toHaveText('Переносится задача');
    await expect(dlg(page).locator('.plate .right')).toHaveText('из inbox');
    expect(await fileTitles(page)).not.toContain('inbox');
    await expect(dlg(page).locator('.foot')).not.toContainText('к командам');
    await page.keyboard.press('Backspace');
    await expect(dlg(page)).toBeVisible();
    await toFile(page, 'fin');
    await page.keyboard.type('квар');
    await page.keyboard.press('Enter');
    await expect(dlg(page)).toHaveCount(0);
    await expect.poll(() => disk(page, F)).toContain('*** NEXT Отчёт за Q4 :report:\n*** TODO Позвонить в банк про лимиты\n:PROPERTIES:\n:CREATED: [2026-10-11 Sun 09:12]\n:END:\nпо карте компании\n** Аудит 2026');
    await expect.poll(() => disk(page, IB)).toBe('#+TITLE: Inbox\n* TODO Согласовать отпуск\n');
    const saves = (await log(page)).filter((e) => e[0] === 'save').map((e) => e[1]);
    expect(saves.indexOf(F)).toBeLessThan(saves.lastIndexOf(IB));
    await expect(inboxRows(page)).toHaveCount(1);
    await expect(page.locator('.toast')).toContainText('Перенесено в finance › Квартальные отчёты');
    await page.locator('.toast').getByRole('button', { name: 'Отменить' }).click();
    await expect.poll(() => disk(page, IB)).toBe(INBOX);
    await expect.poll(() => disk(page, F)).toBe(FINANCE);
  });
});
