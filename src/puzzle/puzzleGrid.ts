import { shuffle } from '../quiz/shuffle';

const GRID_DIMENSIONS: Record<4 | 6 | 9 | 12, { rows: number; cols: number }> = {
  4: { rows: 2, cols: 2 },
  6: { rows: 2, cols: 3 },
  9: { rows: 3, cols: 3 },
  12: { rows: 3, cols: 4 },
};

export function computeGridDimensions(pieceCount: 4 | 6 | 9 | 12): { rows: number; cols: number } {
  return GRID_DIMENSIONS[pieceCount];
}

export interface PieceRect {
  pieceIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computePieceRects(imageWidth: number, imageHeight: number, rows: number, cols: number): PieceRect[] {
  const pieceWidth = imageWidth / cols;
  const pieceHeight = imageHeight / rows;
  const rects: PieceRect[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      rects.push({
        pieceIndex: row * cols + col,
        x: col * pieceWidth,
        y: row * pieceHeight,
        width: pieceWidth,
        height: pieceHeight,
      });
    }
  }

  return rects;
}

function isIdentity(order: number[]): boolean {
  return order.every((value, index) => value === index);
}

export function shufflePieceOrder(pieceCount: number, rng: () => number = Math.random): number[] {
  const identity = Array.from({ length: pieceCount }, (_, i) => i);
  if (pieceCount <= 1) return identity;

  let order = shuffle(identity, rng);
  let attempts = 0;
  // Guard against a pathological RNG that always produces the identity order.
  while (isIdentity(order) && attempts < 10) {
    order = shuffle(identity, () => (rng() + 0.5) % 1);
    attempts++;
  }
  return order;
}
