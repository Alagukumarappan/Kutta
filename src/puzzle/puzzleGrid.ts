import { shuffle } from '../quiz/shuffle';
import { EdgeInsets, ZERO_INSETS } from '../theme/tokens';

// The preview (a plain label + the full, uncropped source photo, sized to
// its own real aspect ratio - see PuzzleScreen.tsx) sits in a column to the
// LEFT of the board, sized as a fixed FRACTION of the window's width so it
// scales with the device instead of a fixed pixel guess. The board then
// gets the remaining width - this is an explicit 20/80 split, not a
// leftover-space calculation, so the board's width share stays predictable
// across screen sizes. Exported so PuzzleScreen renders the preview column
// at the exact same width this function reserves for it.
export const PUZZLE_PREVIEW_WIDTH_FRACTION = 0.2;
// The screen's own outer ScrollView padding (spacing.md on every side) and
// the board's own recessed-tray chrome (boardFrame's border + padding) each
// eat into the space actually available for the board's PIXELS, in BOTH
// dimensions equally (that padding/border is symmetric on every side) - one
// shared margin, applied on top of the preview column's own width share and
// the vertical axis's lack of any other reservation (the preview column
// sits BESIDE the board, not above it, so it doesn't separately consume any
// vertical budget the way it does horizontal budget).
const PUZZLE_CHROME_MARGIN = 70;
// Floor only - there's deliberately no fixed ceiling here. The board's real
// upper bound is however much space is actually available on the device
// (windowWidth/windowHeight minus the reserved chrome), so a wide landscape
// screen gets a wide board instead of being capped down to a small square.
const PUZZLE_MIN_SIZE = 200;

export interface BoardSize {
  width: number;
  height: number;
}

// Fits a board that preserves the source photo's real aspect ratio into
// whatever space is left after reserving the preview column's 20% width
// share, safe-area insets, and a small margin budget for the screen's own
// padding + the board's own border/padding chrome, using as much of that
// space as possible in BOTH dimensions (not just clamping to a small
// square) so a wide landscape screen isn't left with wasted blank space,
// and a portrait photo isn't squashed/stretched into a square.
export function computePuzzleBoardSize(
  windowWidth: number,
  windowHeight: number,
  imageWidth: number,
  imageHeight: number,
  insets: EdgeInsets = ZERO_INSETS
): BoardSize {
  const availableWidth = Math.max(
    windowWidth * (1 - PUZZLE_PREVIEW_WIDTH_FRACTION) - PUZZLE_CHROME_MARGIN - insets.left - insets.right,
    PUZZLE_MIN_SIZE
  );
  const availableHeight = Math.max(
    windowHeight - PUZZLE_CHROME_MARGIN - insets.top - insets.bottom,
    PUZZLE_MIN_SIZE
  );

  // Guard against a not-yet-loaded/invalid image size (0, NaN, negative) by
  // falling back to a square aspect ratio, matching the previous behavior.
  const aspectRatio = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 1;

  let width: number;
  let height: number;
  if (availableWidth / aspectRatio <= availableHeight) {
    // Width is the tighter constraint: use all of it, derive height from the
    // photo's real aspect ratio.
    width = availableWidth;
    height = availableWidth / aspectRatio;
  } else {
    // Height is the tighter constraint.
    height = availableHeight;
    width = availableHeight * aspectRatio;
  }

  // Try to bring the smaller dimension up to the floor, scaling both up
  // proportionally so the aspect ratio (and therefore the crop shape) stays
  // correct. But never scale past the space actually available in EITHER
  // axis to do it - fitting the screen without scrolling matters more than
  // hitting the floor exactly, so for a very letterboxed window + an extreme
  // aspect ratio photo, the board may end up a little under the floor in one
  // dimension rather than overflow and force scrolling.
  const smallest = Math.min(width, height);
  if (smallest < PUZZLE_MIN_SIZE) {
    const desiredScale = PUZZLE_MIN_SIZE / smallest;
    const maxScale = Math.min(availableWidth / width, availableHeight / height);
    const scale = Math.min(desiredScale, maxScale);
    width *= scale;
    height *= scale;
  }

  return { width, height };
}

const GRID_DIMENSIONS_LANDSCAPE: Record<4 | 6 | 9 | 12, { rows: number; cols: number }> = {
  4: { rows: 2, cols: 2 },
  6: { rows: 2, cols: 3 },
  9: { rows: 3, cols: 3 },
  12: { rows: 3, cols: 4 },
};

// For a given piece count, the "landscape" (wide) shape above is the default;
// for a portrait photo we use the transposed (tall) shape instead. This is
// NOT about making each piece's crop match the photo's own aspect ratio (a
// piece is a rectangular crop either way) - it's about keeping individual
// PIECES roughly square rather than long thin slivers: transposing picks a
// grid whose own row/col split is taller for a photo that's actually taller,
// so each cell's width-to-height ratio stays closer to 1:1 instead of being
// stretched the wrong way. Piece COUNTS (4/6/9/12) never change - only the
// rows x cols shape for a given count.
export function computeGridDimensions(
  pieceCount: 4 | 6 | 9 | 12,
  isPortrait: boolean
): { rows: number; cols: number } {
  const landscape = GRID_DIMENSIONS_LANDSCAPE[pieceCount];
  return isPortrait ? { rows: landscape.cols, cols: landscape.rows } : landscape;
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

// Splits a flat, row-major list of items (e.g. the puzzle's `order` array) into
// `rows` arrays of exactly `cols` items each, for explicit row-by-row rendering.
// This exists so the board's column count is a deterministic property of the
// array structure itself, rather than relying on a `flexWrap: 'wrap'` container
// to "naturally" break each row after `cols` items - that approach depends on
// Yoga's line-breaking float arithmetic (`cols * pieceWidth` vs container width)
// landing on the exact right side of a strict `>` comparison, which real device
// window widths (often fractional, e.g. pixels ÷ density) cannot be trusted to
// do reliably. Grouping explicitly means the column count is exactly `cols` no
// matter what the container's floating-point width turns out to be.
export function groupPiecesIntoRows<T>(items: T[], cols: number): T[][] {
  const grouped: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    grouped.push(items.slice(i, i + cols));
  }
  return grouped;
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
