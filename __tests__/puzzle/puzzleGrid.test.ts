import {
  computeGridDimensions,
  computePieceRects,
  shufflePieceOrder,
  computePuzzleBoardSize,
  groupPiecesIntoRows,
} from '../../src/puzzle/puzzleGrid';

// computePuzzleBoardSize reserves the same fixed chrome (mirrored here, not imported, so
// these tests catch a regression in either file): the preview column takes a 20% share of
// the window's WIDTH (an explicit fraction, not a fixed pixel guess - see
// PUZZLE_PREVIEW_WIDTH_FRACTION), then a shared chromeMargin=70 is subtracted from BOTH axes
// (the screen's own ScrollView padding + the board frame's own border/padding chrome - real
// space that isn't available for the board's pixels, in either dimension), floor=200 (there
// is deliberately no ceiling any more - the board should use as much of the available
// landscape space as the real screen allows, not clamp down to a small fixed square
// regardless of screen size). It then fits a WIDTH x HEIGHT box that preserves the real
// photo's aspect ratio into whatever space is left.
describe('computePuzzleBoardSize', () => {
  it('fills the available width for a landscape photo on a wide landscape screen', () => {
    // window 800x360, insets zero: availableWidth = 800*0.8-70 = 570, availableHeight = 360-70 = 290.
    // photo is 4:3 landscape (aspectRatio = 4/3). width/ratio = 570/(4/3) = 427.5 > 290 (availableHeight),
    // so height is the binding constraint: height = 290, width = 290 * 4/3 = 386.67.
    const board = computePuzzleBoardSize(800, 360, 400, 300);
    expect(board.height).toBeCloseTo(290);
    expect(board.width).toBeCloseTo(386.667, 2);
  });

  it('preserves a portrait photo real aspect ratio instead of forcing a square', () => {
    // window 800x360, insets zero: availableWidth = 570, availableHeight = 290.
    // photo is 3:4 portrait (aspectRatio = 3/4 = 0.75). width/ratio = 570/0.75 = 760 > 290,
    // so height is the binding constraint: height = 290, width = 290 * 0.75 = 217.5.
    // width (217.5) is already above the 200 floor, so no floor-scaling kicks in.
    const board = computePuzzleBoardSize(800, 360, 300, 400);
    expect(board.width).toBeCloseTo(217.5);
    expect(board.height).toBeCloseTo(290);
    // Sanity: the board itself is taller than it is wide, matching the portrait photo.
    expect(board.height).toBeGreaterThan(board.width);
  });

  it('is bound by width when width is the tighter constraint', () => {
    // window 500x1000, square photo: availableWidth = 500*0.8-70 = 330, availableHeight = 1000-70 = 930.
    // width/ratio(1) = 330 <= 930, so width is binding: width = 330, height = 330.
    const board = computePuzzleBoardSize(500, 1000, 100, 100);
    expect(board.width).toBeCloseTo(330);
    expect(board.height).toBeCloseTo(330);
  });

  it('floors to the minimum size when the window is very small', () => {
    // availableWidth = max(200*0.8-70, 200) = 200 (floored, raw value 90 < floor);
    // availableHeight = max(200-70, 200) = 200 (floored, raw value 130 < floor).
    // Square photo -> both stay at the 200 floor.
    const board = computePuzzleBoardSize(200, 200, 100, 100);
    expect(board.width).toBeCloseTo(200);
    expect(board.height).toBeCloseTo(200);
  });

  it('uses far more of a very large window than the old fixed 420 ceiling allowed', () => {
    // window 2000x2000, square photo: availableWidth = 2000*0.8-70 = 1530, availableHeight = 2000-70 = 1930
    // -> width binds at 1530.
    const board = computePuzzleBoardSize(2000, 2000, 100, 100);
    expect(board.width).toBeCloseTo(1530);
    expect(board.height).toBeCloseTo(1530);
  });

  it('defaults to zero insets when none are passed, matching a device with no notch/nav-bar', () => {
    expect(computePuzzleBoardSize(1000, 500, 100, 100)).toEqual(
      computePuzzleBoardSize(1000, 500, 100, 100, { top: 0, right: 0, bottom: 0, left: 0 })
    );
  });

  it('shrinks the board to make room for real device insets (notch/status bar/gesture-nav bar)', () => {
    // maxByHeight = 500 - 70 - (20 top + 30 bottom) = 380; maxByWidth = 1000*0.8 - 70 - (10 left + 10 right) = 710.
    // Square photo -> width/ratio(1)=710 > 380, so height binds: height = 380, width = 380.
    const board = computePuzzleBoardSize(1000, 500, 100, 100, { top: 20, right: 10, bottom: 30, left: 10 });
    expect(board.width).toBeCloseTo(380);
    expect(board.height).toBeCloseTo(380);
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

  // A square (1:1 aspect ratio) photo is treated as `isPortrait: false` by
  // PuzzleScreen (its check is `imageWidth < imageHeight`, which is false when
  // they're equal) - confirm this doesn't error and gives the ordinary
  // landscape shape for every piece count.
  it('handles a square (isPortrait: false) photo sensibly for every piece count', () => {
    expect(computeGridDimensions(4, false)).toEqual({ rows: 2, cols: 2 });
    expect(computeGridDimensions(6, false)).toEqual({ rows: 2, cols: 3 });
    expect(computeGridDimensions(9, false)).toEqual({ rows: 3, cols: 3 });
    expect(computeGridDimensions(12, false)).toEqual({ rows: 3, cols: 4 });
  });
});

// groupPiecesIntoRows is the pure logic PuzzleScreen now uses to render the
// board as explicit per-row <View> containers instead of a single
// `flexWrap: 'wrap'` container, specifically so the column count is a
// deterministic property of the array structure rather than something Yoga's
// float-precision line-breaking decides at layout time. Every case below is
// hand-computed (not derived from the function under test).
describe('groupPiecesIntoRows', () => {
  it('groups a 4-piece (2x2) order into 2 rows of exactly 2', () => {
    expect(groupPiecesIntoRows([0, 1, 2, 3], 2)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('groups a 6-piece landscape (2 rows x 3 cols) order into 2 rows of exactly 3', () => {
    // This is one of the exact configurations at risk of the Yoga float-precision
    // wrap bug (cols=3): a flexWrap container could wrap after 2 pieces instead
    // of 3 on a fractional-width device. Explicit grouping makes this impossible.
    expect(groupPiecesIntoRows([0, 1, 2, 3, 4, 5], 3)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });

  it('groups a 6-piece portrait (3 rows x 2 cols) order into 3 rows of exactly 2', () => {
    expect(groupPiecesIntoRows([0, 1, 2, 3, 4, 5], 2)).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it('groups a 9-piece (3x3, both orientations) order into 3 rows of exactly 3', () => {
    // 9-piece is 3x3 in BOTH orientations, so both are at risk of the cols=3 bug.
    expect(groupPiecesIntoRows([0, 1, 2, 3, 4, 5, 6, 7, 8], 3)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
    ]);
  });

  it('groups a 12-piece landscape (3 rows x 4 cols) order into 3 rows of exactly 4', () => {
    expect(groupPiecesIntoRows([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 4)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
    ]);
  });

  it('groups a 12-piece portrait (4 rows x 3 cols) order into 4 rows of exactly 3', () => {
    // Also a cols=3 configuration - confirmed at risk per the bug report.
    expect(groupPiecesIntoRows([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 3)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11],
    ]);
  });

  it('groups an arbitrary shuffled order (not just identity) the same structural way', () => {
    const shuffled = [8, 3, 1, 6, 0, 5, 7, 2, 4];
    expect(groupPiecesIntoRows(shuffled, 3)).toEqual([
      [8, 3, 1],
      [6, 0, 5],
      [7, 2, 4],
    ]);
  });

  it('puts the remainder into a shorter final row when the item count is not an exact multiple of `cols`', () => {
    // Not a real user-reachable puzzle shape today (GRID_DIMENSIONS_LANDSCAPE's
    // pieceCount/cols pairs are always exact multiples), but groupPiecesIntoRows
    // is a general-purpose helper and every existing test above happens to use
    // an exact multiple - this pins down the ragged-remainder branch of
    // `items.slice(i, i + cols)` for any future non-exact caller.
    expect(groupPiecesIntoRows([0, 1, 2, 3, 4, 5, 6], 3)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6],
    ]);
  });

  it('returns a single short row (not an empty extra row) when item count is less than `cols`', () => {
    expect(groupPiecesIntoRows([0, 1], 3)).toEqual([[0, 1]]);
  });

  it('never produces a row with more or fewer than `cols` items across all groups but the last', () => {
    for (const [length, cols] of [
      [4, 2],
      [6, 3],
      [6, 2],
      [9, 3],
      [12, 4],
      [12, 3],
    ] as const) {
      const items = Array.from({ length }, (_, i) => i);
      const grouped = groupPiecesIntoRows(items, cols);
      expect(grouped).toHaveLength(length / cols);
      for (const group of grouped) {
        expect(group).toHaveLength(cols);
      }
      // Flattening back must reproduce the original order exactly.
      expect(grouped.flat()).toEqual(items);
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

  // With exactly 2 pieces there are only 2 possible permutations of [0, 1]:
  // the identity [0, 1] and the single swap [1, 0]. Since non-identity is
  // guaranteed, the result must ALWAYS be [1, 0] - regardless of which of
  // Fisher-Yates's two code paths produces it. Hand-traced both branches of
  // `shuffle([0, 1], rng)` (the only loop iteration is i=1, j = floor(rng() * 2)):
  //   - rng() >= 0.5 -> j = 1 -> result[1] swaps with itself -> stays [0, 1]
  //     (identity) -> shufflePieceOrder's own fallback then swaps indices 0
  //     and 1 -> [1, 0].
  //   - rng() < 0.5 -> j = 0 -> result[1] swaps with result[0] -> becomes
  //     [1, 0] directly, already non-identity, so the fallback does not fire.
  // Both branches converge on the same [1, 0] output.
  it('always returns [1, 0] for exactly 2 pieces, regardless of which RNG branch fires', () => {
    // rng() >= 0.5: Fisher-Yates itself produces identity, so the
    // guaranteed-non-identity fallback swap must fire to produce [1, 0].
    expect(shufflePieceOrder(2, () => 0.99999)).toEqual([1, 0]);
    expect(shufflePieceOrder(2, () => 0.5)).toEqual([1, 0]);
    // rng() < 0.5: Fisher-Yates itself already produces the non-identity
    // swap directly, without the fallback needing to fire.
    expect(shufflePieceOrder(2, () => 0.0)).toEqual([1, 0]);
    expect(shufflePieceOrder(2, () => 0.25)).toEqual([1, 0]);
  });
});
