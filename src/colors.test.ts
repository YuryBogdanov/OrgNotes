import { describe, expect, it } from 'vitest';
import { PALETTE, colorName, contrast, isColor, toneOf } from './colors';
import { readFileSync } from 'node:fs';
import { BUILTIN, NAMED, asNamed, levelColor, nearestNamed, parseTheme, themeVars, type Theme } from './themes';

// the Emacs themes are the plugin «theme-pack» (roadmap 1.4): its JSON files, as the host reads them
const PACK = JSON.parse(readFileSync(new URL('./plugins/theme-pack/manifest.json', import.meta.url), 'utf8')) as { contributes: { themes: string[] } };
const PACK_THEMES: Theme[] = PACK.contributes.themes.map((f) => ({ ...parseTheme(readFileSync(new URL('./plugins/theme-pack/' + f, import.meta.url), 'utf8'))!, builtin: true, plugin: 'theme-pack' }));
const ALL = [...BUILTIN, ...PACK_THEMES];

describe('palette', () => {
  it('has the eight named colours of ТЗ 25', () => {
    expect(PALETTE.map((p) => p.name)).toEqual(['Красный', 'Оранжевый', 'Жёлтый', 'Зелёный', 'Голубой', 'Синий', 'Фиолетовый', 'Серый']);
  });
  it('a tone is the theme variable of the colour; old pink and hex are read as the nearest', () => {
    expect(toneOf('green')).toEqual({ light: 'var(--p-green)', dark: 'var(--p-green)' });
    expect(toneOf('pink')!.light).toMatch(/var\(--p-(red|purple)\)/);
    expect(toneOf('#c4262f')!.light).toBe('var(--p-red)');
    expect(toneOf('nope')).toBeUndefined();
    expect(toneOf(undefined)).toBeUndefined();
    expect(isColor('blue') && isColor('#a1b2c3') && !isColor('#fff') && !isColor('chartreuse')).toBe(true);
    expect(colorName('teal')).toBe('Голубой');
  });
  it('nearest: a hex goes to the colour it looks like', () => {
    expect(nearestNamed('#0b5bc0')).toBe('blue');
    expect(nearestNamed('#1e7f3c')).toBe('green');
    expect(nearestNamed('#606068')).toBe('gray');
    expect(asNamed('yellow')).toBe('yellow');
  });
});

