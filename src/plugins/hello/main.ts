// «Привет» (ТЗ 26 §9): an example plugin, built only on the public API — a command, a section of the navigator, a
// tab and a setting. Off by default; a template for the authors of plugins.
import { definePlugin, type Ctx, type HeadingInfo } from '@panopticon/api';
import { insertHeading, parseHeadings, stampText, weekdayNames, workflow } from '@panopticon/api/org';
import './styles.css';

interface Board {
  clicks: number;
}

/** The open tasks: the agenda's engine. */
const openTasks = (ctx: Ctx) => ctx.index!.query({ conds: [{ field: 'done', op: 'no' }] });

function greeting(ctx: Ctx) {
  const v = ctx.settings.values();
  return String(v.greeting || 'Привет');
}

const pad = (n: number) => String(n).padStart(2, '0');
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** <2026-10-12 Mon> */
const stamp = (d: Date) => `<${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${WD[d.getDay()]}>`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

export default definePlugin({
  activate(ctx) {
    ctx.commands.on('hello.greet', async () => {
      const n = ctx.settings.values().count ? ` Открытых задач: ${(await openTasks(ctx)).length}.` : '';
      ctx.ui.notify(`${greeting(ctx)}!${n}`, [{ label: 'Доска', run: () => void ctx.ui.open<Board>('hello.board', { clicks: 0 }) }]);
    });
    ctx.commands.on('hello.board', () => ctx.ui.open<Board>('hello.board', { clicks: 0 }));

    // a form, the choice of a place, the choice of a date — the core's sheets; then one transaction
    ctx.commands.on('hello.newTask', async () => {
      const v = await ctx.ui.form({
        title: 'Новая задача',
        submit: 'Дальше',
        groups: [{ fields: [
          { type: 'text', key: 'title', label: 'Задача', placeholder: 'Что сделать' },
          { type: 'choice', key: 'kw', label: 'Статус', look: 'segments', options: [{ value: 'TODO', label: 'TODO' }, { value: 'NEXT', label: 'NEXT' }] },
          { type: 'switch', key: 'date', label: 'Запланировать на день' },
        ] }],
        initial: { kw: 'TODO' },
        validate: (x) => (String(x.title ?? '').trim() ? null : 'Напишите, что сделать'),
      });
      if (!v) return;
      const at = await ctx.ui.pickPlace({ title: 'Куда добавить' });
      if (!at) return;
      const day = v.date ? await ctx.ui.pickDate({ title: 'День задачи' }) : null;
      if (v.date && !day) return;
      const org = `* ${v.kw} ${String(v.title).trim()}` + (day ? `\nSCHEDULED: ${stamp(day)}` : '');
      const r = await ctx.edit!.transaction('Привет: новая задача', (tx) =>
        tx.insertHeading('title' in at ? { under: at, position: 'last' } : { file: at.path, position: 'end' }, org));
      ctx.ui.notify(r === 'ok' ? `Добавлено: ${String(v.title).trim()}` : 'Не получилось: ' + r);
    });

    // the core's review by cards: the open tasks, «Выполнено» (⌘1) and «Запланировать…» (⌘2)
    ctx.commands.on('hello.review', async () => {
      const tasks = await openTasks(ctx);
      const res = await ctx.ui.review({
        title: 'Разбор «Привет»',
        items: tasks.map((t) => t.ref),
        header: (h) => (h.scheduled ? `запланирована на ${h.scheduled.d}.${pad(h.scheduled.m)}` : 'без даты'),
        actions: [
          { id: 'done', label: 'Выполнено', command: 'hello.reviewDone', run: async (h) => ((await ctx.edit!.transaction('Привет: выполнено', (tx) => tx.setStatus(h.ref, 'DONE'))) === 'ok' ? 'next' : 'stay') },
          { id: 'later', label: 'Запланировать…', command: 'hello.reviewLater', run: async (h) => {
            const d = await ctx.ui.pickDate({ title: h.title });
            if (!d) return 'stay';
            return (await ctx.edit!.transaction('Привет: запланировано', (tx) => tx.setPlanning(h.ref, 'SCHEDULED', d))) === 'ok' ? 'next' : 'stay';
          } },
        ],
        below: (root, ref) => void root.append(el('p', { className: 'hello-below' }, `Строка ${ref.line + 1} в ${ref.path}`)),
      });
      ctx.ui.notify(`Разбор «Привет»: ${res.done} из ${res.total}${res.finished ? '' : ', не закончен'}`);
    });

    // ТЗ 27 (roadmap 2.1 A): the core's extension points for plugins with their own structure in a file
    // a set of statuses from code
    ctx.statusSets.set([{ name: 'Идеи', states: [{ name: 'IDEA', done: false }, { name: 'DOING', done: false }, { name: 'SHIPPED', done: true }] }]);
    // «Разобрать задачи» only while there are open ones
    const avail = async () => ctx.commands.setAvailable('hello.review', (await openTasks(ctx)).length > 0);
    void avail();
    ctx.events.on('file.changed', () => void avail());

    // a form with lines, a day, a place and a field of its own; the file's text changed by the plugin's function
    ctx.commands.on('hello.note', async () => {
      const v = await ctx.ui.form({
        title: 'Заметка',
        submit: 'Добавить',
        initial: { mood: 'ok' },
        headerExtra: (el, form) => {
          const chip = el.appendChild(Object.assign(document.createElement('span'), { className: 'hello-chip' }));
          const show = (x: Record<string, unknown>) => (chip.textContent = `${String(x.text ?? '').split('\n').filter((l) => l.trim()).length} стр.`);
          show(form.values());
          return form.onChange(show);
        },
        groups: [{ fields: [
          { type: 'place', key: 'at', label: 'Куда', levels: [1], fileCap: 'ФАЙЛ', headCap: 'ЗАГОЛОВОК',
            note: (path) => ({ text: path.endsWith('Work.org') ? 'рабочий' : '', dim: !path.endsWith('Work.org') }),
            create: () => '+ Создать «Заметки» в конце файла' },
          { type: 'text', key: 'title', label: 'Заголовок', placeholder: 'О чём' },
          { type: 'textarea', key: 'text', label: 'Текст', placeholder: '- пункт' },
          { type: 'date', key: 'day', label: 'День', look: 'chip', clear: 'Без даты' },
          { type: 'custom', key: 'mood', label: 'Настроение', render: (el, f) => {
            const draw = () => el.replaceChildren(...['ok', 'wow'].map((m) =>
              Object.assign(document.createElement('button'), { type: 'button', className: 'hello-mood' + (f.value() === m ? ' on' : ''), textContent: m === 'ok' ? '🙂 норм' : '🤩 вау', onclick: () => f.set(m) })));
            draw();
            return f.onChange(draw);
          } },
        ] }],
        // a file chosen: the title from its name, unless typed
        onChange: (k, x) => (k === 'at' && !x.title && x.at ? { title: 'Заметка о ' + String((x.at as { path: string }).path).replace(/\.org$/, '') } : undefined),
        validate: (x) => (!x.at || (!(x.at as { heading: string | null; create?: boolean }).heading && !(x.at as { create?: boolean }).create) ? 'Выберите файл и заголовок' : null),
      });
      if (!v) return;
      const at = v.at as { path: string; heading: string | null; create?: boolean };
      const wf = workflow(await ctx.index!.workflow(at.path));
      const d = typeof v.day === 'string' ? new Date(+v.day.slice(0, 4), +v.day.slice(5, 7) - 1, +v.day.slice(8, 10)) : null;
      const day = d ? `\nSCHEDULED: ${stampText(d, weekdayNames(await ctx.files!.read(at.path).catch(() => '')))}` : '';
      const body = String(v.text ?? '').trim();
      const org = `* ${String(v.title).trim() || 'Заметка'} :${v.mood}:${day}${body ? '\n' + body : ''}`;
      const r = await ctx.edit!.transaction('Привет: заметка', (tx) => tx.update(at.path, (text) => {
        if (at.create) return insertHeading(text, { position: 'end' }, '* Заметки\n*' + org); // the heading made, the note under it
        const h = parseHeadings(text, wf).find((x) => x.level === 1 && x.title === at.heading);
        return h ? insertHeading(text, { under: h, position: 'last' }, org) : null;
      }), { onUndo: () => ctx.ui.notify('Привет: заметка отменена') });
      ctx.ui.notify(r === 'ok' ? 'Заметка добавлена' : 'Не получилось: ' + r);
    });

    // a sheet with the plugin's content
    ctx.commands.on('hello.about', async () => {
      const b = await ctx.ui.sheet({
        title: 'О плагине «Привет»',
        note: '↩ — понятно',
        buttons: [{ id: 'later', label: 'Позже' }, { id: 'ok', label: 'Понятно', primary: true }],
        render: (el) => void el.append(Object.assign(document.createElement('p'), { className: 'hello-about', textContent: 'Пример плагина: всё — через API.' })),
      });
      ctx.ui.notify('Лист закрыт: ' + (b ?? 'отмена'));
    });

    // a choice from a list in the palette
    ctx.commands.on('hello.choose', async () => {
      const files = await ctx.index!.files();
      const path = await ctx.ui.choose({ title: 'Какой файл открыть', items: files.map((f) => ({ id: f.path, label: f.title, hint: f.path })) });
      if (path) await ctx.commands.run('file.open', { path });
    });

    // the core's palette of statuses for a heading (its file shown first)
    ctx.commands.on('hello.status', async () => {
      const t = (await openTasks(ctx))[0];
      if (!t) return;
      await ctx.commands.run('heading.reveal', { ref: t.ref });
      await ctx.commands.run('heading.status', { ref: t.ref });
    });

    // the section: the files of the notes folder; a click opens one
    ctx.ui.navSection('hello', (root) => {
      const list = el('ul', { className: 'hello-files' });
      const draw = async () => {
        const files = await ctx.index!.files();
        list.replaceChildren(...files.map((f) => {
          const b = el('button', { type: 'button', onclick: () => void ctx.commands.run('file.open', { path: f.path }) }, f.title);
          b.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            ctx.ui.menu([
              { label: 'Открыть', run: () => void ctx.commands.run('file.open', { path: f.path }) },
              { label: 'Скопировать путь', run: () => {}, disabled: true },
              { label: 'Поздороваться', run: () => ctx.ui.notify(`${greeting(ctx)}, ${f.title}!`) },
            ], { x: e.clientX, y: e.clientY });
          });
          return el('li', {}, b);
        }));
      };
      root.append(el('h3', { className: 'hello-h' }, `${greeting(ctx)}, это раздел плагина`), list);
      void draw();
      const off = ctx.events.on('folder.changed', () => void draw());
      return off;
    });

    // the tab: a counter kept with the layout, and the first open task done by a transaction (⌘Z takes it back)
    ctx.ui.view<Board>('hello.board', {
      title: (s) => (s.clicks ? `Доска · ${s.clicks}` : 'Доска'),
      restore: (raw) => ({ clicks: Number((raw as Board | null)?.clicks) || 0 }),
      render(root, state, tab) {
        let s = { ...state };
        const count = el('p', { className: 'hello-count' });
        const show = () => (count.textContent = `Нажатий: ${s.clicks}`);
        const first = el('p', { className: 'hello-first' });
        const tasks = async () => {
          const t: HeadingInfo | undefined = (await openTasks(ctx))[0];
          first.textContent = t ? `Первая открытая задача: ${t.title}` : 'Открытых задач нет';
          const tone = t?.keyword ? await ctx.index!.statusTone(t.keyword, t.ref.path) : null;
          first.dataset.tone = tone ?? '';
          first.style.color = tone ? `var(--p-${tone})` : '';
          return t;
        };
        const plus = el('button', { type: 'button', onclick: () => {
          s = { clicks: s.clicks + 1 };
          tab.setState(s);
          show();
        } }, 'Нажать');
        const done = el('button', { type: 'button', onclick: async () => {
          const t = await tasks();
          if (!t) return;
          const r = await ctx.edit!.transaction('Привет: задача выполнена', (tx) => tx.setStatus(t.ref, 'DONE'));
          ctx.ui.notify(r === 'ok' ? `«${t.title}» — DONE` : 'Не получилось: ' + r);
        } }, 'Отметить первую выполненной');
        const close = el('button', { type: 'button', onclick: () => ctx.ui.close('hello.board') }, 'Закрыть доску');
        root.append(el('div', { className: 'hello-board' }, el('h2', {}, `${greeting(ctx)}!`), count, plus, first, done, close));
        show();
        void tasks();
        const off = ctx.events.on('file.changed', () => void tasks());
        return off;
      },
    });
  },
});
