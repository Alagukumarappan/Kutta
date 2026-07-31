import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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
  });

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

    const { findByTestId, findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    await findByText('This picture could not be loaded for coloring.');
    await fireEvent.press(await findByTestId('coloring-retry'));

    await findByTestId('coloring-canvas-touch-area');
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
});
