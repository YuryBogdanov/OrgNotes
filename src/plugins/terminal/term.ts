// A terminal of the plugin (ТЗ 55 §3): xterm with the theme's tokens (the ground `bg`, the text `ink2`, the bold
// `ink`, the cursor `lamp` as a block, the selection `lampsoft`; the ANSI colours from the statuses' tokens, the bright
// ones 15 % lighter), IBM Plex Mono 12.5 on lines of 20, the links (⌘-click: a URL in the browser, a file of the
// folder at its line), the search over the output, and the keys: every ⌃ and ⌥ press to the process, ⌘ to the app
// but copy, paste, select all, find and the size.

import { Terminal, type ITheme, type IDisposable } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';

/** The ⌘ presses the terminal keeps (the app's keys leave them, `data-own-keys`). */
export const OWN_KEYS = '⌘C ⌘V ⌘A ⌘F ⌘G ⇧⌘G ⌘= ⇧⌘= ⌘- ⌘0';

// ---- the colours ----
let probe: CanvasRenderingContext2D | null = null;
/** A CSS colour (a token's hex or rgba) as [r, g, b, a]. */
function rgba(css: string): [number, number, number, number] {
  probe ??= document.createElement('canvas').getContext('2d');
  if (!probe) return [0, 0, 0, 1];
  probe.fillStyle = '#000';
  probe.fillStyle = css;
  const v = String(probe.fillStyle);
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 1];
  const n = v.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  return [n[0], n[1], n[2], n[3] ?? 1];
}
const hex = (c: [number, number, number, number]) => '#' + c.slice(0, 3).map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
/** A colour laid on the ground (the tokens with alpha): solid, as xterm draws. */
const over = (css: string, ground: string) => {
  const [r, g, b, a] = rgba(css);
  const [R, G, B] = rgba(ground);
  return hex([r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1]);
};
const lighter = (h: string, k = 0.15) => {
  const [r, g, b] = rgba(h);
  return hex([r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k, 1]);
};
/** The theme from the tokens where the terminal is drawn. */
export function themeOf(el: Element): ITheme {
  const cs = getComputedStyle(el);
  const t = (n: string, fb: string) => cs.getPropertyValue('--' + n).trim() || fb;
  const bg = over(t('bg', '#f8f6f0'), '#ffffff');
  const c = (n: string, fb: string) => over(t(n, fb), bg);
  // the ANSI colours from the theme's palette (ТЗ 57 §7: `--p-*` of the plugins' layer), the statuses' tokens if none
  const p = (n: string, tok: string, fb: string) => c('p-' + n, t(tok, fb));
  const ansi = { red: p('red', 'todo', '#c4432f'), green: p('green', 'done', '#2f7d4f'), yellow: p('yellow', 'wait', '#a2700c'), blue: p('blue', 'next', '#1f5fbf'), magenta: p('purple', 'plug', '#7a3fc4'), cyan: p('teal', 'lampink', '#97680f'), white: c('ink', '#15243a'), black: c('ink3', '#888888') };
  return {
    background: bg,
    foreground: c('ink2', '#444444'),
    cursor: c('lamp', '#e3aa3c'),
    cursorAccent: bg,
    selectionBackground: t('lampsoft', 'rgba(227,170,60,.17)'),
    selectionInactiveBackground: t('lampsoft', 'rgba(227,170,60,.17)'),
    ...ansi,
    brightRed: lighter(ansi.red), brightGreen: lighter(ansi.green), brightYellow: lighter(ansi.yellow), brightBlue: lighter(ansi.blue),
    brightMagenta: lighter(ansi.magenta), brightCyan: lighter(ansi.cyan), brightWhite: lighter(ansi.white), brightBlack: lighter(ansi.black),
  };
}

export interface TermOpts {
  fontSize: number;
  scrollback: number;
  optionIsMeta: boolean;
  /** A key of the plugin pressed in the terminal (⌃` and ⌃⇧`). */
  onKey(k: 'toggle' | 'new'): void;
  onFind(): void;
  copy(text: string): void;
  openUrl(url: string): void;
  openFile(path: string, line: number): void;
}

/** A file in the output: «Midterm.org», «1on1/boris.org:12», an absolute path or «~/…». */
export const FILE_RE = /(?:~\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.org(?::(\d+))?(?![\w/])/g;

export function makeTerm(o: TermOpts) {
  const term = new Terminal({
    fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
    fontSize: o.fontSize,
    lineHeight: 20 / 12.5,
    cursorStyle: 'block',
    cursorBlink: false,
    scrollback: o.scrollback,
    macOptionIsMeta: o.optionIsMeta,
    macOptionClickForcesSelection: true,
    allowProposedApi: true,
    drawBoldTextInBrightColors: false,
  });
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(new WebLinksAddon((e, uri) => e.metaKey && o.openUrl(uri)));
  const own: IDisposable[] = [];
  // the files of the folder, ⌘-click at their line; underlined while ⌘ is held over one
  own.push(
    term.registerLinkProvider({
      provideLinks(y, cb) {
        const line = term.buffer.active.getLine(y - 1)?.translateToString(true) ?? '';
        const links = [...line.matchAll(FILE_RE)].map((m) => {
          const start = m.index! + 1;
          const decorations = { underline: false, pointerCursor: false };
          return {
            range: { start: { x: start, y }, end: { x: start + m[0].length - 1, y } },
            text: m[0],
            decorations,
            activate: (e: MouseEvent) => e.metaKey && o.openFile(m[0].replace(/:\d+$/, ''), Number(m[1] ?? 1)),
            hover: (e: MouseEvent) => {
              decorations.underline = e.metaKey;
              decorations.pointerCursor = e.metaKey;
            },
          };
        });
        cb(links.length ? links : undefined);
      },
    }),
  );
  let size = o.fontSize;
  const setSize = (n: number) => {
    size = Math.max(9, Math.min(24, n));
    term.options.fontSize = size;
    try {
      fit.fit();
    } catch {
      /* not shown */
    }
  };
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'Backquote') {
      o.onKey(e.shiftKey ? 'new' : 'toggle');
      return false;
    }
    if (!e.metaKey) return true; // ⌃ and ⌥ to the process
    const k = e.code;
    if (k === 'KeyC' && !e.shiftKey) {
      if (term.hasSelection()) o.copy(term.getSelection());
      return false;
    }
    if (k === 'KeyV') return false; // the paste event brings it
    if (k === 'KeyA') return (term.selectAll(), false);
    if (k === 'KeyF') return (o.onFind(), false);
    if (k === 'Equal') return (setSize(size + 1), false);
    if (k === 'Minus') return (setSize(size - 1), false);
    if (k === 'Digit0') return (setSize(o.fontSize), false);
    return false; // the app's (its keys saw it first)
  });
  return {
    term,
    fit,
    search,
    setSize,
    dispose() {
      for (const d of own) d.dispose();
      term.dispose();
    },
  };
}
