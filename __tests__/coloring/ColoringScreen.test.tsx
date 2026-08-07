import React from 'react';
import { Alert, AccessibilityInfo } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ColoringScreen } from '../../src/coloring/ColoringScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as FileSystem from 'expo-file-system/legacy';

// This screen never renders actual pixels/canvas content in Jest (no native
// Skia engine available), so the Skia module is mocked at the boundary the
// same way expo-file-system is mocked below — just enough surface for
// ColoringScreen's load/decode effect to run to completion, without trying
// to exercise real flood-fill/rendering (that's covered separately by
// __tests__/coloring/floodFill.test.ts's pure-logic tests).
// A real 10x10 all-white RGBA buffer, used by the flood-fill/undo tests
// below so `handleCanvasTap`'s `if (!image || !pixels) return` guard
// doesn't short-circuit before floodFill ever runs. Left `false` by default
// so every pre-existing test (none of which cares about pixel data) keeps
// its original behavior of `readPixels` resolving to `null`.
// `buffer` lets an individual test swap in a non-uniform image (see the
// two-region buffer used by the batched-tap regression test) — left null so
// every other test keeps the plain all-white buffer.
const mockPixelState = { shouldReturnPixels: false, buffer: null as Uint8Array | null };
const WHITE_10X10 = new Uint8Array(10 * 10 * 4).fill(255);

const mockDecodedImage = {
  width: () => 10,
  height: () => 10,
  readPixels: () => {
    if (!mockPixelState.shouldReturnPixels) return null;
    const buffer = mockPixelState.buffer ?? WHITE_10X10;
    return { buffer: buffer.buffer, byteOffset: buffer.byteOffset, byteLength: buffer.byteLength };
  },
};

const mockDecodeState = { shouldSucceed: true };

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: ({ children }: any) => children ?? null,
  Image: () => null,
  Path: () => null,
  Skia: {
    Data: { fromBytes: jest.fn(() => ({})) },
    Image: {
      MakeImageFromEncoded: jest.fn(() => (mockDecodeState.shouldSucceed ? mockDecodedImage : null)),
      MakeImage: jest.fn(() => mockDecodedImage),
    },
    Path: { Make: jest.fn(() => ({ moveTo: jest.fn(), lineTo: jest.fn(), copy: jest.fn() })) },
  },
  ColorType: { RGBA_8888: 'RGBA_8888' },
  AlphaType: { Unpremul: 'Unpremul' },
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

const IMAGE_URI = 'content://tree/coloring/cat-outline.png';
// Any base64-alphabet string works — base64ToUint8Array is real (pure logic)
// and just needs valid characters; the decoded bytes themselves are never
// inspected because Skia.Image.MakeImageFromEncoded is mocked above.
const FAKE_BASE64 = 'AAAA';

