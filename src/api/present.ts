// A plugin's show on the whole screen and its PDF (ТЗ 59 §9.2–9.3, API 1.19). The show: a window per screen opened
// with `window.open` (Rust makes it a frameless window over that screen, present.rs) — the page draws into its
// document as into its own: the page's styles copied there, the new interface's variables on its root. The PDF: the
// plugin's pages laid out in the page itself, its print style showing only them; WebKit prints the page into the file
// chosen in the save panel (Pdf.swift).

import { invoke, isTauri, pickSave } from '../tauri';
import type { Ctx, Dispose } from './index';

type Spec = Parameters<Ctx['ui']['present']>[0];
type Handle = Awaited<ReturnType<Ctx['ui']['present']>>;
interface Screen {
  x: number;
  y: number;
  w: number;
  h: number;
  main: boolean;
}

/** The new interface's variables (its tokens, the compatibility layer, the fonts) of the theme shown, or of the one of
 *  the light or the dark place; given by its shell. */
export const presentLook = { vars: (_appearance?: 'light' | 'dark'): string => '' };

let current: { end(): void } | null = null;

/** The document of a show's window made ready: the page's styles, the root with the variables. Again when WebKit
 *  gave it a new blank document (its own load after the window was made) — the root is looked for first. */
function prepare(win: Window): HTMLElement {
  const doc = win.document;
  const had = doc.getElementById('present-root');
  if (had) return had;
  doc.title = 'Показ';
  const base = doc.createElement('base');
  base.href = location.href; // the fonts and images of the styles, as on the page
  doc.head.append(base);
  for (const n of document.querySelectorAll('style, link[rel="stylesheet"]')) doc.head.append(doc.importNode(n, true));
  doc.documentElement.setAttribute('style', 'height:100%;background:#000');
  for (const a of ['data-theme']) {
    const v = document.documentElement.getAttribute(a);
    if (v) doc.documentElement.setAttribute(a, v);
  }
  doc.body.setAttribute('style', 'margin:0;height:100%;overflow:hidden;background:#000');
  const root = doc.createElement('div');
  root.id = 'present-root';
  root.setAttribute('data-ui', 'next');
  root.setAttribute('style', `${presentLook.vars()};position:fixed;inset:0;overflow:hidden`);
  doc.body.append(root);
  return root;
}
/** A blank window of the show on `s` (null: WebKit did not open it). */
function openOn(s: Screen, name: string): { win: Window; root: HTMLElement } | null {
  const win = window.open(`about:blank#present-${name}`, `present-${name}`, `left=${Math.round(s.x)},top=${Math.round(s.y)},width=${Math.round(s.w)},height=${Math.round(s.h)}`);
  if (!win) return null;
  return { win, root: prepare(win) };
}

export async function present(spec: Spec, guard: (fn: () => void) => void): Promise<Handle> {
  current?.end();
  const all: Screen[] = isTauri ? await invoke<Screen[]>('present_screens').catch(() => []) : [];
  const here: Screen = all.find((s) => s.main) ?? all[0] ?? { x: 0, y: 0, w: screen.width, h: screen.height, main: true };
  const there = all.find((s) => s !== here);
  const two = !!there && !!spec.presenter;
  const a = openOn(two ? there! : here, 'audience');
  if (!a) throw new Error('macOS не дал открыть окно');
  const p = two ? openOn(here, 'presenter') : null;
  const wins = [a, ...(p ? [p] : [])];
  let swapped = false;
  let shown: (Dispose | void)[] = [];
  const draw = () => {
    for (const d of shown) if (typeof d === 'function') guard(d);
    shown = [];
    for (const w of wins) w.root.replaceChildren();
    const [aud, pre] = swapped && p ? [p, a] : [a, p];
    guard(() => void shown.push(spec.audience(aud.root)));
    if (pre && spec.presenter) guard(() => void shown.push(spec.presenter!(pre.root)));
  };
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    clearInterval(watch);
    if (current === handle) current = null;
    for (const d of shown) if (typeof d === 'function') guard(d);
    shown = [];
    for (const w of wins) w.win.close();
    void invoke('present_end').catch(() => {});
    if (spec.onEnd) guard(() => spec.onEnd!());
  };
  const keys = (e: KeyboardEvent) => {
    if (spec.onKey) guard(() => spec.onKey!(e));
  };
  const listen = (w: { win: Window }) => w.win.addEventListener('keydown', keys);
  for (const w of wins) listen(w);
  draw();
  // a window closed by itself (⌘W, the system): the show ends; its document replaced by a new blank one (WebKit's own
  // load of the window): made ready and drawn again (fix-59-1 §1)
  const watch = setInterval(() => {
    if (wins.some((w) => w.win.closed)) return end();
    let again = false;
    for (const w of wins)
      if (!w.win.document.getElementById('present-root')) {
        w.root = prepare(w.win);
        listen(w);
        again = true;
      }
    if (again) draw();
  }, 250);
  void invoke('present_begin').catch(() => {});
  a.win.focus();
  const handle: Handle & { end(): void } = {
    screens: two ? 2 : 1,
    swap: () => {
      if (!p || ended) return;
      swapped = !swapped;
      draw();
    },
    end,
  };
  current = handle;
  return handle;
}

/** The plugin's pages as a PDF where the user says: the page's print style shows only them, one a sheet. */
export async function exportPdf(o: { name: string; pages: HTMLElement[]; size: { w: number; h: number } }): Promise<string | null> {
  const name = String(o.name || 'Документ').replace(/[/:\\]/g, '-');
  const path = await pickSave('Экспорт в PDF', name.endsWith('.pdf') ? name : `${name}.pdf`, { name: 'PDF', extensions: ['pdf'] });
  if (!path) return null;
  const { w, h } = { w: Math.max(36, Number(o.size.w) || 0), h: Math.max(36, Number(o.size.h) || 0) };
  const box = document.createElement('div');
  box.className = 'pdf-pages';
  const style = document.createElement('style');
  style.textContent = `
    .pdf-pages { position: fixed; left: -100000px; top: 0; }
    @media print {
      @page { size: ${w}pt ${h}pt; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; background: none !important; }
      body > *:not(.pdf-pages) { display: none !important; }
      .pdf-pages { position: static; left: 0; }
      .pdf-page { width: ${w}pt; height: ${h}pt; overflow: hidden; break-after: page; page-break-after: always; position: relative; }
      .pdf-page:last-child { break-after: auto; page-break-after: auto; }
    }`;
  for (const pg of o.pages) {
    const sheet = document.createElement('div');
    sheet.className = 'pdf-page';
    sheet.append(pg);
    box.append(sheet);
  }
  document.head.append(style);
  document.body.append(box);
  try {
    await invoke('pdf_print', { path, w, h });
    for (let i = 0; i < 1200; i++) {
      const done = await invoke<boolean | null>('pdf_done');
      if (done !== null) return done ? path : null;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  } finally {
    box.remove();
    style.remove();
  }
}
