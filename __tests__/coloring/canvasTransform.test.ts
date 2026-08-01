import {
  screenPointToCanvasPoint,
  pagePointToLocalPoint,
  clampTransform,
  touchDistance,
  touchMidpoint,
  applyPinchPan,
  IDENTITY_TRANSFORM,
  type CanvasTransform,
} from '../../src/coloring/canvasTransform';

describe('pagePointToLocalPoint', () => {
  it('returns the page point unchanged when the origin is (0, 0)', () => {
    expect(pagePointToLocalPoint(120, 80, { x: 0, y: 0 })).toEqual({ x: 120, y: 80 });
  });

  it('subtracts the given origin from the page point', () => {
    expect(pagePointToLocalPoint(120, 80, { x: 20, y: 30 })).toEqual({ x: 100, y: 50 });
  });

  it('can produce a negative local point when the page point is above/left of the origin', () => {
    expect(pagePointToLocalPoint(10, 10, { x: 50, y: 50 })).toEqual({ x: -40, y: -40 });
  });
});

describe('screenPointToCanvasPoint', () => {
  it('returns the input unchanged at the identity transform', () => {
    expect(screenPointToCanvasPoint(100, 100, IDENTITY_TRANSFORM)).toEqual({ x: 100, y: 100 });
  });

  it('divides by scale for a scale-only transform', () => {
    const transform: CanvasTransform = { scale: 2, translateX: 0, translateY: 0 };
    expect(screenPointToCanvasPoint(100, 100, transform)).toEqual({ x: 50, y: 50 });
  });

  it('subtracts the translation for a translate-only transform', () => {
    const transform: CanvasTransform = { scale: 1, translateX: 20, translateY: -10 };
    expect(screenPointToCanvasPoint(100, 100, transform)).toEqual({ x: 80, y: 110 });
  });

  it('inverts a combined scale+translate transform correctly', () => {
    // Forward check: a canvas point (50,50) under scale:2, translate:(30,40)
    // lands on screen at (50*2+30, 50*2+40) = (130,140) — inverting that
    // screen point should recover exactly (50,50).
    const transform: CanvasTransform = { scale: 2, translateX: 30, translateY: 40 };
    expect(screenPointToCanvasPoint(130, 140, transform)).toEqual({ x: 50, y: 50 });
  });

  it('falls back to scale 1 instead of dividing by zero when scale is 0', () => {
    const transform: CanvasTransform = { scale: 0, translateX: 0, translateY: 0 };
    const result = screenPointToCanvasPoint(50, 50, transform);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(result).toEqual({ x: 50, y: 50 });
  });

  it('falls back to scale 1 instead of propagating NaN when scale is NaN', () => {
    const transform: CanvasTransform = { scale: NaN, translateX: 0, translateY: 0 };
    const result = screenPointToCanvasPoint(50, 50, transform);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
  });
});

