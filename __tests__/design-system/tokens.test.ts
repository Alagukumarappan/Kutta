import {
  colors,
  getActivityPalette,
  withAlpha,
  spacing,
  radii,
  typography,
  elevation,
  motion,
  tilt,
  touchTarget,
} from '../../src/design-system/tokens';

describe('withAlpha', () => {
  it('converts a 6-digit hex color to an rgba string at the given alpha', () => {
    expect(withAlpha('#FF4FA3', 0.5)).toBe('rgba(255, 79, 163, 0.5)');
  });

  it('works without a leading #', () => {
    expect(withAlpha('00C9A7', 1)).toBe('rgba(0, 201, 167, 1)');
  });

  it('clamps alpha below 0 up to 0', () => {
    expect(withAlpha('#000000', -1)).toBe('rgba(0, 0, 0, 0)');
  });

  it('clamps alpha above 1 down to 1', () => {
    expect(withAlpha('#FFFFFF', 5)).toBe('rgba(255, 255, 255, 1)');
  });

  it('throws on a malformed hex color rather than silently producing NaN channels', () => {
    expect(() => withAlpha('#ABC', 0.5)).toThrow();
  });
});

describe('getActivityPalette', () => {
  it('gives each activity a distinct accent from the others', () => {
    const activities = ['coloring', 'quiz', 'puzzle', 'video', 'tictactoe'] as const;
    const accents = activities.map((activity) => getActivityPalette(activity).accent);
    expect(new Set(accents).size).toBe(activities.length);
  });

  it('maps coloring to the bubblegum family', () => {
    expect(getActivityPalette('coloring')).toEqual({
      accent: colors.bubblegum,
      accentDark: colors.bubblegumDark,
      accentSoft: colors.bubblegumSoft,
      onAccentText: colors.white,
    });
  });

  // Regression test for the premium-polish accessibility pass: computes
  // the REAL WCAG contrast ratio for every activity's onAccentText against
  // its own accent, rather than just pinning today's color choices — this
  // stays meaningful even if `colors.ink`/individual accent hues change
  // later, and would have caught the original bug (white text on
  // jade/marigold/sky scored ~2.1:1/~1.8:1/~2.0:1, all well under the 3:1
  // minimum for large/bold label text).
  function relativeLuminance(hex: string): number {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
    const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const [rl, gl, bl] = [r, g, b].map(linearize);
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  }
  function contrastRatio(hexA: string, hexB: string): number {
    const [lLight, lDark] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
    return (lLight + 0.05) / (lDark + 0.05);
  }

  it("gives every activity's onAccentText at least a 3:1 contrast ratio against its own accent (WCAG AA for large/bold label text)", () => {
    const activities = ['coloring', 'quiz', 'puzzle', 'video', 'tictactoe'] as const;
    for (const activity of activities) {
      const palette = getActivityPalette(activity);
      const ratio = contrastRatio(palette.accent, palette.onAccentText);
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });

  it('maps quiz to the violet family', () => {
    expect(getActivityPalette('quiz').accent).toBe(colors.violet);
  });

  it('maps puzzle to the jade family', () => {
    expect(getActivityPalette('puzzle').accent).toBe(colors.jade);
  });

  it('maps video to the marigold family', () => {
    expect(getActivityPalette('video').accent).toBe(colors.marigold);
  });

  it('maps tictactoe to the sky family', () => {
    expect(getActivityPalette('tictactoe').accent).toBe(colors.sky);
  });
});

describe('design token scales', () => {
  it('spacing increases monotonically', () => {
    const values = Object.values(spacing);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('radii increases monotonically up to pill', () => {
    expect(radii.sm).toBeLessThan(radii.md);
    expect(radii.md).toBeLessThan(radii.lg);
    expect(radii.lg).toBeLessThan(radii.xl);
    expect(radii.xl).toBeLessThan(radii.xxl);
    expect(radii.pill).toBeGreaterThan(radii.xxl);
  });

  it('typography sizes increase from caption up to display', () => {
    expect(typography.caption.fontSize).toBeLessThan(typography.bodySmall.fontSize);
    expect(typography.bodySmall.fontSize).toBeLessThan(typography.body.fontSize);
    expect(typography.body.fontSize).toBeLessThan(typography.h3.fontSize);
    expect(typography.h3.fontSize).toBeLessThan(typography.h2.fontSize);
    expect(typography.h2.fontSize).toBeLessThan(typography.h1.fontSize);
    expect(typography.h1.fontSize).toBeLessThan(typography.display.fontSize);
  });

  it('elevation levels increase in shadow strength', () => {
    const levels = [elevation.level1, elevation.level2, elevation.level3, elevation.level4, elevation.level5];
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].shadowOpacity).toBeGreaterThanOrEqual(levels[i - 1].shadowOpacity);
      expect(levels[i].elevation).toBeGreaterThan(levels[i - 1].elevation);
    }
  });

  it('touch targets meet or exceed Material Design\'s 48dp minimum', () => {
    expect(touchTarget.minimum).toBeGreaterThanOrEqual(48);
    expect(touchTarget.comfortable).toBeGreaterThanOrEqual(touchTarget.minimum);
    expect(touchTarget.primaryCTA).toBeGreaterThanOrEqual(touchTarget.comfortable);
  });

  it('exposes gentle (no-overshoot) and bouncy spring presets distinctly', () => {
    expect(motion.spring.pressGentle.bounciness).toBe(0);
    expect(motion.spring.popBouncy.bounciness).toBeGreaterThan(0);
  });

  it('compact tilt is gentler than regular tilt', () => {
    expect(Math.abs(tilt.compact.rotateXDeg)).toBeLessThanOrEqual(Math.abs(tilt.regular.rotateXDeg));
    expect(Math.abs(tilt.compact.liftPx)).toBeLessThanOrEqual(Math.abs(tilt.regular.liftPx));
  });
});
