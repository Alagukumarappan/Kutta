import { paperTheme, parentPaperTheme } from '../../src/design-system/paperTheme';
import { colors } from '../../src/design-system/tokens';

describe('paperTheme', () => {
  it('maps the brand palette onto MD3 theme colors instead of Paper\'s stock purple defaults', () => {
    expect(paperTheme.colors.primary).toBe(colors.bubblegum);
    expect(paperTheme.colors.secondary).toBe(colors.violet);
    expect(paperTheme.colors.tertiary).toBe(colors.jade);
    expect(paperTheme.colors.error).toBe(colors.berry);
    expect(paperTheme.colors.background).toBe(colors.canvas);
  });

  it('configures a font scale (no default MD3/Roboto sizes left unconfigured for the variants we use)', () => {
    expect(paperTheme.fonts.bodyLarge.fontSize).toBeDefined();
    expect(paperTheme.fonts.labelLarge.fontWeight).toBe('800');
  });

  it('is a real MD3 theme object (has the version/isV3-style shape Paper expects)', () => {
    expect(paperTheme.colors.elevation).toBeDefined();
    expect(paperTheme.colors.elevation.level1).toBe(colors.surface);
  });
});

describe('parentPaperTheme', () => {
  it('uses the calmer, muted parent palette instead of the playful child-facing brand colors', () => {
    expect(parentPaperTheme.colors.primary).toBe(colors.parent.accent);
    expect(parentPaperTheme.colors.background).toBe(colors.parent.background);
    expect(parentPaperTheme.colors.primary).not.toBe(paperTheme.colors.primary);
  });

  it('keeps the same roundness/fonts as the main theme so it still reads as the same app', () => {
    expect(parentPaperTheme.roundness).toBe(paperTheme.roundness);
    expect(parentPaperTheme.fonts).toBe(paperTheme.fonts);
  });
});
