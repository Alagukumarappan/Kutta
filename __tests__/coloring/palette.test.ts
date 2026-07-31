import { PALETTE } from '../../src/coloring/palette';
import { t } from '../../src/i18n/strings';

describe('PALETTE', () => {
  it('has exactly 12 entries', () => {
    expect(PALETTE).toHaveLength(12);
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
});
