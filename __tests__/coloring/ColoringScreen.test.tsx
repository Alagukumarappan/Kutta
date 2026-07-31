import React from 'react';
import { Alert } from 'react-native';
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
const mockDecodedImage = {
  width: () => 10,
  height: () => 10,
  readPixels: () => null,
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

  async function drawOnePenStroke(getByTestId: (id: string) => any) {
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

  it('labels each palette swatch with its localized color name and marks the selected one for screen readers', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);

    const { findByTestId, findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    await findByTestId('coloring-canvas-touch-area');

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
});