describe('built-in themes', () => {
  it('the core has Panopticon only; the pack four for the light appearance with it, five for the dark; every colour set', () => {
    expect(BUILTIN.map((t) => t.name)).toEqual(['Panopticon светлая', 'Panopticon тёмная']);
    expect(ALL.filter((t) => t.appearance === 'light').map((t) => t.name)).toEqual(['Panopticon светлая', 'Leuven', 'Solarized Light', 'Modus Operandi']);
    expect(ALL.filter((t) => t.appearance === 'dark').map((t) => t.name)).toEqual(['Panopticon тёмная', 'Nord', 'Gruvbox Dark', 'Dracula', 'Modus Vivendi']);
    for (const t of ALL) for (const n of NAMED) expect(t.colors.palette[n], t.name + ' ' + n).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('the Panopticon themes keep the text readable: text, headings and the palette ≥ 4.5:1', () => {
    for (const t of BUILTIN.filter((x) => x.name.startsWith('Panopticon'))) {
      const c = t.colors;
      for (const v of [c.fg, c.h1, c.h2, c.h3, c.link, c.date, ...Object.values(c.palette)]) expect(contrast(v, c.bg), t.name + ' ' + v).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('levels 5–9 follow level 4 unless set; deeper than 9 as 9', () => {
    const c = { ...BUILTIN[0].colors, h4: '#111111', h6: '#666666' };
    expect([5, 6, 7, 9, 12].map((n) => levelColor(c, n))).toEqual(['#111111', '#666666', '#666666', '#666666', '#666666']);
  });
  it('the variables of a theme', () => {
    const v = themeVars(BUILTIN[0].colors);
    expect(v).toContain('--ed-bg:#ffffff;');
    expect(v).toContain('--ed-h9:#a4510a;');
    expect(v).toContain('--p-red:#c4262e;');
  });
});

describe('own themes', async () => {
  const { parseTheme, themeJson, uniqueName, copyOf, themeFile } = await import('./themes');
  it('a file is read back as it was written', () => {
    const t = copyOf(ALL.find((x) => x.name === 'Nord')!, []);
    expect(t.name).toBe('Nord — моя');
    expect(t.basedOn).toBe('Nord');
    expect(parseTheme(themeJson(t))).toEqual(t);
  });
  it('unknown keys ignored, missing ones from Panopticon of the appearance, #rgb expanded; not a theme → null', () => {
    const t = parseTheme(JSON.stringify({ format: 'panopticon-theme', version: 1, name: ' Моя ', appearance: 'dark', extra: 1, colors: { bg: '#123', h5: '#ABCDEF', palette: { red: '#f00' }, nope: '#fff' } }))!;
    expect(t.name).toBe('Моя');
    expect(t.colors.bg).toBe('#112233');
    expect(t.colors.h5).toBe('#abcdef');
    expect(t.colors.fg).toBe(BUILTIN.find((x) => x.name === 'Panopticon тёмная')!.colors.fg);
    expect(t.colors.palette.red).toBe('#ff0000');
    expect(parseTheme('{"name":"x"}')).toBeNull();
    expect(parseTheme('nope')).toBeNull();
    // no appearance: by the background
    expect(parseTheme(JSON.stringify({ format: 'panopticon-theme', name: 'Т', colors: { bg: '#101010' } }))!.appearance).toBe('dark');
  });
  it('names: «(2)» on a clash (as files, any case), a copy of an own theme keeps its base', () => {
    expect(uniqueName('Nord', ['Nord', 'nord (2)'])).toBe('Nord (3)');
    expect(uniqueName('Своя', ['Nord'])).toBe('Своя');
    expect(themeFile('a/b:c')).toBe('a-b-c.json');
    const own = { ...copyOf(ALL.find((x) => x.name === 'Nord')!, []), name: 'Моя' };
    expect(copyOf(own, ['Моя'])).toMatchObject({ name: 'Моя (2)', basedOn: 'Nord' });
  });
});

describe('the colour picker', async () => {
  const { toHsv, fromHsv, parseHex } = await import('./colors');
  it('hex → hsv → hex keeps the colour, the alpha only when below 1', () => {
    for (const c of ['#88c0d0', '#bf616a', '#000000', '#ffffff', '#3b4252cc']) {
      const v = toHsv(c);
      expect(fromHsv(v.h, v.s, v.v, v.a)).toBe(c);
    }
    expect(toHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1, a: 1 });
  });
  it('typed colours', () => {
    expect(parseHex('#ABC')).toBe('#aabbcc');
    expect(parseHex('88c0d0')).toBe('#88c0d0');
    expect(parseHex(' #3b4252CC ')).toBe('#3b4252cc');
    expect(parseHex('#12')).toBeNull();
    expect(parseHex('nope')).toBeNull();
  });
});

describe('contrast in the theme editor', async () => {
  const { lowContrast, ratioWords } = await import('./themes');
  it('text below 4.5:1 and headings below 3:1 are marked; an inherited deep level is not', () => {
    const c = { ...BUILTIN[0].colors, dim: '#bbbbbb', h2: '#888888', h3: '#cccccc' };
    const low = lowContrast(c);
    expect([...low.keys()]).toEqual(['dim', 'h3']);
    expect(ratioWords(low.get('dim')!)).toBe('1,9:1');
    expect(lowContrast({ ...c, h6: '#eeeeee' }).has('h6')).toBe(true);
  });
});
