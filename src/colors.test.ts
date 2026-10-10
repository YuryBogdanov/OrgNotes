import { describe, expect, it } from 'vitest';
import { DARK_BG, LIGHT_BG, PALETTE, contrast, darkVariant, isColor, toneOf } from './colors';

describe('palette', () => {
  it('has eight named colours that read well in both themes', () => {
    expect(PALETTE).toHaveLength(8);
    for (const p of PALETTE) {
      expect(contrast(p.light, LIGHT_BG), p.id + ' light').toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.dark, DARK_BG), p.id + ' dark').toBeGreaterThanOrEqual(4.5);
    }
  });
  it('knows named colours and hex only', () => {
    expect(isColor('blue')).toBe(true);
    expect(isColor('#a1b2c3')).toBe(true);
    expect(isColor('#fff')).toBe(false);
    expect(isColor('chartreuse')).toBe(false);
  });
});

describe('custom colours', () => {
  it('keeps the light value and derives a dark one that has enough contrast', () => {
    const t = toneOf('#2a2a8a')!; // dark blue: unreadable on a dark background as is
    expect(t.light).toBe('#2a2a8a');
    expect(contrast(t.dark, DARK_BG)).toBeGreaterThanOrEqual(4.5);
    expect(t.dark).not.toBe('#2a2a8a');
  });
  it('leaves an already readable colour alone', () => {
    expect(darkVariant('#ffd479')).toBe('#ffd479');
  });
  it('handles black and near-black', () => {
    expect(contrast(darkVariant('#000000'), DARK_BG)).toBeGreaterThanOrEqual(4.5);
  });
  it('resolves named colours to their pair and unknown ones to nothing', () => {
    expect(toneOf('green')).toEqual({ light: '#1d7f3a', dark: '#6fd58a' });
    expect(toneOf('nope')).toBeUndefined();
    expect(toneOf(undefined)).toBeUndefined();
  });
});
