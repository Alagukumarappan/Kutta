import { clamp, computeResponsiveRectSize } from '../../src/theme/tokens';

describe('clamp', () => {
  it('returns the value unchanged when already within range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it('clamps to the minimum when below range', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  it('clamps to the maximum when above range', () => {
    expect(clamp(500, 0, 100)).toBe(100);
  });
});

describe('computeResponsiveRectSize', () => {
  it('gives width and height independent room, unlike a square-constrained size', () => {
    // A short-but-wide landscape window: plenty of width, tight height.
    // A square size would have to shrink width down to match height's
    // tighter budget (900 - 200 = 700 min(700,...) -> capped low); this
    // rect version should let width use its own full available space.
    const size = computeResponsiveRectSize(900, 360, 200, 32, 200, 900);
    expect(size.width).toBe(868); // 900 - 32
    expect(size.height).toBe(200); // clamped up to minSize from 360-200=160
  });

  it('clamps each axis to the given minSize when the window is very small', () => {
    const size = computeResponsiveRectSize(250, 250, 200, 200, 200, 900);
    expect(size.width).toBe(200);
    expect(size.height).toBe(200);
  });

  it('clamps each axis to the given maxSize on a very large window', () => {
    const size = computeResponsiveRectSize(2000, 2000, 100, 100, 200, 900);
    expect(size.width).toBe(900);
    expect(size.height).toBe(900);
  });

  it('computes width and height independently rather than taking the tighter of the two', () => {
    const size = computeResponsiveRectSize(1000, 500, 100, 700, 200, 900);
    // Width budget: 1000-700=300. Height budget: 500-100=400. A
    // square-constrained size would take min(300,400)=300 for BOTH axes;
    // this must keep them independent.
    expect(size.width).toBe(300);
    expect(size.height).toBe(400);
  });
});