describe('clampTransform', () => {
  const opts = { minScale: 1, maxScale: 4, canvasWidth: 200, canvasHeight: 100 };

  it('clamps a scale below minScale up to minScale', () => {
    const result = clampTransform({ scale: 0.5, translateX: 0, translateY: 0 }, opts);
    expect(result.scale).toBe(1);
  });

  it('clamps a scale above maxScale down to maxScale', () => {
    const result = clampTransform({ scale: 10, translateX: 0, translateY: 0 }, opts);
    expect(result.scale).toBe(4);
  });

  it('pins translateX/Y to exactly 0 at scale===minScale, regardless of input', () => {
    const result = clampTransform({ scale: 1, translateX: 999, translateY: -999 }, opts);
    expect(result).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it('reproduces the untouched identity transform when given the identity transform', () => {
    expect(clampTransform(IDENTITY_TRANSFORM, opts)).toEqual(IDENTITY_TRANSFORM);
  });

  it('clamps translateX/Y to the valid range at a zoomed-in scale', () => {
    // At scale:2, canvasWidth:200 -> valid translateX range is [-200, 0].
    const zoomedOpts = { ...opts, canvasHeight: 200 };
    const tooFarRight = clampTransform({ scale: 2, translateX: 500, translateY: 500 }, zoomedOpts);
    expect(tooFarRight.translateX).toBe(0);
    expect(tooFarRight.translateY).toBe(0);

    const tooFarLeft = clampTransform({ scale: 2, translateX: -500, translateY: -500 }, zoomedOpts);
    expect(tooFarLeft.translateX).toBe(-200);
    expect(tooFarLeft.translateY).toBe(-200);
  });
});

describe('touchDistance / touchMidpoint', () => {
  it('computes the straight-line distance between two points', () => {
    expect(touchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('returns 0 for two identical points', () => {
    expect(touchDistance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0);
  });

  it('computes the midpoint between two points', () => {
    expect(touchMidpoint({ x: 0, y: 0 }, { x: 3, y: 4 })).toEqual({ x: 1.5, y: 2 });
  });
});

describe('applyPinchPan', () => {
  it('doubles scale when the two fingers move to double their previous distance, anchored at the midpoint', () => {
    // Identity transform, fingers start at (40,100)/(60,100) — distance 20,
    // midpoint (50,100) — then move to (20,100)/(80,100) — distance 60,
    // scale ratio doubling... use a clean 2x: start distance 20, end 40.
    const prevTouches: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 40, y: 100 },
      { x: 60, y: 100 },
    ];
    const currentTouches: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 30, y: 100 },
      { x: 70, y: 100 },
    ];
    const result = applyPinchPan(IDENTITY_TRANSFORM, prevTouches, currentTouches);

    expect(result.scale).toBeCloseTo(2);
    // The canvas-space point under the ORIGINAL midpoint (50,100) — which,
    // at the identity transform, is just (50,100) itself — must map back to
    // the SAME midpoint (50,100) under the new transform:
    // 50*newScale + translateX === 50, and likewise for Y.
    expect(50 * result.scale + result.translateX).toBeCloseTo(50);
    expect(100 * result.scale + result.translateY).toBeCloseTo(100);
    expect(result.translateX).toBeCloseTo(-50);
    expect(result.translateY).toBeCloseTo(-100);
  });

  it('does not change scale on a pure pan (no distance change), and shifts translate by the midpoint delta', () => {
    const prevTouches: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ];
    const currentTouches: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 10, y: 5 },
      { x: 30, y: 5 },
    ];
    const result = applyPinchPan(IDENTITY_TRANSFORM, prevTouches, currentTouches);

    expect(result.scale).toBeCloseTo(1);
    expect(result.translateX).toBeCloseTo(10);
    expect(result.translateY).toBeCloseTo(5);
  });

  it('falls back to a scale ratio of 1 instead of dividing by zero when the previous distance was 0', () => {
    const overlapping: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 50, y: 50 },
      { x: 50, y: 50 },
    ];
    const currentTouches: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 40, y: 50 },
      { x: 60, y: 50 },
    ];
    const result = applyPinchPan(IDENTITY_TRANSFORM, overlapping, currentTouches);

    expect(result.scale).toBeCloseTo(1);
    expect(Number.isFinite(result.translateX)).toBe(true);
    expect(Number.isFinite(result.translateY)).toBe(true);
  });

  it('composes correctly starting from a non-identity previous transform', () => {
    const previous: CanvasTransform = { scale: 2, translateX: -50, translateY: -30 };
    const prevTouches: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 40, y: 100 },
      { x: 60, y: 100 },
    ];
    const currentTouches: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 30, y: 100 },
      { x: 70, y: 100 },
    ];
    const result = applyPinchPan(previous, prevTouches, currentTouches);

    expect(result.scale).toBeCloseTo(4); // previous.scale (2) * ratio (2)
    // The canvas-space point under the previous midpoint must map to the
    // new midpoint under the new transform.
    const anchor = screenPointToCanvasPoint(50, 100, previous);
    expect(anchor.x * result.scale + result.translateX).toBeCloseTo(50);
    expect(anchor.y * result.scale + result.translateY).toBeCloseTo(100);
  });
});
