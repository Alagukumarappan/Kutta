import { shuffle } from '../quiz/shuffle';
import { computeResponsiveSquareSize, EdgeInsets, ZERO_INSETS } from '../theme/tokens';

// Reserves room for the preview thumbnail, labels and margins above/around the
// board so the puzzle board itself sizes to fit a short-but-wide landscape
// window instead of overflowing it.
const PUZZLE_RESERVED_HEIGHT = 160;
const PUZZLE_RESERVED_WIDTH = 220;
const PUZZLE_MIN_SIZE = 200;
const PUZZLE_MAX_SIZE = 420;

// `insets` defaults to zero so existing callers/tests that only care about
// the window-size math (no device in the loop) keep working unchanged; real
// screens pass the device's actual useSafeAreaInsets() so a notch, status
// bar, or gesture-nav bar never eats into the board itself.
export function computePuzzleBoardSize(
  windowWidth: number,
  windowHeight: number,
  insets: EdgeInsets = ZERO_INSETS
): number {
  return computeResponsiveSquareSize(
    windowWidth,
    windowHeight,
    PUZZLE_RESERVED_HEIGHT + insets.top + insets.bottom,
    PUZZLE_RESERVED_WIDTH + insets.left + insets.right,
    PUZZLE_MIN_SIZE,
    PUZZLE_MAX_SIZE
  );
}

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
  // Guarantee non-identity: if shuffle produced identity (even with adversarial RNG),
  // swap first two elements to ensure non-identity.
  if (isIdentity(order)) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}
