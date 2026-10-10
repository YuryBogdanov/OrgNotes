// Status colours: eight named colours with a value for each theme, or a custom hex.
// A custom colour is stored as the light-theme hex; its dark variant is derived so that the text keeps
// a contrast of at least 4.5:1 against the dark background.

export interface Tone {
  light: string;
  dark: string;
}

export const DARK_BG = '#1e1e22';
export const LIGHT_BG = '#ffffff';

/** In grid order (4 x 2). */
export const PALETTE: { id: string; name: string; light: string; dark: string }[] = [
  { id: 'gray', name: 'Серый', light: '#5f5f66', dark: '#a9a9b3' },
  { id: 'red', name: 'Красный', light: '#c4262e', dark: '#ff7b80' },
  { id: 'orange', name: 'Оранжевый', light: '#935300', dark: '#f0b04d' },
  { id: 'green', name: 'Зелёный', light: '#1d7f3a', dark: '#6fd58a' },
  { id: 'teal', name: 'Бирюзовый', light: '#0b7a6f', dark: '#5fd3c2' },
  { id: 'blue', name: 'Синий', light: '#0a58c2', dark: '#6cb4ff' },
  { id: 'purple', name: 'Фиолетовый', light: '#7a3fc4', dark: '#c39bff' },
  { id: 'pink', name: 'Розовый', light: '#a3187a', dark: '#f58ad4' },
];

export const HEX = /^#[0-9a-f]{6}$/i;
export const isColor = (c: unknown): c is string => typeof c === 'string' && (PALETTE.some((p) => p.id === c) || HEX.test(c));

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** WCAG relative luminance contrast ratio. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = rgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [la, lb] = [lum(a), lum(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hslOf(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}
function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Dark-theme variant of a custom colour: lighten until the contrast to the dark background is at least 4.5:1. */
export function darkVariant(lightHex: string): string {
  if (contrast(lightHex, DARK_BG) >= 4.5) return lightHex.toLowerCase();
  const [h, s, l0] = hslOf(lightHex);
  for (let l = l0; l <= 0.97; l += 0.01) {
    const c = fromHsl(h, s, l);
    if (contrast(c, DARK_BG) >= 4.5) return c;
  }
  return '#ffffff';
}

/** Both theme values for a colour id or hex; undefined for an unknown id. */
export function toneOf(color: string | undefined): Tone | undefined {
  if (!color) return undefined;
  const p = PALETTE.find((x) => x.id === color);
  if (p) return { light: p.light, dark: p.dark };
  if (HEX.test(color)) return { light: color.toLowerCase(), dark: darkVariant(color) };
  return undefined;
}

/** Inline style that feeds the `.tone` / `.tone-chip` classes in app.css. */
export const toneStyle = (t: Tone) => `--tl:${t.light};--td:${t.dark}`;

export const colorName = (color: string) => PALETTE.find((p) => p.id === color)?.name ?? 'Другой цвет';
