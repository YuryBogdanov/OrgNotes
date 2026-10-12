// Status and tag colours: one of eight named colours. Each editor theme gives its shade (`--p-<name>`, themes.ts),
// so statuses and tags suit any theme. Old settings (pink, a custom hex) are read as the nearest named colour.

import { NAMED, NAMED_RU, asNamed } from './themes';

/** A colour for both appearances: CSS values (the theme's variables). */
export interface Tone {
  light: string;
  dark: string;
}

/** In grid order (4 x 2). */
export const PALETTE: { id: string; name: string }[] = NAMED.map((id) => ({ id, name: NAMED_RU[id] }));

export const isColor = (c: unknown): boolean => asNamed(c) !== undefined;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
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

/** The tone of a colour id (an old pink or hex as the nearest named one); undefined for an unknown one. */
export function toneOf(color: string | undefined): Tone | undefined {
  const n = asNamed(color);
  if (!n) return undefined;
  const v = `var(--p-${n})`;
  return { light: v, dark: v };
}

/** Inline style that feeds the `.tone` / `.tone-chip` classes in app.css. */
export const toneStyle = (t: Tone) => `--tl:${t.light};--td:${t.dark}`;

export const colorName = (color: string) => {
  const n = asNamed(color);
  return n ? NAMED_RU[n] : 'Авто';
};

// ---- the colour picker of the theme editor (ТЗ 25 §2.3): hue / saturation / value, an alpha for two colours ------

/** `#rrggbb` or `#rrggbbaa` → hue 0…360, saturation and value 0…1, alpha 0…1. */
export function toHsv(hex: string): { h: number; s: number; v: number; a: number } {
  const [r, g, b] = rgb(hex).map((x) => x / 255);
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max, a };
}
const hx = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
/** Back to hex; the alpha is written only when it is below 1. */
export function fromHsv(h: number, s: number, v: number, a = 1): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return '#' + hx(f(5) * 255) + hx(f(3) * 255) + hx(f(1) * 255) + (a < 1 ? hx(a * 255) : '');
}
/** What may be typed as a colour: `#rrggbb`, `#rgb`, `rrggbb` (and `#rrggbbaa`) → `#rrggbb[aa]`, else null. */
export function parseHex(s: string): string | null {
  const t = s.trim().replace(/^#?/, '#').toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(t)) return '#' + [...t.slice(1)].map((c) => c + c).join('');
  return /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/.test(t) ? t : null;
}
