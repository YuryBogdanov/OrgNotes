// «Привет» (ТЗ 26 §9): an example plugin, built only on the public API — a command, a section of the navigator, a
// tab and a setting. Off by default; a template for the authors of plugins.
import { definePlugin, type Ctx, type HeadingInfo } from '@panopticon/api';
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

    // the section: the files of the notes folder; a click opens one
    ctx.ui.navSection('hello', (root) => {
      const list = el('ul', { className: 'hello-files' });
      const draw = async () => {
        const files = await ctx.index!.files();
        list.replaceChildren(...files.map((f) => {
          const b = el('button', { type: 'button', onclick: () => void ctx.commands.run('file.open', { path: f.path }) }, f.title);
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
        root.append(el('div', { className: 'hello-board' }, el('h2', {}, `${greeting(ctx)}!`), count, plus, first, done));
        show();
        void tasks();
        const off = ctx.events.on('file.changed', () => void tasks());
        return off;
      },
    });
  },
});
