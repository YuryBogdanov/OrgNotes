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
