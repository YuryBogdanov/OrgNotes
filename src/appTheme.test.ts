import { describe, expect, it } from 'vitest';
import { BLUEPRINT, PAPER, contrastOf, deriveTokens, editorColors, isDarkTheme, mix, over, rgbOf, type AppTheme } from './appTheme';
import { NAMED } from './themes';

// ТЗ 57 §1–2: a theme of a few colours; the tokens and the editor's colours derived from it.

const theme = (bg: string, ink: string, accent: string, more: Partial<AppTheme['details']> = {}): AppTheme => ({
  ...PAPER, name: 'x', source: 'own', base: { bg, ink, accent }, details: { grid: 'quiet', headings: 'ink', ...more },
});

describe('the app theme', () => {
  it('is dark by its ground', () => {
    expect(isDarkTheme(PAPER)).toBe(false);
    expect(isDarkTheme(BLUEPRINT)).toBe(true);
    expect(isDarkTheme(theme('#282a36', '#f8f8f2', '#bd93f9'))).toBe(true); // Dracula
    expect(isDarkTheme(theme('#fdf6e3', '#586e75', '#268bd2'))).toBe(false); // Solarized light
  });

  // the editor colours of «Синька — светлая / тёмная» before ТЗ 57 (written out)
  const WAS = {
    light: { bg: '#f8f6f0', fg: '#15243a', dim: '#69727d', curLine: '#e3aa3c2b', selection: '#e3aa3c5c', cursor: '#e3aa3c', h1: '#15243a', h2: '#15243a', h3: '#15243a', h4: '#15243a', date: '#1f5fbf', tag: '#69727d', link: '#8a5f0e', meta: '#69727d', code: '#495464' },
    dark: { bg: '#101c2c', fg: '#e6edf6', dim: '#778495', curLine: '#f2c66d21', selection: '#f2c66d4d', cursor: '#f2c66d', h1: '#e6edf6', h2: '#e6edf6', h3: '#e6edf6', h4: '#e6edf6', date: '#8ab8ff', tag: '#778495', link: '#f2c66d', meta: '#778495', code: '#9ca7b5' },
  };
  it('«Бумага» and «Синька» give the editor the colours «Синька — светлая / тёмная» had (ТЗ 42)', () => {
    for (const [th, a] of [[PAPER, 'light'], [BLUEPRINT, 'dark']] as const) {
      const was = WAS[a];
      const now = editorColors(th);
      for (const k of ['bg', 'fg', 'dim', 'curLine', 'selection', 'cursor', 'h1', 'h2', 'h3', 'h4', 'date', 'tag', 'link', 'meta'] as const) expect(now[k], k).toBe(was[k]);
      // `code` is one mix for both: ±4 per channel
      const d = rgbOf(now.code).map((v, i) => Math.abs(v - rgbOf(was.code)[i]));
      expect(Math.max(...d)).toBeLessThanOrEqual(4);
    }
  });

  it('lampink reads at 4.5:1 on the ground and on lampsoft, whatever the accent', () => {
    for (const [bg, ink] of [['#f8f6f0', '#15243a'], ['#ffffff', '#1d1d1f'], ['#101c2c', '#e6edf6'], ['#282a36', '#f8f8f2']] as const)
      for (const accent of ['#e3aa3c', '#ffe066', '#0a84ff', '#2f7d4f', '#ff79c6', '#1d3557']) {
        const t = deriveTokens(theme(bg, ink, accent));
        expect(contrastOf(t.lampink, bg), `${accent} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastOf(t.lampink, over(t.lampsoft, bg)), `${accent} on its soft, ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
  });

  it('the statuses are the palette\'s shades; the plugins\' marks its purple', () => {
    const t = deriveTokens(PAPER);
    expect([t.todo, t.next, t.wait, t.done, t.plug]).toEqual([PAPER.palette.red, PAPER.palette.blue, PAPER.palette.yellow, PAPER.palette.green, PAPER.palette.purple]);
    expect(Object.keys(editorColors(PAPER).palette)).toEqual([...NAMED]);
  });

  it('the details: an own sidebar, the grid, the headings by levels', () => {
    expect(deriveTokens(theme('#f8f6f0', '#15243a', '#e3aa3c', { side: '#e0d8c8' })).side).toBe('#e0d8c8');
    expect(deriveTokens(theme('#f8f6f0', '#15243a', '#e3aa3c', { grid: 'none' })).grid).toMatch(/,0\)$/);
    const lv: [string, string, string, string] = ['#aa0000', '#00aa00', '#0000aa', '#555555'];
    const c = editorColors(theme('#f8f6f0', '#15243a', '#e3aa3c', { headings: 'levels', levels: lv }));
    expect([c.h1, c.h2, c.h3, c.h4]).toEqual(lv);
  });

  // the capsules' colours: 3.5:1 (the concept's `wait` of «Бумага», its yellow, is 4.0:1)
  it('the built-in palettes read on their ground', () => {
    for (const th of [PAPER, BLUEPRINT]) for (const n of NAMED) expect(contrastOf(th.palette[n], th.base.bg), `${th.name} ${n}`).toBeGreaterThanOrEqual(3.5);
  });

  it('mixes', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(over('rgba(0,0,0,0.5)', '#ffffff')).toBe('#808080');
  });
});
