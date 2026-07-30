import React from 'react';
import { render, fireEvent, within } from '@testing-library/react-native';
import { PuzzleScreen } from '../../src/puzzle/PuzzleScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { computePuzzleBoardSize } from '../../src/puzzle/puzzleGrid';

const IMAGE_URI = 'content://tree/pictures/beach.jpg';

// jest-expo's test environment reports a fixed window size (750x1334) via
// useWindowDimensions, regardless of the app's landscape orientation lock —
// so the puzzle board's responsive size is deterministic here. For
// pieceCount=4, computeGridDimensions gives rows=2, cols=2, so each piece is
// (boardSize / 2) square within the boardSize x boardSize puzzle. Each slot's
// underlying <Image> (testID "puzzle-piece-image") is offset by (-rect.x,
// -rect.y) via marginLeft/marginTop, which uniquely identifies which piece
// (0..3) is currently sitting in that slot — this lets us read the actual
// `order` state indirectly through the rendered tree instead of reaching
// into component internals.
const TEST_WINDOW = { width: 750, height: 1334 };
const BOARD_SIZE = computePuzzleBoardSize(TEST_WINDOW.width, TEST_WINDOW.height);
const PIECE_SIZE = BOARD_SIZE / 2;

function pieceIndexInSlot(slot: any): number {
  const image = within(slot).getByTestId('puzzle-piece-image');
  const marginLeft = image.props.style.marginLeft as number;
  const marginTop = image.props.style.marginTop as number;
  const x = -marginLeft;
  const y = -marginTop;
  const col = Math.round(x / PIECE_SIZE);
  const row = Math.round(y / PIECE_SIZE);
  return row * 2 + col;
}

function readOrder(getByTestId: (id: string) => any): number[] {
  return [0, 1, 2, 3].map((slotIndex) => pieceIndexInSlot(getByTestId(`puzzle-slot-${slotIndex}`)));
}

async function startFourPiecePuzzle() {
  const utils = await render(
    <LanguageProvider initialLanguage="en">
      <PuzzleScreen imageUri={IMAGE_URI} />
    </LanguageProvider>
  );
  await fireEvent.press(await utils.findByTestId('puzzle-piece-count-picker'));
  await fireEvent.press(await utils.findByTestId('puzzle-piece-count-option-4'));
  return utils;
}

describe('PuzzleScreen', () => {
  it('shows the piece-count picker and starts the puzzle when a count is selected', async () => {
    const { findByTestId, queryByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <PuzzleScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    expect(queryByTestId('puzzle-slot-0')).toBeNull();
    const picker = await findByTestId('puzzle-piece-count-picker');
    expect(picker).toBeTruthy();

    await fireEvent.press(picker);
    const option4 = await findByTestId('puzzle-piece-count-option-4');
    const option6 = await findByTestId('puzzle-piece-count-option-6');
    const option9 = await findByTestId('puzzle-piece-count-option-9');
    const option12 = await findByTestId('puzzle-piece-count-option-12');
    expect(option4).toBeTruthy();
    expect(option6).toBeTruthy();
    expect(option9).toBeTruthy();
    expect(option12).toBeTruthy();

    await fireEvent.press(option4);

    expect(await findByTestId('puzzle-slot-0')).toBeTruthy();
    expect(await findByTestId('puzzle-slot-3')).toBeTruthy();
  });

  it('swaps the pieces of two tapped slots', async () => {
    const { getByTestId } = await startFourPiecePuzzle();

    const before = readOrder(getByTestId);
    expect(new Set(before)).toEqual(new Set([0, 1, 2, 3])); // sanity: it's a permutation

    await fireEvent.press(getByTestId('puzzle-slot-0'));
    await fireEvent.press(getByTestId('puzzle-slot-1'));

    const after = readOrder(getByTestId);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[3]).toBe(before[3]);
  });

  it('shows the completion indicator once the pieces are restored to the correct order', async () => {
    const { getByTestId, queryByTestId } = await startFourPiecePuzzle();

    // Sanity: shufflePieceOrder guarantees a non-identity order for >1 piece, so the
    // puzzle must not already read as complete.
    expect(queryByTestId('puzzle-complete')).toBeNull();

    // Selection-sort the current order back to identity (0,1,2,3) by tapping pairs of
    // slots — this exercises the real swap logic and the real completion check, with no
    // dependency on the shuffle's random outcome.
    for (let target = 0; target < 4; target++) {
      const order = readOrder(getByTestId);
      const currentIndex = order.indexOf(target);
      if (currentIndex !== target) {
        await fireEvent.press(getByTestId(`puzzle-slot-${target}`));
        await fireEvent.press(getByTestId(`puzzle-slot-${currentIndex}`));
      }
    }

    expect(readOrder(getByTestId)).toEqual([0, 1, 2, 3]);
    expect(getByTestId('puzzle-complete')).toBeTruthy();
  });
});