describe('ColoringScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // mockReset() (not just clearAllMocks' call-history clear) so a queued
    // `.mockRejectedValueOnce`/`.mockResolvedValueOnce` left over from a
    // previous test that failed before consuming it (e.g. an assertion
    // throwing mid-test) can never leak into the next test's call count.
    (FileSystem.readAsStringAsync as jest.Mock).mockReset();
    mockDecodeState.shouldSucceed = true;
    mockPixelState.shouldReturnPixels = false;
    mockPixelState.buffer = null;
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  // Draws a single pen stroke on the canvas touch area by simulating the raw
  // native responder events PanResponder listens for directly (there is no
  // real Skia canvas to actually drag a finger across in Jest) — grant then
  // release is enough to push one entry into ColoringScreen's `strokes`
  // state and reveal the `clear-drawing` button, which only renders when
  // `strokes.length > 0`.
  const fakeTouchHistory = {
    touchBank: [],
    numberActiveTouches: 0,
    indexOfSingleActiveTouch: -1,
    mostRecentTimeStamp: 0,
  };
  // PanResponder's own internal onResponderMove has a move-dedup guard
  // (`gestureState._accountsForMovesUpTo === touchHistory.mostRecentTimeStamp`)
  // that SILENTLY SWALLOWS the move (never calling onPanResponderMove at
  // all) whenever the touchHistory's timestamp matches the gesture state's
  // own initial value — which itself defaults to 0 (see
  // PanResponder.js's `_initializeGestureState`). Since `fakeTouchHistory`
  // above also uses `mostRecentTimeStamp: 0`, firing a 'responderMove'
  // event with that same object is silently a no-op. Any 'responderMove'
  // event needs a distinct, non-zero timestamp instead.
  const fakeTouchHistoryAfterMove = { ...fakeTouchHistory, mostRecentTimeStamp: 16 };

  // The toolbar (Fill/Pen/Undo/Clear/palette/pen-size-slider) now starts
  // collapsed and floats as an overlay — its controls only exist in the
  // render tree once the collapsed handle has been pressed at least once
  // (see ColoringScreen.tsx's `toolbarHasEverExpandedRef`). Every test
  // below that reaches into the toolbar panel calls this first.
  // Accepts either a sync `getByTestId` or an async `findByTestId` — `await`
  // resolves both a plain element and a Promise<element> the same way, so
  // this works as a drop-in helper regardless of which query style a given
  // test destructured from `render()`.
  async function expandToolbar(queryTestId: (id: string) => any) {
    const handle = await queryTestId('toolbar-handle');
    await fireEvent.press(handle);
  }

  async function drawOnePenStroke(getByTestId: (id: string) => any) {
    await expandToolbar(getByTestId);
    await fireEvent.press(getByTestId('tool-pen'));
    const touchArea = getByTestId('coloring-canvas-touch-area');
    // PanResponder's onResponderGrant/onResponderRelease handlers read
    // `event.touchHistory` directly (not `nativeEvent.touches`) to compute
    // gesture centroids — a bare fake with zero active touches is enough
    // since ColoringScreen's own onPanResponderGrant/Release callbacks only
    // read `evt.nativeEvent.locationX/Y`, never the gesture-state centroid.
    await fireEvent(touchArea, 'responderGrant', {
      touchHistory: fakeTouchHistory,
      nativeEvent: { locationX: 10, locationY: 10 },
    });
    await fireEvent(touchArea, 'responderRelease', {
      touchHistory: fakeTouchHistory,
      nativeEvent: { locationX: 20, locationY: 20 },
    });
  }

  // Performs a flood-fill tap: the default `toolMode` is already 'fill', so
  // unlike `drawOnePenStroke` above this only needs the release event (fill
  // mode acts on release, not on grant/move — see
  // `onPanResponderRelease`'s `toolModeRef.current === 'pen'` branch).
  async function fireFillTap(getByTestId: (id: string) => any, x = 5, y = 5) {
    const touchArea = getByTestId('coloring-canvas-touch-area');
    await fireEvent(touchArea, 'responderRelease', {
      touchHistory: fakeTouchHistory,
      nativeEvent: { locationX: x, locationY: y },
    });
  }

  // Simulates tapping one of the confirmation Alert's buttons, the same
  // pattern already established by SettingsScreen.test.tsx's
  // `confirmAlertWith` for the migration-confirmation Alert.
  async function pressAlertButton(buttonLabel: string) {
    const alertSpy = Alert.alert as jest.Mock;
    const [, , buttons] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    const button = buttons.find((b: { text: string }) => b.text === buttonLabel);
    await act(async () => {
      button.onPress();
      await Promise.resolve();
    });
  }

  it('shows the canvas once the photo loads and decodes successfully', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

    const { findByTestId, queryByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    await findByTestId('coloring-canvas-touch-area');
    expect(queryByTestId('coloring-image-load-error')).toBeNull();
  });

  // Regression test: while the photo is still being read/decoded, `image`
  // is `null` and `imageLoadFailed` is `false` — the exact same gap already
  // fixed for VideoPlayerScreen (iteration 12) and ProfilePicturePicker
  // (iteration 17), both converged on the shared LoadingPanel. Without a
  // loading branch, a child would see a blank, fully-interactive canvas +
  // toolbar with zero feedback that anything was happening at all.
  it('shows a real loading spinner (not a blank interactive canvas) while the photo is still decoding', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { findByTestId, queryByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    await findByTestId('coloring-image-loading');
    expect(queryByTestId('coloring-canvas-touch-area')).toBeNull();
    expect(queryByTestId('coloring-image-load-error')).toBeNull();
  });

  it('shows a friendly localized message (never the raw technical error) when the photo fails to load', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(
      new Error('ENOENT: no such file or directory, open \'/data/user/0/com.example/cache/x.jpg\'')
    );

    const { findByText, findByTestId, queryByText } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    await findByText('This picture could not be loaded for coloring.');
    await findByTestId('coloring-image-load-error');
    expect(queryByText(/ENOENT/)).toBeNull();
  });

  it('also shows the friendly error state when the bytes decode to no image (no exception thrown)', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
    mockDecodeState.shouldSucceed = false;

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    await findByTestId('coloring-image-load-error');
  });

  it('offers a retry action that recovers from a transient load failure, matching the retry pattern used elsewhere for the same SAF-failure category', async () => {
    (FileSystem.readAsStringAsync as jest.Mock)
      .mockRejectedValueOnce(new Error('SAF grant revoked'))
      .mockResolvedValueOnce(FAKE_BASE64);

    const { findByTestId, findByText, findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    await findByText('This picture could not be loaded for coloring.');
    // Screen-reader users need an accessible name for the retry button, not
    // just visible text — assert it's exposed as an accessibility label too.
    await findByLabelText('Retry');
    await fireEvent.press(await findByTestId('coloring-retry'));

    await findByTestId('coloring-canvas-touch-area');
  });

  // Regression test for the quality-evolution visual-consistency pass:
  // ColoringScreen's error state was the one screen left rendering a bare
  // View+Text instead of the RaisedCard+RaisedPrimaryButton pattern every
  // other error state (FolderErrorScreen, QuizScreen, the 3 galleries,
  // VideoPlayerScreen) had already converged on.
  it('wraps the error message in a real styled card, not a bare unstyled layout', async () => {
    const { StyleSheet } = require('react-native');
    (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(new Error('SAF grant revoked'));

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    // Query the RaisedCard's own testID directly (not just the surrounding
    // plain View) — this is the actual proof RaisedCard is rendered at all,
    // not just that some style constant survived; RaisedCard forwards its
    // `testID` prop onto its own outer node (see RaisedCard.tsx's no-onPress
    // path), so finding this testID with the expected `style` prop couldn't
    // pass if the card were removed and a bare View put back in its place.
    const raisedCard = await findByTestId('coloring-image-load-error-card');
    const flattened = StyleSheet.flatten(raisedCard.props.style);
    expect(flattened.maxWidth).toBeDefined();
  });

  it('labels each palette swatch with its localized color name and marks the selected one for screen readers', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

    const { findByTestId, findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    await findByTestId('coloring-canvas-touch-area');
    await expandToolbar(findByTestId);

    // Red is PALETTE[0], the initially-selected color.
    const redSwatch = await findByLabelText('Red');
    expect(redSwatch.props.accessibilityRole).toBe('button');
    expect(redSwatch.props.accessibilityState?.selected).toBe(true);

    // A non-selected swatch is labeled but not marked selected.
    const blueSwatch = await findByLabelText('Blue');
    expect(blueSwatch.props.accessibilityState?.selected).toBe(false);

    // Pressing a swatch by its accessible name flips which one is selected.
    await fireEvent.press(blueSwatch);
    expect((await findByLabelText('Blue')).props.accessibilityState?.selected).toBe(true);
    expect((await findByLabelText('Red')).props.accessibilityState?.selected).toBe(false);
  });

  it('gives each 44x44 palette swatch a hitSlop so its effective tap target meets the ~48x48 guideline', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

    const { findByTestId, findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    await findByTestId('coloring-canvas-touch-area');
    await expandToolbar(findByTestId);

    const redSwatch = await findByLabelText('Red');
    const { top, bottom, left, right } = redSwatch.props.hitSlop ?? {};
    // Visual swatch is 44x44 (see ColoringScreen.tsx); at least 2px of
    // hitSlop on every edge brings the effective tap target to >= 48x48.
    expect(top).toBeGreaterThanOrEqual(2);
    expect(bottom).toBeGreaterThanOrEqual(2);
    expect(left).toBeGreaterThanOrEqual(2);
    expect(right).toBeGreaterThanOrEqual(2);
  });

  it('labels palette swatches in German with warm, child-friendly color names', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

    const { findByTestId, findByLabelText } = await render(
      <LanguageProvider initialLanguage="de">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    await findByTestId('coloring-canvas-touch-area');
    await expandToolbar(findByTestId);
    await findByLabelText('Rot');
    await findByLabelText('Grün');
    await findByLabelText('Grau');
  });

  it('does not update state (and does not warn) when the load resolves after the screen has been unmounted', async () => {
    let resolveRead!: (value: string) => void;
    (FileSystem.readAsStringAsync as jest.Mock).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve;
        })
    );
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    unmount();
    // Resolve after unmount and flush the resulting microtask/effect queue.
    // If the `cancelled` guard were missing, React would log a "Can't
    // perform a React state update on an unmounted component" warning here
    // (this environment's own act() plumbing separately logs an unrelated,
    // pre-existing "not configured to support act(...)" notice on every
    // post-render async update regardless of this guard — see
    // PROGRESS.md's BLOCKED section for that known, harmless test-hygiene
    // item — so this assertion specifically targets the unmounted-component
    // wording rather than asserting zero console.error calls at all).
    resolveRead(FAKE_BASE64);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const unmountedWarnings = consoleError.mock.calls.filter((call) =>
      String(call[0]).includes('unmounted component')
    );
    expect(unmountedWarnings).toHaveLength(0);
    consoleError.mockRestore();
  });

  describe('clear-drawing confirmation', () => {
    it('asks for confirmation instead of immediately clearing when Clear drawing is pressed', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');

      // Clear drawing only renders once there is something to clear.
      expect(queryByTestId('clear-drawing')).toBeNull();
      await drawOnePenStroke(getByTestId);
      // The canvas touch inside drawOnePenStroke auto-collapsed the toolbar
      // (the same "attention returned to the picture" rule that collapses
      // it on any canvas touch) — re-expand before reaching for a
      // toolbar-panel button again.
      await expandToolbar(getByTestId);
      const clearButton = await findByTestId('clear-drawing');

      await fireEvent.press(clearButton);

      expect(Alert.alert).toHaveBeenCalledWith(
        'Clear picture?',
        'This will erase your drawing.',
        expect.any(Array),
        expect.any(Object)
      );
      // The strokes must still be intact — only a modal prompt should have
      // appeared, nothing destructive yet.
      expect(await findByTestId('clear-drawing')).toBeTruthy();
    });

    it('clears the drawing once the user confirms', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await drawOnePenStroke(getByTestId);
      // Re-expand: the canvas touch inside drawOnePenStroke auto-collapsed
      // the toolbar.
      await expandToolbar(getByTestId);
      await fireEvent.press(await findByTestId('clear-drawing'));

      await pressAlertButton('Clear');

      // The button disappears once strokes is empty again — the real,
      // observable signal that the drawing was actually cleared.
      expect(queryByTestId('clear-drawing')).toBeNull();
    });

    it('leaves the drawing intact if the user cancels', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await drawOnePenStroke(getByTestId);
      // Re-expand: the canvas touch inside drawOnePenStroke auto-collapsed
      // the toolbar.
      await expandToolbar(getByTestId);
      await fireEvent.press(await findByTestId('clear-drawing'));

      await pressAlertButton('Cancel');

      expect(queryByTestId('clear-drawing')).not.toBeNull();
    });

    it('shows the confirmation localized in German', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="de">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await drawOnePenStroke(getByTestId);
      // Re-expand: the canvas touch inside drawOnePenStroke auto-collapsed
      // the toolbar.
      await expandToolbar(getByTestId);
      await fireEvent.press(await findByTestId('clear-drawing'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Bild löschen?',
        'Das löscht dein Bild.',
        expect.any(Array),
        expect.any(Object)
      );
      const alertSpy = Alert.alert as jest.Mock;
      const [, , buttons] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
      expect(buttons.map((b: { text: string }) => b.text)).toEqual(['Abbrechen', 'Löschen']);
    });
  });

  describe('undo last flood fill', () => {
    it('shows no Undo button before any fill has happened', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      mockPixelState.shouldReturnPixels = true;

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');

      expect(queryByTestId('undo-fill')).toBeNull();
    });

    it('does not show an Undo button for pen strokes — only flood fills are undoable this way', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      mockPixelState.shouldReturnPixels = true;

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');

      await drawOnePenStroke(getByTestId);
      // A pen stroke reveals clear-drawing but must not reveal undo-fill —
      // the two are independent mechanisms over independent state.
      expect(await findByTestId('clear-drawing')).toBeTruthy();
      expect(queryByTestId('undo-fill')).toBeNull();
    });

    it('reveals an Undo button after a flood-fill tap, and pressing it hides the button again', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      mockPixelState.shouldReturnPixels = true;

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      expect(queryByTestId('undo-fill')).toBeNull();
      await fireFillTap(getByTestId);
      const undoButton = await findByTestId('undo-fill');

      await fireEvent.press(undoButton);

      expect(queryByTestId('undo-fill')).toBeNull();
    });

    it('restores the pre-fill image by reusing the stored snapshot, not by recomputing a new fill', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      mockPixelState.shouldReturnPixels = true;
      const { Skia } = require('@shopify/react-native-skia');

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      await fireFillTap(getByTestId);
      expect(Skia.Image.MakeImage).toHaveBeenCalledTimes(1);

      await fireEvent.press(await findByTestId('undo-fill'));
      // Undo restores the previously-held image reference directly; it must
      // NOT call MakeImage again (that would mean it recomputed/regenerated
      // an image rather than cheaply restoring the one snapshot taken right
      // before the fill).
      expect(Skia.Image.MakeImage).toHaveBeenCalledTimes(1);
    });

    it('re-arms for a fresh single-level undo after a later fill', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      mockPixelState.shouldReturnPixels = true;
      const { Skia } = require('@shopify/react-native-skia');

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      await fireFillTap(getByTestId);
      await fireEvent.press(await findByTestId('undo-fill'));
      expect(queryByTestId('undo-fill')).toBeNull();

      await fireFillTap(getByTestId);
      expect(await findByTestId('undo-fill')).toBeTruthy();
      expect(Skia.Image.MakeImage).toHaveBeenCalledTimes(2);
    });

    it('labels the Undo button in German', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      mockPixelState.shouldReturnPixels = true;

      const { findByTestId, getByTestId, findByLabelText } = await render(
        <LanguageProvider initialLanguage="de">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      await fireFillTap(getByTestId);

      await findByLabelText('Rückgängig');
    });
  });

  describe('toolbar row screen-fit', () => {
    // See iteration 28's Technical Decisions note: hand-computed worst-case
    // button widths (4 buttons visible together — Fill, Pen, Undo, Clear
    // drawing — in German, whose text runs noticeably longer than English)
    // leave only a moderate safety margin against a narrow landscape
    // phone's real width once notch/gesture-bar insets are subtracted,
    // unlike the quiz progress-dots row's confidently-huge margin
    // (iteration 20). Text pixel width can't be measured in this Jest
    // environment (no real font metrics), so — unlike iteration 20's
    // pixel-sum test — this pins down the layout-level fix instead: the
    // toolbar row must be able to wrap onto a second line rather than
    // clip buttons off-screen, checked at the point where all 4 buttons
    // are genuinely reachable together.
    it('lets the toolbar row wrap instead of overflowing when all 4 buttons are visible together', async () => {
      const { StyleSheet } = require('react-native');
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      mockPixelState.shouldReturnPixels = true;

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');

      // Get all 4 buttons on screen simultaneously: a flood fill reveals
      // Undo, and a pen stroke reveals Clear drawing — the two are
      // independent (see the 'undo last flood fill' describe block above),
      // so doing both stacks all 4 toolbar buttons together.
      await fireFillTap(getByTestId);
      await drawOnePenStroke(getByTestId);
      expect(await findByTestId('undo-fill')).toBeTruthy();
      expect(await findByTestId('clear-drawing')).toBeTruthy();
      expect(await findByTestId('tool-fill')).toBeTruthy();
      expect(await findByTestId('tool-pen')).toBeTruthy();

      const row = await findByTestId('coloring-toolbar-row');
      const flattened = StyleSheet.flatten(row.props.style);
      expect(flattened.flexWrap).toBe('wrap');
    });
  });

  // Regression tests for the premium-polish accessibility pass: the Fill/Pen
  // tool-mode buttons already had accessibilityRole/Label, but no
  // accessibilityState — a screen-reader user had no way to tell which tool
  // was currently active, the same "which one is selected" gap this app's
  // palette swatches (see palette-swatch-selection tests below) already
  // avoid.
  describe('tool-mode accessibility state', () => {
    it('marks only the active tool (fill, by default) as selected', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      expect(getByTestId('tool-fill').props.accessibilityState).toEqual({ selected: true });
      expect(getByTestId('tool-pen').props.accessibilityState).toEqual({ selected: false });
    });

    it('flips the selected tool once Pen is pressed', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      await fireEvent.press(getByTestId('tool-pen'));

      expect(getByTestId('tool-pen').props.accessibilityState).toEqual({ selected: true });
      expect(getByTestId('tool-fill').props.accessibilityState).toEqual({ selected: false });
    });
  });

  describe('pen size slider', () => {
    it('is hidden in fill mode and appears once pen mode is selected', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, queryByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      expect(queryByTestId('pen-size-slider')).toBeNull();

      await fireEvent.press(getByTestId('tool-pen'));
      await findByTestId('pen-size-slider');

      await fireEvent.press(getByTestId('tool-fill'));
      expect(queryByTestId('pen-size-slider')).toBeNull();
    });

    it('starts at a sensible default width, within the slider\'s configured range', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);
      await fireEvent.press(getByTestId('tool-pen'));

      const slider = await findByTestId('pen-size-slider');
      expect(slider.props.value).toBe(14);
      expect(slider.props.minimumValue).toBeLessThan(14);
      expect(slider.props.maximumValue).toBeGreaterThan(14);
      expect(await findByTestId('pen-size-value')).toHaveTextContent('14');
    });

    it('updates the displayed size as the slider value changes', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);
      await fireEvent.press(getByTestId('tool-pen'));

      // The community Slider component destructures `onValueChange` into
      // its own internal handler and forwards the underlying native
      // component's raw change event as `onChange` instead — so this
      // simulates the native `onChange({ nativeEvent: { value } })` event
      // the real slider would fire, rather than calling `onValueChange`
      // (which isn't a prop of the rendered native element) directly.
      const slider = await findByTestId('pen-size-slider');
      await act(async () => {
        slider.props.onChange({ nativeEvent: { value: 30 } });
      });

      expect(await findByTestId('pen-size-value')).toHaveTextContent('30');
    });

    it('gives the slider an accessibility label', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);
      await fireEvent.press(getByTestId('tool-pen'));

      const slider = await findByTestId('pen-size-slider');
      expect(slider.props.accessibilityLabel).toBe('Pen size');
    });
  });

  describe('palette swatch selection pop', () => {
    // These read the flattened style of the swatch's own inner
    // `palette-color-${i}-swatch` Animated.View (not the outer
    // `palette-color-${i}` Pressable, which only carries the fixed 44x44
    // hit-target box + accessibility props — see ColoringScreen.tsx's
    // Pressable/inner-face split, the same one HomeScreen's cards use).
    // Jest's react-native mock resolves an Animated.Value node to its
    // current plain numeric value when styles are flattened (the same
    // technique QuestionRenderer.test.tsx's progress-dot/mark-badge tests
    // already rely on).

    it('renders the initially-selected swatch already popped and every other swatch at rest, without animating on mount', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      const { StyleSheet } = require('react-native');

      const { findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(findByTestId);

      // Red is PALETTE[0], the initially-selected color.
      const redFlattened = StyleSheet.flatten((await findByTestId('palette-color-0-swatch')).props.style);
      const redScale = redFlattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;
      expect(redScale).toBeCloseTo(1.12);

      const blueFlattened = StyleSheet.flatten((await findByTestId('palette-color-4-swatch')).props.style);
      const blueScale = blueFlattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;
      expect(blueScale).toBeCloseTo(1);
    });

    it('requests a spring toward the popped scale for the newly-picked swatch and back to rest for the previously-selected one, on a real selection change', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      // Jest's Animated mock never advances a running spring/timing past its
      // starting value without an explicit fake-timer tick (this file's own
      // pen-size-slider/undo tests don't touch Animated at all, and
      // QuestionRenderer.test.tsx's progress-dot pop test works around this
      // by reading the value right after an explicit `.setValue()` reset,
      // which ColoringScreen.tsx's swatch pop has no equivalent of — it just
      // springs from whatever the swatch's current resting scale already
      // is). So rather than asserting the post-press flattened style (which
      // would still read the PRE-press resting value here, since no timer
      // ticked), this spies on `Animated.spring` itself and asserts it was
      // actually invoked with the right target scale for the right swatch —
      // an honest, direct check of the wiring rather than a claim that the
      // animation visibly completed under Jest.
      const { Animated: RNAnimated } = require('react-native');
      const springSpy = jest.spyOn(RNAnimated, 'spring');

      const { findByTestId, findByLabelText } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(findByTestId);

      // A single awaited press — mirroring this file's/QuestionRenderer's
      // established safe pattern for driving Animated wiring — rather than
      // a raw pressIn/pressOut gesture-event replay, which has repeatedly
      // corrupted the RNTL renderer for later tests in this codebase.
      const blueSwatch = await findByLabelText('Blue'); // PALETTE[4]
      await fireEvent.press(blueSwatch);

      const toValues = springSpy.mock.calls.map(([, config]) => (config as { toValue: number }).toValue);
      expect(toValues).toContain(1.12); // newly-selected Blue pops up
      expect(toValues).toContain(1); // previously-selected Red settles back

      springSpy.mockRestore();
    });

    // Regression test for the premium-polish accessibility pass: this pop
    // always sprang the newly-picked swatch up (and the previously-picked
    // one back down), ignoring the OS reduce-motion setting — the same
    // bouncy-pop category already fixed for the quiz's progress dots. With
    // the setting on, both swatches should land directly on their resting
    // scale with no spring in between.
    it('skips the swatch-pop spring when the OS reduce-motion setting is on, landing both swatches directly on their resting scale', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
      const { StyleSheet } = require('react-native');

      const { findByTestId, findByLabelText } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(findByTestId);

      const blueSwatch = await findByLabelText('Blue'); // PALETTE[4]
      await fireEvent.press(blueSwatch);

      const blueFlattened = StyleSheet.flatten((await findByTestId('palette-color-4-swatch')).props.style);
      const blueScale = blueFlattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;
      const redFlattened = StyleSheet.flatten((await findByTestId('palette-color-0-swatch')).props.style);
      const redScale = redFlattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;

      expect(blueScale).toBeCloseTo(1.12);
      expect(redScale).toBeCloseTo(1);

      // `jest.restoreAllMocks()` alone does NOT undo this specific mock:
      // `AccessibilityInfo.isReduceMotionEnabled` is already an auto-mocked
      // jest.fn() (a native module method), so `jest.spyOn` above just
      // returns that same mock rather than wrapping a real implementation —
      // there's no "original" for restore to revert to, and the
      // `mockResolvedValue(true)` set above silently keeps leaking into
      // every later test in this file (a real, verified bug: confirmed by
      // reproducing it in isolation — see iteration 30's notes). Explicitly
      // resetting the resolved value back to `false` here is what actually
      // fixes it; `restoreAllMocks()` is kept alongside for the OTHER real
      // (non-automocked) spies this file's tests use.
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
      jest.restoreAllMocks();
    });
  });

  describe('toolbar button press feedback', () => {
    // Same "spy on Animated.spring's call args instead of the settled style"
    // technique as the palette pop test above, and for the same reason:
    // under Jest, `Animated.spring(...).start()` never actually advances the
    // value without a fake-timer tick, so reading the flattened style right
    // after press-in would still show the PRE-press resting scale — this
    // instead confirms the press-in/press-out handlers really do request a
    // spring toward 0.94 and back to 1, which is the actual, honest thing
    // this iteration wires up.
    //
    // `fireEvent(button, 'pressIn'/'pressOut')` (not raw 'responderGrant'/
    // 'responderRelease') is used to trigger the callbacks: RNTL's fireEvent
    // locates and calls the `onPressIn`/`onPressOut` prop directly (see
    // node_modules/@testing-library/react-native/dist/fire-event.js's
    // findEventHandler) rather than replaying the native gesture-responder
    // event sequence — it's the same category of "call the real callback
    // directly" this file's other Animated-wiring tests already rely on, not
    // the raw touch-responder replay that HomeScreen.test.tsx found corrupts
    // the RNTL renderer for later tests.
    it('requests a spring toward the pressed-down scale on press-in and back to rest on press-out, for the Fill button', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      const { Animated: RNAnimated } = require('react-native');
      const springSpy = jest.spyOn(RNAnimated, 'spring');

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      const fillButton = getByTestId('tool-fill');
      await fireEvent(fillButton, 'pressIn');

      expect(springSpy.mock.calls.some(([, config]) => (config as { toValue: number }).toValue === 0.94)).toBe(true);

      await fireEvent(fillButton, 'pressOut');

      expect(springSpy.mock.calls.some(([, config]) => (config as { toValue: number }).toValue === 1)).toBe(true);

      // The button's real onPress (tool selection) is a separate callback
      // entirely, unaffected by the press-in/out animation wiring above —
      // already covered by this file's own "is hidden in fill mode..." /
      // toolbar tests elsewhere, which press these same buttons via
      // fireEvent.press and observe toolMode-driven UI change correctly.
      springSpy.mockRestore();
    });

    // Regression test for the premium-polish accessibility pass: this
    // press-in/press-out scale always sprang, ignoring the OS reduce-motion
    // setting — the same category as the palette-swatch pop just above and
    // useTiltPress's app-wide press feedback (iteration 24). Unlike the
    // spring case above, `setValue` takes effect synchronously under Jest,
    // so this reads the settled flattened style directly rather than
    // spying on `Animated.spring`.
    it('skips the toolbar button press spring when the OS reduce-motion setting is on, landing directly on the pressed/rest scale', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
      const { StyleSheet } = require('react-native');

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      const fillButton = getByTestId('tool-fill');
      await fireEvent(fillButton, 'pressIn');

      const pressedFlattened = StyleSheet.flatten(getByTestId('tool-fill-face').props.style);
      const pressedScale = pressedFlattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;
      expect(pressedScale).toBeCloseTo(0.94);

      await fireEvent(fillButton, 'pressOut');

      const restedFlattened = StyleSheet.flatten(getByTestId('tool-fill-face').props.style);
      const restedScale = restedFlattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;
      expect(restedScale).toBeCloseTo(1);

      // See the matching comment on the swatch-pop reduce-motion test above
      // — `restoreAllMocks()` alone can't undo this specific mock.
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
      jest.restoreAllMocks();
    });
  });

  // New behavior for this iteration: the Fill/Pen/Undo/Clear/palette panel
  // no longer sits permanently below the canvas — it floats as a
  // collapsible overlay, starting collapsed (just a small floating handle)
  // so the picture gets the full screen by default.
  describe('toolbar overlay expand/collapse', () => {
    it('starts collapsed: the handle is present, the panel is not yet mounted', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');

      const handle = await findByTestId('toolbar-handle');
      expect(handle.props.accessibilityRole).toBe('button');
      expect(handle.props.accessibilityLabel).toBe('Show tools');
      // Lazily mounted: never expanded yet, so the panel subtree (and every
      // control inside it) genuinely isn't in the tree at all, not just
      // hidden.
      expect(queryByTestId('coloring-toolbar-panel')).toBeNull();
      expect(queryByTestId('tool-fill')).toBeNull();
    });

    it('pressing the handle reveals the panel with every control still reachable inside it', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      expect(await findByTestId('coloring-toolbar-panel')).toBeTruthy();
      expect(await findByTestId('tool-fill')).toBeTruthy();
      expect(await findByTestId('tool-pen')).toBeTruthy();
      expect(await findByTestId('coloring-palette')).toBeTruthy();
      // The handle itself is gone while expanded (only one affordance
      // visible at a time — either "show" or "hide", never both).
      expect(queryByTestId('toolbar-handle')).toBeNull();
    });

    it('pressing the collapse chevron hides the panel again and brings the handle back', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);
      expect(queryByTestId('toolbar-handle')).toBeNull();

      const chevron = await findByTestId('toolbar-collapse');
      expect(chevron.props.accessibilityLabel).toBe('Hide tools');
      await fireEvent.press(chevron);

      expect(await findByTestId('toolbar-handle')).toBeTruthy();
    });
  });

  describe('auto-collapse on canvas touch', () => {
    it('collapses an expanded toolbar the moment the canvas is touched', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);
      expect(queryByTestId('toolbar-handle')).toBeNull();

      // A canvas touch, without even completing a fill/stroke — the grant
      // alone is enough to collapse (see the "would you like to draw?"
      // framing this responds to: picking a tool THEN touching the canvas
      // collapses the toolbar to give the picture the full screen back).
      const touchArea = getByTestId('coloring-canvas-touch-area');
      await fireEvent(touchArea, 'responderGrant', {
        touchHistory: fakeTouchHistory,
        nativeEvent: { locationX: 5, locationY: 5 },
      });

      expect(await findByTestId('toolbar-handle')).toBeTruthy();
    });

    it('does not auto-collapse just from picking a tool/color — only an actual canvas touch triggers it', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      await fireEvent.press(getByTestId('tool-pen'));

      expect(queryByTestId('toolbar-handle')).toBeNull();
      expect(await findByTestId('coloring-toolbar-panel')).toBeTruthy();
    });
  });

  describe('touch cursor indicator', () => {
    it('appears at the touch point while drawing/filling, and disappears on release', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      const { StyleSheet } = require('react-native');

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      expect(queryByTestId('touch-cursor')).toBeNull();

      const touchArea = getByTestId('coloring-canvas-touch-area');
      await fireEvent(touchArea, 'responderGrant', {
        touchHistory: fakeTouchHistory,
        nativeEvent: { locationX: 40, locationY: 60 },
      });

      const cursor = await findByTestId('touch-cursor');
      const flattened = StyleSheet.flatten(cursor.props.style);
      // Fill mode (the default): a fixed 36x36 ring centered on the touch
      // point.
      expect(flattened.left).toBeCloseTo(40 - 18);
      expect(flattened.top).toBeCloseTo(60 - 18);

      await fireEvent(touchArea, 'responderRelease', {
        touchHistory: fakeTouchHistory,
        nativeEvent: { locationX: 40, locationY: 60 },
      });
      expect(queryByTestId('touch-cursor')).toBeNull();
    });

    it('also disappears on a terminated gesture (not just a clean release)', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');

      const touchArea = getByTestId('coloring-canvas-touch-area');
      await fireEvent(touchArea, 'responderGrant', {
        touchHistory: fakeTouchHistory,
        nativeEvent: { locationX: 10, locationY: 10 },
      });
      expect(await findByTestId('touch-cursor')).toBeTruthy();

      await fireEvent(touchArea, 'responderTerminate', {
        touchHistory: fakeTouchHistory,
        nativeEvent: { locationX: 10, locationY: 10 },
      });
      expect(queryByTestId('touch-cursor')).toBeNull();
    });

    // Regression test for a real bug seen on-device: a child's finger
    // touched one point on the canvas but the paint filled (and the cursor
    // appeared) at a visibly different point. `nativeEvent.locationX/Y` has
    // been observed to report inconsistently on some real Android devices
    // for a touch inside this canvas's zoom/pan-transformed view hierarchy.
    // The fix prefers `nativeEvent.touches[].pageX/pageY` (always
    // window-absolute, unaffected by any transform) whenever a real
    // `touches` array is present, exactly like the pinch-zoom code already
    // did — this fires a grant event with a `touches` array reporting one
    // point (40, 60) but a deliberately WRONG `locationX/locationY` (999,
    // 999), and confirms the cursor lands at the `touches`-derived point,
    // proving `locationX/Y` is ignored whenever `touches` is available.
    it('positions the cursor from nativeEvent.touches[].pageX/pageY, not locationX/locationY, when a touches array is present', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      const { StyleSheet } = require('react-native');

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');

      const touchArea = getByTestId('coloring-canvas-touch-area');
      await fireEvent(touchArea, 'responderGrant', {
        touchHistory: fakeTouchHistory,
        nativeEvent: {
          locationX: 999,
          locationY: 999,
          touches: [{ pageX: 40, pageY: 60 }],
        },
      });

      const cursor = await findByTestId('touch-cursor');
      const flattened = StyleSheet.flatten(cursor.props.style);
      // Fill mode (the default): a fixed 36x36 ring centered on the touch
      // point — (40, 60), the touches-array point, not (999, 999).
      expect(flattened.left).toBeCloseTo(40 - 18);
      expect(flattened.top).toBeCloseTo(60 - 18);
    });

    // Same discrimination, but for the actual PEN STROKE path rather than
    // just the cursor — proves the fix reaches the real drawing/fill logic,
    // not just the cosmetic cursor indicator.
    it('starts a pen stroke at the touches-array point, not locationX/locationY, when a touches array is present', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      const { Skia } = require('@shopify/react-native-skia');

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);
      await fireEvent.press(getByTestId('tool-pen'));

      const touchArea = getByTestId('coloring-canvas-touch-area');
      await fireEvent(touchArea, 'responderGrant', {
        touchHistory: fakeTouchHistory,
        nativeEvent: {
          locationX: 999,
          locationY: 999,
          touches: [{ pageX: 40, pageY: 60 }],
        },
      });

      // The identity (untouched, unzoomed) transform is a no-op mapping, so
      // the canvas-space point the stroke starts at is exactly (40, 60) —
      // the touches-array point — if (and only if) locationX/Y is ignored.
      const pathMock = (Skia.Path.Make as jest.Mock).mock.results[0].value;
      expect(pathMock.moveTo).toHaveBeenCalledWith(40, 60);
    });

    it('sizes the cursor to the current pen width in Pen mode, tinted with the selected color', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      const { StyleSheet } = require('react-native');

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);
      await fireEvent.press(getByTestId('tool-pen'));

      const touchArea = getByTestId('coloring-canvas-touch-area');
      await fireEvent(touchArea, 'responderGrant', {
        touchHistory: fakeTouchHistory,
        nativeEvent: { locationX: 50, locationY: 50 },
      });

      const cursor = await findByTestId('touch-cursor');
      const flattened = StyleSheet.flatten(cursor.props.style);
      // Default pen width is 14 (see PEN_STROKE_WIDTH_DEFAULT) -> ring size
      // penWidth + 8 = 22.
      expect(flattened.width).toBe(22);
      expect(flattened.height).toBe(22);
      expect(flattened.borderColor).toBe('#E63946'); // PALETTE[0] (Red), the default selection
    });
  });

  describe('pinch-to-zoom (synthetic 2-touch)', () => {
    // Extends this file's existing single-touch synthetic-event idiom with
    // a 2-element `nativeEvent.touches` array (pageX/pageY, matching what
    // ColoringScreen.tsx's `touchesFromEvent` reads for pinch/pan math —
    // see that function's own comment for why page-space, not
    // location-space).
    it('scales the canvas transform up when two fingers move apart', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      const { StyleSheet } = require('react-native');

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      const touchArea = getByTestId('coloring-canvas-touch-area');

      await fireEvent(touchArea, 'responderGrant', {
        touchHistory: fakeTouchHistory,
        nativeEvent: {
          locationX: 50,
          locationY: 50,
          touches: [
            { pageX: 40, pageY: 100 },
            { pageX: 60, pageY: 100 },
          ],
        },
      });
      // Distance doubles: 20 -> 40.
      await fireEvent(touchArea, 'responderMove', {
        touchHistory: fakeTouchHistoryAfterMove,
        nativeEvent: {
          locationX: 50,
          locationY: 50,
          touches: [
            { pageX: 30, pageY: 100 },
            { pageX: 70, pageY: 100 },
          ],
        },
      });

      const transform = await findByTestId('coloring-canvas-transform');
      const flattened = StyleSheet.flatten(transform.props.style);
      const scale = flattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;
      expect(scale).toBeCloseTo(2);
    });

    it('does not trigger a flood fill when a two-finger gesture ends', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      mockPixelState.shouldReturnPixels = true;
      const { Skia } = require('@shopify/react-native-skia');

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      const touchArea = getByTestId('coloring-canvas-touch-area');

      await fireEvent(touchArea, 'responderGrant', {
        touchHistory: fakeTouchHistory,
        nativeEvent: {
          locationX: 50,
          locationY: 50,
          touches: [
            { pageX: 40, pageY: 100 },
            { pageX: 60, pageY: 100 },
          ],
        },
      });
      await fireEvent(touchArea, 'responderRelease', {
        touchHistory: fakeTouchHistory,
        nativeEvent: {
          locationX: 50,
          locationY: 50,
          touches: [
            { pageX: 40, pageY: 100 },
            { pageX: 60, pageY: 100 },
          ],
        },
      });

      expect(Skia.Image.MakeImage).not.toHaveBeenCalled();
    });

    it('still fills correctly with a single-finger tap, unaffected by the new multi-touch handling', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      mockPixelState.shouldReturnPixels = true;
      const { Skia } = require('@shopify/react-native-skia');

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');

      await fireFillTap(getByTestId);

      expect(Skia.Image.MakeImage).toHaveBeenCalledTimes(1);
    });
  });

  describe('rapid consecutive fill taps (batched touch events)', () => {
    // A 10x10 buffer split into two regions the tolerance-10 match can never
    // bridge: left half white (255), right half mid-grey (200). That makes a
    // fill in one region observable independently of a fill in the other.
    function makeTwoRegionBuffer(): Uint8Array {
      const px = new Uint8Array(10 * 10 * 4);
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          const i = (y * 10 + x) * 4;
          const v = x < 5 ? 255 : 200;
          px[i] = v;
          px[i + 1] = v;
          px[i + 2] = v;
          px[i + 3] = 255;
        }
      }
      return px;
    }

    function pixelAt(buffer: Uint8Array, x: number, y: number): number[] {
      const i = (y * 10 + x) * 4;
      return [buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3]];
    }

    // Regression test: a flood fill on a real photo takes long enough that a
    // second tap lands while the first is still running, and React Native
    // then delivers BOTH release events in one batch — before React has
    // re-rendered and refreshed the screen's `pixelsRef` from state. When
    // the second tap read that stale ref it flooded the pre-first-fill
    // buffer, so its result silently threw the first fill away: the child
    // tapped two shapes and only the second one ended up colored.
    it('keeps the first fill when a second tap on another region arrives in the same event batch', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      mockPixelState.shouldReturnPixels = true;
      mockPixelState.buffer = makeTwoRegionBuffer();
      const { StyleSheet } = require('react-native');
      const { Skia } = require('@shopify/react-native-skia');
      // React logs "overlapping act() calls" for the deliberately-nested
      // act below — that nesting IS the batch being reproduced, so the
      // warning is expected noise here rather than a signal. Same
      // spy-and-restore idiom as TicTacToeScreen's own batched-tap test.
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');

      const canvas = StyleSheet.flatten(getByTestId('coloring-canvas-transform').props.style);
      const touchArea = getByTestId('coloring-canvas-touch-area');
      const midY = canvas.height * 0.5;

      // Both releases dispatched inside ONE act() — nothing re-renders
      // between them, exactly like a real batched pair of touch events.
      await act(async () => {
        // 10% across -> pixel column 1, the white (left) region.
        fireEvent(touchArea, 'responderRelease', {
          touchHistory: fakeTouchHistory,
          nativeEvent: { locationX: canvas.width * 0.1, locationY: midY },
        });
        // 70% across -> pixel column 7, the grey (right) region.
        fireEvent(touchArea, 'responderRelease', {
          touchHistory: fakeTouchHistory,
          nativeEvent: { locationX: canvas.width * 0.7, locationY: midY },
        });
      });

      const fromBytesCalls = (Skia.Data.fromBytes as jest.Mock).mock.calls;
      const lastBuffer: Uint8Array = fromBytesCalls[fromBytesCalls.length - 1][0];
      const red = [230, 57, 70, 255]; // PALETTE[0], the default selection
      expect(pixelAt(lastBuffer, 7, 5)).toEqual(red); // the second tap's region
      expect(pixelAt(lastBuffer, 1, 5)).toEqual(red); // the first tap's region, NOT reverted
    });

    // Regression test: a 2-8 year old taps the same shape over and over.
    // The second tap on an already-red region cannot change a single pixel,
    // but it used to run the whole fill pipeline anyway — including
    // replacing the undo snapshot with the POST-fill state. So a child who
    // filled the wrong shape, tapped it again (seeing nothing happen) and
    // then pressed Undo got nothing back.
    it('ignores a repeat tap on a region already filled with the selected color, keeping the real undo point', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
      mockPixelState.shouldReturnPixels = true;
      mockPixelState.buffer = makeTwoRegionBuffer();
      const { StyleSheet } = require('react-native');
      const { Skia } = require('@shopify/react-native-skia');

      const { findByTestId, getByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringScreen imageUri={IMAGE_URI} />
        </LanguageProvider>
      );
      await findByTestId('coloring-canvas-touch-area');
      await expandToolbar(getByTestId);

      const canvas = StyleSheet.flatten(getByTestId('coloring-canvas-transform').props.style);
      const x = canvas.width * 0.1; // pixel column 1, the white (left) region
      const y = canvas.height * 0.5;

      await fireFillTap(getByTestId, x, y);
      expect(Skia.Image.MakeImage).toHaveBeenCalledTimes(1);
      expect(queryByTestId('undo-fill')).not.toBeNull();

      // Same spot again, same color — provably a no-op, so nothing at all
      // should happen (no new image, no new undo snapshot).
      await fireFillTap(getByTestId, x, y);
      expect(Skia.Image.MakeImage).toHaveBeenCalledTimes(1);

      // Undo still exists and still refers to the pre-fill state, so it
      // hides itself again exactly as it would have without the repeat tap.
      await fireEvent.press(getByTestId('undo-fill'));
      expect(queryByTestId('undo-fill')).toBeNull();
    });
  });
});
