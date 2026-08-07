import React from 'react';
import { Image, AccessibilityInfo } from 'react-native';
import { render, fireEvent, within, waitFor, act } from '@testing-library/react-native';
import { PuzzleScreen } from '../../src/puzzle/PuzzleScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { computePuzzleBoardSize } from '../../src/puzzle/puzzleGrid';
import * as activityLogModule from '../../src/storage/activityLog';

jest.mock('../../src/storage/activityLog');

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

async function renderPuzzleScreen(imageUri: string = IMAGE_URI, pieceCount: 4 | 6 | 9 | 12 = 4) {
  return render(
    <LanguageProvider initialLanguage="en">
      <PuzzleScreen imageUri={imageUri} pieceCount={pieceCount} />
    </LanguageProvider>
  );
}

// pieceCount is now a required prop (chosen once in PuzzleGallery's header
// dropdown, see puzzleDifficultyStore.ts) rather than picked via an
// in-screen picker every time — so "starting" a puzzle is just waiting for
// the initial shuffle + real photo size to resolve.
async function startFourPiecePuzzle(utils: Awaited<ReturnType<typeof renderPuzzleScreen>>) {
  await waitFor(() => expect(utils.queryByTestId('puzzle-loading')).toBeNull());
  return utils;
}

describe('PuzzleScreen', () => {
  let getSizeSpy: jest.SpyInstance;

  beforeEach(() => {
    getSizeSpy = jest.spyOn(Image, 'getSize').mockImplementation((_uri: string, success: (w: number, h: number) => void) => {
      success(SQUARE_IMAGE_SIZE.width, SQUARE_IMAGE_SIZE.height);
    });
    (activityLogModule.recordPuzzleCompleted as jest.Mock).mockClear().mockResolvedValue({
      quizzesCompleted: 0,
      puzzlesCompleted: 1,
    });
  });

  afterEach(() => {
    getSizeSpy.mockRestore();
  });

  it('starts the puzzle immediately with the pieceCount passed in as a prop, no in-screen picker', async () => {
    const utils = await renderPuzzleScreen(IMAGE_URI, 4);
    const { findByTestId, queryByTestId } = utils;

    await waitFor(() => expect(utils.queryByTestId('puzzle-loading')).toBeNull());

    expect(queryByTestId('puzzle-piece-count-picker')).toBeNull();
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

  // Regression tests for the batched-tap class of bug already fixed in
  // Tic-Tac-Toe (iteration 3) and Coloring (iteration 4): every tap handler
  // here read `selectedSlot`/`order` out of the render its closure was
  // created in, but React Native hands JS a BATCH of queued touch events at
  // once. A 2-8 year old tapping two pieces in quick succession therefore
  // ran both handlers against the same pre-update snapshot. Both taps are
  // reproduced inside a single act(), which is exactly that batch.
  describe('two taps delivered in a single batch (a child drumming on the board)', () => {
    // React logs "overlapping act() calls" for the deliberately-nested act
    // below — that nesting IS the batch being reproduced, so the warning is
    // expected noise here rather than a signal.
    function silenceOverlappingActWarning() {
      return jest.spyOn(console, 'error').mockImplementation(() => {});
    }

    it('a batched pick-then-drop still performs the swap the child asked for', async () => {
      const spy = silenceOverlappingActWarning();
      const utils = await renderPuzzleScreen();
      await startFourPiecePuzzle(utils);
      const { getByTestId } = utils;

      const before = readOrder(getByTestId);
      const slot0 = getByTestId('puzzle-slot-0');
      const slot1 = getByTestId('puzzle-slot-1');
      await act(async () => {
        fireEvent.press(slot0);
        fireEvent.press(slot1);
      });

      const after = readOrder(getByTestId);
      expect(after[0]).toBe(before[1]);
      expect(after[1]).toBe(before[0]);
      expect(after[2]).toBe(before[2]);
      expect(after[3]).toBe(before[3]);
      // The pair completed, so nothing is left picked up.
      expect(getByTestId('puzzle-slot-0').props.accessibilityState).toEqual({ selected: false });
      spy.mockRestore();
    });

    it('a batched second swap does not silently undo the first one', async () => {
      const spy = silenceOverlappingActWarning();
      const utils = await renderPuzzleScreen();
      await startFourPiecePuzzle(utils);
      const { getByTestId } = utils;

      const before = readOrder(getByTestId);

      // Slot 0 is picked up first, on its own render. Then two further taps
      // arrive in one batch: the first completes the 0<->1 swap, the second
      // starts a brand new pick-up on slot 2.
      await fireEvent.press(getByTestId('puzzle-slot-0'));
      const slot1 = getByTestId('puzzle-slot-1');
      const slot2 = getByTestId('puzzle-slot-2');
      await act(async () => {
        fireEvent.press(slot1);
        fireEvent.press(slot2);
      });

      const after = readOrder(getByTestId);
      // The 0<->1 swap must have survived...
      expect(after[0]).toBe(before[1]);
      expect(after[1]).toBe(before[0]);
      expect(after[2]).toBe(before[2]);
      expect(after[3]).toBe(before[3]);
      // ...and the trailing tap is a fresh pick-up, not a second swap
      // against the already-consumed selection.
      expect(getByTestId('puzzle-slot-2').props.accessibilityState).toEqual({ selected: true });
      spy.mockRestore();
    });
  });

  // Selection-sorts the currently rendered order back to identity (0,1,2,3)
  // by tapping pairs of slots — exercises the real swap logic and the real
  // completion check, with no dependency on the shuffle's random outcome.
  async function solveFourPiecePuzzle(utils: Awaited<ReturnType<typeof renderPuzzleScreen>>) {
    const { getByTestId } = utils;
    for (let target = 0; target < 4; target++) {
      const order = readOrder(getByTestId);
      const currentIndex = order.indexOf(target);
      if (currentIndex !== target) {
        await fireEvent.press(getByTestId(`puzzle-slot-${target}`));
        await fireEvent.press(getByTestId(`puzzle-slot-${currentIndex}`));
      }
    }
  }

  it('shows a completion Modal overlay (message + Retry + Next) once the pieces are restored to the correct order', async () => {
    const utils = await renderPuzzleScreen();
    await startFourPiecePuzzle(utils);
    const { getByTestId, queryByTestId, findByTestId, getByText } = utils;

    // Sanity: shufflePieceOrder guarantees a non-identity order for >1 piece, so the
    // puzzle must not already read as complete.
    expect(queryByTestId('puzzle-complete')).toBeNull();
    expect(queryByTestId('puzzle-retry')).toBeNull();
    expect(queryByTestId('puzzle-next')).toBeNull();

    await solveFourPiecePuzzle(utils);

    expect(readOrder(getByTestId)).toEqual([0, 1, 2, 3]);
    expect(getByTestId('puzzle-complete')).toBeTruthy();
    expect(getByText('Great job!')).toBeTruthy();
    expect(await findByTestId('puzzle-retry')).toBeTruthy();
    expect(await findByTestId('puzzle-next')).toBeTruthy();
  });

  // Regression tests for the quality-evolution gamification addition: a
  // solved puzzle should be recorded exactly once per solve, not once per
  // re-render while the completion overlay is showing, and a genuinely
  // fresh solve after Retry must record again.
  it('records exactly one completed puzzle when it is first solved', async () => {
    const utils = await renderPuzzleScreen();
    await startFourPiecePuzzle(utils);

    await solveFourPiecePuzzle(utils);
    expect(utils.getByTestId('puzzle-complete')).toBeTruthy();

    expect(activityLogModule.recordPuzzleCompleted).toHaveBeenCalledTimes(1);
  });

  it('records a second completed puzzle after Retry is solved again', async () => {
    const utils = await renderPuzzleScreen();
    await startFourPiecePuzzle(utils);
    const { getByTestId } = utils;

    await solveFourPiecePuzzle(utils);
    expect(activityLogModule.recordPuzzleCompleted).toHaveBeenCalledTimes(1);

    await fireEvent.press(getByTestId('puzzle-retry'));
    await solveFourPiecePuzzle(utils);
    expect(readOrder(getByTestId)).toEqual([0, 1, 2, 3]);

    expect(activityLogModule.recordPuzzleCompleted).toHaveBeenCalledTimes(2);
  });

  describe('completion Modal Retry/Next', () => {
    it('Retry re-shuffles the current puzzle (a genuinely fresh, non-identity order) and closes the modal', async () => {
      const utils = await renderPuzzleScreen();
      await startFourPiecePuzzle(utils);
      const { getByTestId, queryByTestId } = utils;

      await solveFourPiecePuzzle(utils);
      expect(readOrder(getByTestId)).toEqual([0, 1, 2, 3]);
      expect(getByTestId('puzzle-complete')).toBeTruthy();

      await fireEvent.press(getByTestId('puzzle-retry'));

      // shufflePieceOrder guarantees a non-identity permutation for >1 piece,
      // so a genuine fresh reshuffle can never leave the board still solved —
      // this is the same "prove it's really fresh, not just re-rendered"
      // technique the quiz's Play Again test uses, applied here via the
      // guaranteed-non-identity property instead of a controlled RNG.
      expect(readOrder(getByTestId)).not.toEqual([0, 1, 2, 3]);
      expect(queryByTestId('puzzle-complete')).toBeNull();
      expect(queryByTestId('puzzle-retry')).toBeNull();
    });

    it('guards Retry against a rapid double-press, only reshuffling once', async () => {
      const utils = await renderPuzzleScreen();
      await startFourPiecePuzzle(utils);
      const { getByTestId } = utils;

      await solveFourPiecePuzzle(utils);

      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const retryButton = getByTestId('puzzle-retry');

      // Press the SAME captured element twice without re-querying — the
      // "stale double-tap" shape this codebase's other double-fire guards
      // (e.g. QuizScreen's Play Again) are tested with. shufflePieceOrder(4)
      // consumes exactly 3 Math.random() calls per shuffle (Fisher-Yates over
      // 4 items) — a second, unguarded shuffle would consume 3 more.
      await fireEvent.press(retryButton);
      await fireEvent.press(retryButton);

      expect(randomSpy.mock.calls.length).toBe(3);
      randomSpy.mockRestore();
    });

    it('Next calls the provided onNext callback', async () => {
      const onNext = jest.fn();
      const utils = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleScreen imageUri={IMAGE_URI} pieceCount={4} onNext={onNext} />
        </LanguageProvider>
      );
      await startFourPiecePuzzle(utils);
      await solveFourPiecePuzzle(utils);

      await fireEvent.press(utils.getByTestId('puzzle-next'));

      expect(onNext).toHaveBeenCalledTimes(1);
    });

    // Regression test for iteration 8: the shared CelebrationOverlay's Modal
    // had no onRequestClose, so Android's back press was captured by the
    // modal's own window and silently dropped while the completion panel was
    // up — on a headerShown:false screen where back is the child's only way
    // out. Back now goes where "Next" goes (back to the gallery), never to
    // Retry, which would reshuffle the puzzle the child just solved.
    it('routes the Android back button on the completion panel to onNext', async () => {
      const onNext = jest.fn();
      const utils = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleScreen imageUri={IMAGE_URI} pieceCount={4} onNext={onNext} />
        </LanguageProvider>
      );
      await startFourPiecePuzzle(utils);
      await solveFourPiecePuzzle(utils);

      const overlay = utils.getByTestId('puzzle-complete');
      expect(overlay.props.onRequestClose).toBeDefined();
      await act(async () => {
        overlay.props.onRequestClose();
      });

      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('guards Next against a rapid double-press, only calling onNext once', async () => {
      const onNext = jest.fn();
      const utils = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleScreen imageUri={IMAGE_URI} pieceCount={4} onNext={onNext} />
        </LanguageProvider>
      );
      await startFourPiecePuzzle(utils);
      await solveFourPiecePuzzle(utils);

      const nextButton = utils.getByTestId('puzzle-next');
      await fireEvent.press(nextButton);
      await fireEvent.press(nextButton);

      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('does not crash when Next is pressed without an onNext prop (defensive no-op default)', async () => {
      const utils = await renderPuzzleScreen();
      await startFourPiecePuzzle(utils);
      await solveFourPiecePuzzle(utils);

      expect(() => fireEvent.press(utils.getByTestId('puzzle-next'))).not.toThrow();
    });
  });

  // Redesign requirement: the board should read as a dimensional "game
  // board" with strong piece separation — checked statically off each
  // slot's own declared border width (same static-style-inspection idiom as
  // the row-grouping tests above), rather than any visual snapshot.
  it('draws a strong border around each piece slot for clear piece separation', async () => {
    const utils = await renderPuzzleScreen();
    await startFourPiecePuzzle(utils);

    const slot0 = utils.getByTestId('puzzle-slot-0');
    const pieceView = slot0.children[0] as any;
    const flatStyle = [pieceView.props.style].flat(Infinity).reduce((acc, s) => ({ ...acc, ...s }), {});
    expect(flatStyle.borderWidth).toBeGreaterThanOrEqual(4);
  });

  // Regression test for the premium-polish accessibility pass: each slot is
  // a pure cropped-image fragment with no text of its own, so it previously
  // had no accessibilityRole/Label at all — a screen-reader dead end for
  // the puzzle's entire core interaction.
  describe('piece slot accessibility', () => {
    it('gives every slot an accessible role and a distinct positional label', async () => {
      const utils = await renderPuzzleScreen();
      await startFourPiecePuzzle(utils);

      for (let i = 0; i < 4; i++) {
        const slot = utils.getByTestId(`puzzle-slot-${i}`);
        expect(slot.props.accessibilityRole).toBe('button');
        expect(slot.props.accessibilityLabel).toBe(`Puzzle piece, position ${i + 1}`);
      }
    });

    it('marks the currently-picked-up slot as selected via accessibilityState, and only that one', async () => {
      const utils = await renderPuzzleScreen();
      await startFourPiecePuzzle(utils);
      const { getByTestId } = utils;

      await fireEvent.press(getByTestId('puzzle-slot-0'));

      expect(getByTestId('puzzle-slot-0').props.accessibilityState).toEqual({ selected: true });
      expect(getByTestId('puzzle-slot-1').props.accessibilityState).toEqual({ selected: false });
    });
  });

  describe('piece-snap celebratory pop', () => {
    // Same "spy on Animated.spring's call args instead of the settled style"
    // technique established in ColoringScreen.test.tsx (jest's Animated mock
    // never advances a spring past its starting value without an explicit
    // fake-timer tick, so reading the flattened scale right after a press
    // would still show the pre-press resting value) — this instead confirms
    // the real placement-detection logic (order[slotIndex] === slotIndex,
    // read via the existing `order`/`readOrder` helpers, completely untouched
    // here) really does request a pop spring toward 1.15 for a slot the
    // instant it becomes correct, driven by a single awaited fireEvent.press
    // pair rather than any pressIn/pressOut or rapid rerender sequence.
    it('requests a pop spring (scale 1.15) for a slot the moment its piece is swapped into the correct position', async () => {
      const utils = await renderPuzzleScreen();
      await startFourPiecePuzzle(utils);
      const { getByTestId } = utils;

      const { Animated: RNAnimated } = require('react-native');
      const springSpy = jest.spyOn(RNAnimated, 'spring');

      // Pick any slot that isn't already correct (shufflePieceOrder guarantees
      // at least one exists for a non-identity permutation) and swap in its
      // correct piece — mirrors the selection-sort step used by the
      // completion test above, applied to just one target.
      const before = readOrder(getByTestId);
      const target = before.findIndex((pieceIndex, slotIndex) => pieceIndex !== slotIndex);
      expect(target).toBeGreaterThanOrEqual(0);
      const currentIndex = before.indexOf(target);

      await fireEvent.press(getByTestId(`puzzle-slot-${target}`));
      await fireEvent.press(getByTestId(`puzzle-slot-${currentIndex}`));

      // Sanity: the swap really did place the target piece correctly.
      expect(readOrder(getByTestId)[target]).toBe(target);

      const toValues = springSpy.mock.calls.map(([, config]) => (config as { toValue: number }).toValue);
      expect(toValues).toContain(1.15);

      springSpy.mockRestore();
    });

    it('does not request any pop spring on initial mount, even though the shuffle may coincidentally place a piece correctly', async () => {
      const { Animated: RNAnimated } = require('react-native');
      const springSpy = jest.spyOn(RNAnimated, 'spring');

      const utils = await renderPuzzleScreen();
      await startFourPiecePuzzle(utils);

      const toValues = springSpy.mock.calls.map(([, config]) => (config as { toValue: number }).toValue);
      expect(toValues).not.toContain(1.15);

      springSpy.mockRestore();
    });

    // Regression test for the premium-polish accessibility pass: this pop
    // always played the overshoot 1 -> 1.15 -> 1 sequence, ignoring the OS
    // reduce-motion setting — the last remaining un-audited spot in the
    // app's reduce-motion sweep (see ColoringScreen's swatch/toolbar pops,
    // Quiz's progress dots, useTiltPress, CelebrationOverlay, and
    // EmptyStatePanel's bounce, all already fixed the same way). Unlike the
    // spring-spy tests above, `setValue` takes effect synchronously under
    // Jest, so this reads the settled flattened style directly.
    it('skips the pop spring when the OS reduce-motion setting is on, landing directly on the resting scale', async () => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
      const { StyleSheet } = require('react-native');

      const utils = await renderPuzzleScreen();
      await startFourPiecePuzzle(utils);
      const { getByTestId } = utils;

      const before = readOrder(getByTestId);
      const target = before.findIndex((pieceIndex, slotIndex) => pieceIndex !== slotIndex);
      expect(target).toBeGreaterThanOrEqual(0);
      const currentIndex = before.indexOf(target);

      await fireEvent.press(getByTestId(`puzzle-slot-${target}`));
      await fireEvent.press(getByTestId(`puzzle-slot-${currentIndex}`));

      // Sanity: the swap really did place the target piece correctly.
      expect(readOrder(getByTestId)[target]).toBe(target);

      const flattened = StyleSheet.flatten(getByTestId(`puzzle-piece-scale-${target}`).props.style);
      const scale = flattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;
      expect(scale).toBeCloseTo(1);

      // `jest.restoreAllMocks()` alone does NOT undo this specific mock —
      // `AccessibilityInfo.isReduceMotionEnabled` is already an auto-mocked
      // jest.fn() (a native module method), so `jest.spyOn` above just
      // returns that same mock rather than wrapping a real implementation.
      // Explicitly resetting the resolved value is what actually fixes it
      // (see ColoringScreen's iteration 30 notes for the full mechanism).
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
      jest.restoreAllMocks();
    });
  });

  it('shows a loading indicator while the real photo size is still loading, then renders the board', async () => {
    let resolveGetSize!: (w: number, h: number) => void;
    getSizeSpy.mockRestore();
    getSizeSpy = jest.spyOn(Image, 'getSize').mockImplementation((_uri: string, success: (w: number, h: number) => void) => {
      resolveGetSize = success;
    });

    const utils = await renderPuzzleScreen(IMAGE_URI, 4);

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

    const utils = await renderPuzzleScreen(IMAGE_URI, 4);

    await waitFor(() => expect(utils.queryByTestId('puzzle-loading')).toBeNull());
    expect(await utils.findByTestId('puzzle-slot-0')).toBeTruthy();
  });

  // Image.getSize can report success with degenerate dimensions for a
  // truncated/corrupt image. Before this guard, `imageSize?.width ?? 1` let
  // those straight through (?? only replaces null/undefined, never 0), and
  // the preview's `aspectRatio: imageWidth / imageHeight` became NaN or
  // Infinity — not a value React Native's layout engine can use.
  it.each([
    [0, 0, 'a 0x0 corrupt photo'],
    [400, 0, 'a photo reported with zero height'],
    [Number.NaN, Number.NaN, 'a photo reported with non-finite dimensions'],
  ])('falls back to a square layout for %i x %i (%s)', async (photoWidth, photoHeight, _label) => {
    getSizeSpy.mockRestore();
    getSizeSpy = jest
      .spyOn(Image, 'getSize')
      .mockImplementation((_uri: string, success: (w: number, h: number) => void) => {
        success(photoWidth, photoHeight);
      });

    const utils = await renderPuzzleScreen(IMAGE_URI, 4);

    await waitFor(() => expect(utils.queryByTestId('puzzle-loading')).toBeNull());
    expect(await utils.findByTestId('puzzle-slot-0')).toBeTruthy();
    expect(await utils.findByTestId('puzzle-slot-3')).toBeTruthy();

    const { StyleSheet } = require('react-native');
    const previewStyle = StyleSheet.flatten(utils.getByTestId('puzzle-preview').props.style);
    expect(previewStyle.aspectRatio).toBe(1);
  });

  // These tests prove the board's column count is deterministic - i.e. it comes
  // from the explicit groupPiecesIntoRows structure PuzzleScreen now renders
  // (rows of exactly `cols` sibling Pressables each), not from a flexWrap:'wrap'
  // container's line-breaking, which was float-precision-dependent and could
  // wrap one piece early on a fractional container width. For each combination,
  // we pick a photo size/count that produces the given (rows, cols) shape (hand-
  // computed from the same table as puzzleGrid.test.ts's computeGridDimensions
  // tests) and then walk the real rendered tree via each slot's `.parent` to
  // confirm siblings-per-row and total row count exactly, not just slot count.
  function assertRowGrouping(getByTestId: (id: string) => any, rows: number, cols: number) {
    for (let r = 0; r < rows; r++) {
      const parentsInRow = new Set<any>();
      for (let c = 0; c < cols; c++) {
        const slotIndex = r * cols + c;
        const slot = getByTestId(`puzzle-slot-${slotIndex}`);
        parentsInRow.add(slot.parent);
      }
      // Every slot in this row must share the exact same row-container parent...
      expect(parentsInRow.size).toBe(1);
      const rowParent = [...parentsInRow][0];
      // ...and that row-container must hold exactly `cols` Pressable children -
      // no more (would mean a row swallowed the next row's pieces) and no
      // fewer (would mean this row got wrapped early, the exact bug being fixed).
      expect(rowParent.children).toHaveLength(cols);
    }
    // The row belonging to the first slot of the *next* row must differ from
    // the last row's parent, i.e. rows are genuinely separate containers.
    if (rows > 1) {
      const lastSlotOfFirstRow = getByTestId(`puzzle-slot-${cols - 1}`);
      const firstSlotOfSecondRow = getByTestId(`puzzle-slot-${cols}`);
      expect(firstSlotOfSecondRow.parent).not.toBe(lastSlotOfFirstRow.parent);
    }
    // No slot beyond rows*cols should exist.
    expect(() => getByTestId(`puzzle-slot-${rows * cols}`)).toThrow();
  }

  async function renderAndPickCount(
    photoWidth: number,
    photoHeight: number,
    pieceCount: 4 | 6 | 9 | 12
  ) {
    getSizeSpy.mockRestore();
    getSizeSpy = jest
      .spyOn(Image, 'getSize')
      .mockImplementation((_uri: string, success: (w: number, h: number) => void) => {
        success(photoWidth, photoHeight);
      });
    const utils = await renderPuzzleScreen(IMAGE_URI, pieceCount);
    await waitFor(() => expect(utils.queryByTestId('puzzle-loading')).toBeNull());
    return utils;
  }

  describe('row grouping is deterministic, not flexWrap-line-break-dependent', () => {
    it.each([
      // [photoWidth, photoHeight, pieceCount, expectedRows, expectedCols, label]
      [300, 200, 4, 2, 2, '4-piece landscape'],
      [200, 300, 4, 2, 2, '4-piece portrait'],
      [300, 200, 6, 2, 3, '6-piece landscape (3 cols - at risk of the float-wrap bug)'],
      [200, 300, 6, 3, 2, '6-piece portrait'],
      [300, 200, 9, 3, 3, '9-piece landscape (3 cols - at risk)'],
      [200, 300, 9, 3, 3, '9-piece portrait (3 cols - at risk)'],
      [300, 200, 12, 3, 4, '12-piece landscape'],
      [200, 300, 12, 4, 3, '12-piece portrait (3 cols - at risk)'],
    ] as const)(
      '%s photo, %i pieces -> %i rows x %i cols, laid out in explicit row containers',
      async (photoWidth, photoHeight, pieceCount, expectedRows, expectedCols, _label) => {
        const utils = await renderAndPickCount(photoWidth, photoHeight, pieceCount);
        assertRowGrouping(utils.getByTestId, expectedRows, expectedCols);
      }
    );

    it('a square (1:1) photo does not error and produces the ordinary landscape shape', async () => {
      // isPortrait is `imageWidth < imageHeight`, which is false for a square photo,
      // so a square photo should behave exactly like a landscape one (3x3 for 9 pieces).
      const utils = await renderAndPickCount(400, 400, 9);
      assertRowGrouping(utils.getByTestId, 3, 3);
    });
  });

  it('uses a transposed (taller) grid shape for a real portrait photo', async () => {
    getSizeSpy.mockRestore();
    // A clearly portrait photo (taller than wide).
    getSizeSpy = jest.spyOn(Image, 'getSize').mockImplementation((_uri: string, success: (w: number, h: number) => void) => {
      success(300, 600);
    });

    const utils = await renderPuzzleScreen(IMAGE_URI, 6);
    await waitFor(() => expect(utils.queryByTestId('puzzle-loading')).toBeNull());

    // 6 pieces, portrait -> computeGridDimensions(6, true) = {rows: 3, cols: 2} = 6 slots.
    for (let i = 0; i < 6; i++) {
      expect(await utils.findByTestId(`puzzle-slot-${i}`)).toBeTruthy();
    }
    expect(utils.queryByTestId('puzzle-slot-6')).toBeNull();
  });
});
