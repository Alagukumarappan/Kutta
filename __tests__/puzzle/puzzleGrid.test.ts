import { computeGridDimensions, computePieceRects, shufflePieceOrder } from '../../src/puzzle/puzzleGrid';

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
    // With a fixed RNG that would otherwise produce identity, the function must reshuffle.
    const identityProducingRng = () => 0; // Fisher-Yates with rng()=0 always swaps i with 0
    for (let pieceCount of [4, 6, 9, 12]) {
      const order = shufflePieceOrder(pieceCount, identityProducingRng);
      expect(order).not.toEqual(Array.from({ length: pieceCount }, (_, i) => i));
    }
  });
});
