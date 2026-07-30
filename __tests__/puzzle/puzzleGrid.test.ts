import { computeGridDimensions, computePieceRects, shufflePieceOrder, computePuzzleBoardSize } from '../../src/puzzle/puzzleGrid';

// computePuzzleBoardSize reserves the same fixed chrome (mirrored here, not imported, so
// these tests catch a regression in either file): reservedHeight=160, reservedWidth=220,
// floor=200 (there is deliberately no ceiling any more - the board should use as much of
// the available landscape space as the real screen allows, not clamp down to a small
// fixed square regardless of screen size). It then fits a WIDTH x HEIGHT box that
// preserves the real photo's aspect ratio into whatever space is left.
describe('computePuzzleBoardSize', () => {
  it('fills the available width for a landscape photo on a wide landscape screen', () => {
    // window 800x360, insets zero: availableWidth = 800-220 = 580, availableHeight = 360-160 = 200.
    // photo is 4:3 landscape (aspectRatio = 4/3). width/ratio = 580/(4/3) = 435 > 200 (availableHeight),
    // so height is the binding constraint: height = 200, width = 200 * 4/3 = 266.67.
    const board = computePuzzleBoardSize(800, 360, 400, 300);
    expect(board.height).toBeCloseTo(200);
    expect(board.width).toBeCloseTo(266.667, 2);
  });

  it('preserves a portrait photo real aspect ratio instead of forcing a square', () => {
    // window 800x360, insets zero: availableWidth = 580, availableHeight = 200.
    // photo is 3:4 portrait (aspectRatio = 3/4 = 0.75). width/ratio = 580/0.75 = 773.3 > 200,
    // so height is the binding constraint: height = 200, width = 200 * 0.75 = 150.
    // width (150) is below the 200 floor, but scaling up to the floor (x1.3333) would need
    // height = 266.67 > availableHeight (200) - i.e. it would overflow and force scrolling -
    // so the floor is capped by available space instead: maxScale = min(580/150, 200/200) = 1,
    // so the board stays at width=150, height=200 (fits perfectly, no scrolling needed).
    const board = computePuzzleBoardSize(800, 360, 300, 400);
    expect(board.width).toBeCloseTo(150);
    expect(board.height).toBeCloseTo(200);
    // Sanity: the board itself is taller than it is wide, matching the portrait photo.
    expect(board.height).toBeGreaterThan(board.width);
  });

  it('is bound by width when width is the tighter constraint', () => {
    // window 500x1000, square photo: availableWidth = 500-220 = 280, availableHeight = 1000-160 = 840.
    // width/ratio(1) = 280 <= 840, so width is binding: width = 280, height = 280.
    const board = computePuzzleBoardSize(500, 1000, 100, 100);
    expect(board.width).toBeCloseTo(280);
    expect(board.height).toBeCloseTo(280);
  });

  it('floors to the minimum size when the window is very small', () => {
    // availableWidth = max(300-220, 200) = 200 (floored); availableHeight = max(300-160, 200) = 200 (floored).
    // Square photo -> both stay at the 200 floor.
    const board = computePuzzleBoardSize(300, 300, 100, 100);
    expect(board.width).toBeCloseTo(200);
    expect(board.height).toBeCloseTo(200);
  });

  it('uses far more of a very large window than the old fixed 420 ceiling allowed', () => {
    // window 2000x2000, square photo: availableWidth = 1780, availableHeight = 1840 -> width binds at 1780.
    const board = computePuzzleBoardSize(2000, 2000, 100, 100);
    expect(board.width).toBeCloseTo(1780);
    expect(board.height).toBeCloseTo(1780);
  });

  it('defaults to zero insets when none are passed, matching a device with no notch/nav-bar', () => {
    expect(computePuzzleBoardSize(1000, 500, 100, 100)).toEqual(
      computePuzzleBoardSize(1000, 500, 100, 100, { top: 0, right: 0, bottom: 0, left: 0 })
    );
  });

  it('shrinks the board to make room for real device insets (notch/status bar/gesture-nav bar)', () => {
    // maxByHeight = 500 - 160 - (20 top + 30 bottom) = 290; maxByWidth = 1000 - 220 - (10 left + 10 right) = 760.
    // Square photo -> width/ratio(1)=760 > 290, so height binds: height = 290, width = 290.
    const board = computePuzzleBoardSize(1000, 500, 100, 100, { top: 20, right: 10, bottom: 30, left: 10 });
    expect(board.width).toBeCloseTo(290);
    expect(board.height).toBeCloseTo(290);
  });

  it('falls back to a square aspect ratio when the image size is not yet known (0x0)', () => {
    const board = computePuzzleBoardSize(1000, 500, 0, 0);
    expect(board.width).toBeCloseTo(board.height);
  });
});

describe('computeGridDimensions', () => {
  it.each([
    [4, false, 2, 2],
    [6, false, 2, 3],
    [9, false, 3, 3],
    [12, false, 3, 4],
  ])('for %i pieces, landscape photo, returns %i rows and %i cols', (pieceCount, isPortrait, rows, cols) => {
    expect(computeGridDimensions(pieceCount as 4 | 6 | 9 | 12, isPortrait as boolean)).toEqual({ rows, cols });
  });

  it.each([
    [4, true, 2, 2],
    [6, true, 3, 2],
    [9, true, 3, 3],
    [12, true, 4, 3],
  ])('for %i pieces, portrait photo, returns %i rows and %i cols (transposed shape)', (pieceCount, isPortrait, rows, cols) => {
    expect(computeGridDimensions(pieceCount as 4 | 6 | 9 | 12, isPortrait as boolean)).toEqual({ rows, cols });
  });

  it('keeps the same piece count for a given pieceCount regardless of orientation', () => {
    for (const pieceCount of [4, 6, 9, 12] as const) {
      const landscape = computeGridDimensions(pieceCount, false);
      const portrait = computeGridDimensions(pieceCount, true);
      expect(landscape.rows * landscape.cols).toBe(pieceCount);
      expect(portrait.rows * portrait.cols).toBe(pieceCount);
    }
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

  it('divides a non-square (portrait) image into rects matching its real proportions', () => {
    // A 150x400 portrait image cut 3 rows x 2 cols: each piece is 75 wide x 133.33 tall,
    // matching the source photo's real tall shape instead of being forced square.
    const rects = computePieceRects(150, 400, 3, 2);
    expect(rects).toHaveLength(6);
    expect(rects.every((r) => r.width === 75)).toBe(true);
    expect(rects.every((r) => Math.abs(r.height - 400 / 3) < 1e-9)).toBe(true);
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
