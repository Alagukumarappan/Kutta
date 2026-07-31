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
    });
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
