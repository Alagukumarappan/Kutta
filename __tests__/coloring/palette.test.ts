import { PALETTE } from '../../src/coloring/palette';
import { t } from '../../src/i18n/strings';

describe('PALETTE', () => {
  it('has exactly 17 entries', () => {
    // Grew from the original 12 (crayon-box basics/neutrals) in iteration 25
    // to close two genuine category gaps against the spec's exhaustive
    // list (basic/light/dark/warm/cool/skin-tone-friendly/neutral): a
    // light/pastel shade, a dark shade beyond black, and a small
    // skin-tone-friendly range (light/medium/deep) so kids can color
    // people. See palette.ts's own comments for the full reasoning.
    expect(PALETTE).toHaveLength(17);
  });

  it('has no duplicate display (hex) values', () => {
    const displays = PALETTE.map((c) => c.display);
    expect(new Set(displays).size).toBe(displays.length);
  });

  it('has no duplicate fill (RGBA) values', () => {
    const fills = PALETTE.map((c) => c.fill.join(','));
    expect(new Set(fills).size).toBe(fills.length);
  });

  it('has no duplicate nameKey values', () => {
    const keys = PALETTE.map((c) => c.nameKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has a valid #RRGGBB hex string for every display value', () => {
    for (const color of PALETTE) {
      expect(color.display).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('has a well-formed RGBA fill for every entry', () => {
    for (const color of PALETTE) {
      expect(color.fill).toHaveLength(4);
      for (const channel of color.fill) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
      // Every palette swatch is fully opaque.
      expect(color.fill[3]).toBe(255);
    }
  });

  it('every nameKey resolves to a non-empty, non-whitespace English string', () => {
    for (const color of PALETTE) {
      const label = t(color.nameKey, 'en');
      expect(typeof label).toBe('string');
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it('every nameKey resolves to a non-empty, non-whitespace German string', () => {
    for (const color of PALETTE) {
      const label = t(color.nameKey, 'de');
      expect(typeof label).toBe('string');
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it('has a genuinely light/pastel shade distinct from the vivid basics', () => {
    // A pastel is high-lightness: all three channels should read bright.
    const hasLight = PALETTE.some(
      (c) => c.fill[0] >= 150 && c.fill[1] >= 150 && c.fill[2] >= 150 && c.nameKey !== 'paletteColorWhite'
    );
    expect(hasLight).toBe(true);
  });

  it('has a genuinely dark shade beyond plain black', () => {
    const hasDark = PALETTE.some(
      (c) =>
        c.nameKey !== 'paletteColorBlack' &&
        c.fill[0] <= 90 &&
        c.fill[1] <= 90 &&
        c.fill[2] <= 90
    );
    expect(hasDark).toBe(true);
  });

  it('includes a small skin-tone-friendly range so children can color people', () => {
    const skinKeys = PALETTE.map((c) => c.nameKey).filter((k) => k.toLowerCase().includes('skin'));
    // At least a light/medium/deep spread, not just a single token gesture.
    expect(skinKeys.length).toBeGreaterThanOrEqual(3);
  });
});
