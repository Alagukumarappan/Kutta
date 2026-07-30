import { computeGridDimensions, computePieceRects, shufflePieceOrder, computePuzzleBoardSize } from '../../src/puzzle/puzzleGrid';

// computePuzzleBoardSize delegates to computeResponsiveSquareSize with these fixed
// constants (mirrored here, not imported, so these tests catch a regression in either
// file): reservedHeight=160, reservedWidth=220, min=200, max=420.
// Formula: clamp(min(windowHeight - 160, windowWidth - 220), 200, 420).
describe('computePuzzleBoardSize', () => {
  it('is bound by width when width is the tighter constraint', () => {
    // maxByWidth = 500 - 220 = 280; maxByHeight = 1000 - 160 = 840 -> min is 280, within [200,420]
    expect(computePuzzleBoardSize(500, 1000)).toBe(280);
  });

  it('is bound by height when height is the tighter constraint', () => {
    // maxByHeight = 500 - 160 = 340; maxByWidth = 1000 - 220 = 780 -> min is 340, within [200,420]
    expect(computePuzzleBoardSize(1000, 500)).toBe(340);
  });

  it('clamps to the minimum size when the window is very small', () => {
    // maxByWidth = 300 - 220 = 80; maxByHeight = 300 - 160 = 140 -> min is 80, clamped up to 200
    expect(computePuzzleBoardSize(300, 300)).toBe(200);
  });

  it('clamps to the maximum size when the window is very large', () => {
    // maxByWidth = 2000 - 220 = 1780; maxByHeight = 2000 - 160 = 1840 -> min is 1780, clamped down to 420
    expect(computePuzzleBoardSize(2000, 2000)).toBe(420);
  });

  it('defaults to zero insets when none are passed, matching a device with no notch/nav-bar', () => {
    expect(computePuzzleBoardSize(1000, 500)).toBe(computePuzzleBoardSize(1000, 500, { top: 0, right: 0, bottom: 0, left: 0 }));
  });

  it('shrinks the board to make room for real device insets (notch/status bar/gesture-nav bar)', () => {
    // maxByHeight = 500 - 160 - (20 top + 30 bottom) = 290; maxByWidth = 1000 - 220 - (10 left + 10 right) = 760
    // -> min is 290, within [200, 420]
    expect(computePuzzleBoardSize(1000, 500, { top: 20, right: 10, bottom: 30, left: 10 })).toBe(290);
  });
});

describe('computeGridDimensions', () => {
  it.each([
    [4, 2, 2],
    [6, 2, 3],
    [9, 3, 3],
    [12, 3, 4],
  ])('for %i pieces returns %i rows and %i cols', (pieceCount, rows, cols) => {
    expect(computeGridDimensions(pieceCount as 4 | 6 | 9 | 12)).toEqual({ rows, cols });
  });
});

describe('computePieceRects', () => {
  it('divides the image into equal-sized, non-overlapping, fully-covering rects', () => {
    const rects = computePieceRects(300, 200, 2, 2);
    expect(rects).toHaveLength(4);
    expect(rects.every((r) => r.width === 150 && r.height === 100)).toBe(true);
    expect(rects.map((r) => `${r.x},${r.y}`).sort()).toEqual(['0,0', '0,100', '150,0', '150,100'].sort());
  });

  it('assigns sequential pieceIndex values matching row-major order', () => {
    const rects = computePieceRects(300, 200, 2, 2);
    expect(rects.map((r) => r.pieceIndex)).toEqual([0, 1, 2, 3]);
  });
});

describe('shufflePieceOrder', () => {
  it('returns a permutation of 0..N-1', () => {
    const order = shufflePieceOrder(9);
    expect(order.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('never returns the identity order when there is more than one piece', () => {
    // With an RNG that produces identity from Fisher-Yates (rng()≈1 makes j≈i at each step),
    // the function must detect and fix this by swapping elements.
    const identityProducingRng = () => 0.99999;
    for (let pieceCount of [4, 6, 9, 12]) {
      const order = shufflePieceOrder(pieceCount, identityProducingRng);
      expect(order).not.toEqual(Array.from({ length: pieceCount }, (_, i) => i));
    }
  });
});
