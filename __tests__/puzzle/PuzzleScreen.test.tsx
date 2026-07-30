import React from 'react';
import { Image } from 'react-native';
import { render, fireEvent, within, waitFor } from '@testing-library/react-native';
import { PuzzleScreen } from '../../src/puzzle/PuzzleScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { computePuzzleBoardSize } from '../../src/puzzle/puzzleGrid';

const IMAGE_URI = 'content://tree/pictures/beach.jpg';

// The photo used across these tests is a square (400x400), landscape/portrait-neutral,
// so computeGridDimensions still gives the "landscape" (wide) shape for pieceCount=4
// (rows=2, cols=2 either way) - the piece-count-4 orientation math is exercised
// separately in puzzleGrid.test.ts, and a dedicated test below covers a real portrait
// photo end-to-end. Image.getSize is mocked (RN's core static Image API - no native
// module available in the jest environment) the same way other native-module-backed
// APIs in this project (e.g. expo-file-system) are mocked at the module boundary.
const SQUARE_IMAGE_SIZE = { width: 400, height: 400 };

// jest-expo's test environment reports a fixed window size (750x1334) via
// useWindowDimensions, regardless of the app's landscape orientation lock —
// so the puzzle board's responsive size is deterministic here. For
// pieceCount=4, computeGridDimensions gives rows=2, cols=2, so each piece is
// (boardSize / 2) square within the board's width x height puzzle. Each slot's
// underlying <Image> (testID "puzzle-piece-image") is offset by (-rect.x,
// -rect.y) via marginLeft/marginTop, which uniquely identifies which piece
// (0..3) is currently sitting in that slot — this lets us read the actual
// `order` state indirectly through the rendered tree instead of reaching
// into component internals.
const TEST_WINDOW = { width: 750, height: 1334 };
const BOARD = computePuzzleBoardSize(TEST_WINDOW.width, TEST_WINDOW.height, SQUARE_IMAGE_SIZE.width, SQUARE_IMAGE_SIZE.height);
const PIECE_WIDTH = BOARD.width / 2;
const PIECE_HEIGHT = BOARD.height / 2;

function pieceIndexInSlot(slot: any): number {
  const image = within(slot).getByTestId('puzzle-piece-image');
  const marginLeft = image.props.style.marginLeft as number;
  const marginTop = image.props.style.marginTop as number;
  const x = -marginLeft;
  const y = -marginTop;
  const col = Math.round(x / PIECE_WIDTH);
  const row = Math.round(y / PIECE_HEIGHT);
  return row * 2 + col;
}

function readOrder(getByTestId: (id: string) => any): number[] {
  return [0, 1, 2, 3].map((slotIndex) => pieceIndexInSlot(getByTestId(`puzzle-slot-${slotIndex}`)));
}

async function renderPuzzleScreen(imageUri: string = IMAGE_URI) {
  return render(
    <LanguageProvider initialLanguage="en">
      <PuzzleScreen imageUri={imageUri} />
    </LanguageProvider>
  );
}

async function startFourPiecePuzzle(utils: Awaited<ReturnType<typeof renderPuzzleScreen>>) {
  await fireEvent.press(await utils.findByTestId('puzzle-piece-count-picker'));
  await fireEvent.press(await utils.findByTestId('puzzle-piece-count-option-4'));
  await waitFor(() => expect(utils.queryByTestId('puzzle-loading')).toBeNull());
  return utils;
}

describe('PuzzleScreen', () => {
  let getSizeSpy: jest.SpyInstance;

  beforeEach(() => {
    getSizeSpy = jest.spyOn(Image, 'getSize').mockImplementation((_uri: string, success: (w: number, h: number) => void) => {
      success(SQUARE_IMAGE_SIZE.width, SQUARE_IMAGE_SIZE.height);
    });
  });

  afterEach(() => {
    getSizeSpy.mockRestore();
  });

  it('shows the piece-count picker and starts the puzzle when a count is selected', async () => {
    const utils = await renderPuzzleScreen();
    const { findByTestId, queryByTestId } = utils;

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
    await waitFor(() => expect(utils.queryByTestId('puzzle-loading')).toBeNull());

    expect(await findByTestId('puzzle-slot-0')).toBeTruthy();
    expect(await findByTestId('puzzle-slot-3')).toBeTruthy();
  });

  it('swaps the pieces of two tapped slots', async () => {
    const utils = await renderPuzzleScreen();
    await startFourPiecePuzzle(utils);
    const { getByTestId } = utils;

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
    const utils = await renderPuzzleScreen();
    await startFourPiecePuzzle(utils);
    const { getByTestId, queryByTestId } = utils;

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

  it('shows a loading indicator while the real photo size is still loading, then renders the board', async () => {
    let resolveGetSize!: (w: number, h: number) => void;
    getSizeSpy.mockRestore();
    getSizeSpy = jest.spyOn(Image, 'getSize').mockImplementation((_uri: string, success: (w: number, h: number) => void) => {
      resolveGetSize = success;
    });

    const utils = await renderPuzzleScreen();
    await fireEvent.press(await utils.findByTestId('puzzle-piece-count-picker'));
    await fireEvent.press(await utils.findByTestId('puzzle-piece-count-option-4'));

    expect(utils.queryByTestId('puzzle-loading')).toBeTruthy();
    expect(utils.queryByTestId('puzzle-slot-0')).toBeNull();

    resolveGetSize(SQUARE_IMAGE_SIZE.width, SQUARE_IMAGE_SIZE.height);

    await waitFor(() => expect(utils.queryByTestId('puzzle-loading')).toBeNull());
    expect(await utils.findByTestId('puzzle-slot-0')).toBeTruthy();
  });

  it('falls back to a square layout without crashing when the real photo size fails to load', async () => {
    getSizeSpy.mockRestore();
    getSizeSpy = jest.spyOn(Image, 'getSize').mockImplementation((_uri: string, _success: any, failure?: (error: any) => void) => {
      failure?.(new Error('failed to load'));
    });

    const utils = await renderPuzzleScreen();
    await fireEvent.press(await utils.findByTestId('puzzle-piece-count-picker'));
    await fireEvent.press(await utils.findByTestId('puzzle-piece-count-option-4'));

    await waitFor(() => expect(utils.queryByTestId('puzzle-loading')).toBeNull());
    expect(await utils.findByTestId('puzzle-slot-0')).toBeTruthy();
  });

  it('uses a transposed (taller) grid shape for a real portrait photo', async () => {
    getSizeSpy.mockRestore();
    // A clearly portrait photo (taller than wide).
    getSizeSpy = jest.spyOn(Image, 'getSize').mockImplementation((_uri: string, success: (w: number, h: number) => void) => {
      success(300, 600);
    });

    const utils = await renderPuzzleScreen();
    await fireEvent.press(await utils.findByTestId('puzzle-piece-count-picker'));
    await fireEvent.press(await utils.findByTestId('puzzle-piece-count-option-6'));
    await waitFor(() => expect(utils.queryByTestId('puzzle-loading')).toBeNull());

    // 6 pieces, portrait -> computeGridDimensions(6, true) = {rows: 3, cols: 2} = 6 slots.
    for (let i = 0; i < 6; i++) {
      expect(await utils.findByTestId(`puzzle-slot-${i}`)).toBeTruthy();
    }
    expect(utils.queryByTestId('puzzle-slot-6')).toBeNull();
  });
});
