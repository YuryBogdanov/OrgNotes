// «Презентация», the PDF (ТЗ 59 §7): the sheet «Экспорт в PDF» — «С заметками докладчика» off: a page a slide, the
// slide's own size; on: A4 upright, the slide on top and its notes under it. The pages drawn here (laid out out of sight
// so the text is fitted and the images loaded), in the theme of «Тема слайдов»; the core makes the vector PDF
// (`ui.exportPdf`) where the save panel says.

import { present } from './state.svelte';
import { FIELD, fit, slideEl, type Look } from './render';

const PT = 0.75; // a CSS px in pt
const A4 = { w: 595, h: 842 };

/** The sheet, then the export; the path written, or null. */
export async function exportDeck(path: string): Promise<string | null> {
  const ctx = present.ctx;
  let notes = false;
  const r = await ctx.ui.sheet({
    title: 'Экспорт в PDF',
    render: (el) => {
      const label = document.createElement('label');
      label.className = 'pr-pdf-opt';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.onchange = () => (notes = box.checked);
      const words = document.createElement('span');
      words.textContent = 'С заметками докладчика';
      const hint = document.createElement('div');
      hint.className = 'pr-pdf-hint';
      const say = () => (hint.textContent = notes ? 'Слайд сверху, заметки под ним — страница A4.' : 'Страница на слайд.');
      box.addEventListener('change', say);
      say();
      label.append(box, words);
      el.append(label, hint);
    },
    buttons: [{ id: 'cancel', label: 'Отмена' }, { id: 'ok', label: 'Экспортировать…', primary: true }],
  });
  if (r !== 'ok') return null;
  const f = present.files.get(path) ?? (await present.read(path));
  if (!f || !f.deck.slides.length) return null;
  const deck = f.deck;
  const field = FIELD[deck.ratio];
  const vars = ctx.ui.themeVars(present.theme === 'app' ? undefined : present.theme);
  const look: Look = { file: path, image: (p) => present.image(p) };
  // out of sight, laid out: the text fitted, the images loaded
  const stage = document.createElement('div');
  stage.setAttribute('style', `position:fixed;left:-100000px;top:0;${vars}`);
  stage.dataset.ui = 'next';
  document.body.append(stage);
  const pages: HTMLElement[] = [];
  try {
    const pageW = notes ? A4.w / PT : field.w;
    const pageH = notes ? A4.h / PT : field.h;
    for (const s of deck.slides) {
      const page = document.createElement('div');
      page.className = 'pr-pdf-page' + (notes ? ' notes' : '');
      page.setAttribute('style', `${vars};width:${pageW}px;height:${pageH}px;position:relative;overflow:hidden;background:${notes ? '#fff' : 'var(--card)'}`);
      const el = slideEl(s, deck, look);
      if (notes) {
        const pad = 48;
        const k = (pageW - pad * 2) / field.w;
        const hold = document.createElement('div');
        hold.className = 'pr-pdf-slide';
        hold.setAttribute('style', `position:relative;margin:${pad}px ${pad}px 0;width:${field.w * k}px;height:${field.h * k}px;overflow:hidden;border:1px solid #ccc`);
        Object.assign(el.style, { transform: `scale(${k})`, transformOrigin: '0 0', position: 'absolute', left: '0', top: '0' });
        hold.append(el);
        const text = document.createElement('div');
        text.className = 'pr-pdf-notes';
        text.textContent = s.notes?.text || '';
        text.setAttribute('style', `margin:24px ${pad}px 0;font:14px/1.5 -apple-system,system-ui,sans-serif;color:#222;white-space:pre-wrap`);
        page.append(hold, text);
      } else page.append(el);
      stage.append(page);
      pages.push(page);
    }
    for (const p of pages) fit(p.querySelector<HTMLElement>('.pr-slide')!);
    await imagesLoaded(stage);
    const title = deck.title || (path.split('/').pop() ?? 'Презентация').replace(/\.org$/i, '');
    return await ctx.ui.exportPdf({ name: title, pages, size: notes ? A4 : { w: field.w * PT, h: field.h * PT } });
  } finally {
    stage.remove();
  }
}

/** Every image of the pages found or missing (5 s at most), its picture decoded. */
async function imagesLoaded(root: HTMLElement) {
  const t0 = Date.now();
  const pending = () => [...root.querySelectorAll<HTMLElement>('.pr-img[data-path]')].filter((b) => !b.querySelector('img') && !b.classList.contains('missing'));
  while (pending().length && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 50));
  await Promise.all([...root.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
}
