import { describe, expect, it } from 'vitest';
import { PALETTE, colorName, contrast, isColor, toneOf } from './colors';
import { BUILTIN, NAMED, asNamed, levelColor, nearestNamed, themeVars } from './themes';

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
  it('four for the light appearance, five for the dark; every colour set', () => {
    expect(BUILTIN.filter((t) => t.appearance === 'light').map((t) => t.name)).toEqual(['Panopticon светлая', 'Leuven', 'Solarized Light', 'Modus Operandi']);
    expect(BUILTIN.filter((t) => t.appearance === 'dark').map((t) => t.name)).toEqual(['Panopticon тёмная', 'Nord', 'Gruvbox Dark', 'Dracula', 'Modus Vivendi']);
    for (const t of BUILTIN) for (const n of NAMED) expect(t.colors.palette[n], t.name + ' ' + n).toMatch(/^#[0-9a-f]{6}$/);
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
