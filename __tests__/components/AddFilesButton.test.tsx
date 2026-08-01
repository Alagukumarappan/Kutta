import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { AddFilesButton } from '../../src/components/AddFilesButton';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { getFileReferences } from '../../src/storage/fileReferenceStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-document-picker');
jest.mock('@react-native-async-storage/async-storage');

function renderButton(onAdded = jest.fn()) {
  return render(
    <LanguageProvider initialLanguage="en">
      <AddFilesButton
        testID="add-files"
        label="+ Add coloring picture"
        contentType="coloring"
        mimeType="image/*"
        onAdded={onAdded}
      />
    </LanguageProvider>
  );
}

describe('AddFilesButton', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('persists the picked files and calls onAdded when the picker returns a selection', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'content://tree/pic1.png', name: 'pic1.png', lastModified: 0 },
        { uri: 'content://tree/pic2.png', name: 'pic2.png', lastModified: 0 },
      ],
    });
    const onAdded = jest.fn();
    const { findByTestId } = await renderButton(onAdded);

    await fireEvent.press(await findByTestId('add-files'));

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    const refs = await getFileReferences('coloring');
    expect(refs.map((r) => r.uri)).toEqual(['content://tree/pic1.png', 'content://tree/pic2.png']);
  });

  it('calls the picker with multi-select enabled and the given mime type', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const { findByTestId } = await renderButton();

    await fireEvent.press(await findByTestId('add-files'));

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/*', multiple: true })
    );
  });

  // Regression test for a real bug seen on-device: ColoringScreen reads a
  // picked image's raw bytes via expo-file-system + Skia to decode it for
  // flood-fill, and a content:// URI handed back by the system picker for
  // an arbitrary photo (Google Photos, a cloud-backed gallery app, etc.)
  // isn't guaranteed to stay reliably byte-readable that way afterwards —
  // this showed up as "This picture could not be loaded for coloring."
  // copyToCacheDirectory:true makes the picker copy the bytes into the
  // app's own cache directory up front, sidestepping the original
  // provider's read behavior entirely.
  it('copies picked IMAGES into the cache directory, so they stay reliably readable later', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const { findByTestId } = await renderButton();

    await fireEvent.press(await findByTestId('add-files'));

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/*', copyToCacheDirectory: true })
    );
  });

  // Videos are only ever streamed through expo-video's own player, never
  // read as raw bytes, so there's no reliability need to copy them — and
  // copying could mean silently duplicating a large file into the app's
  // cache for nothing.
  it('does NOT copy picked VIDEOS into the cache directory', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <AddFilesButton testID="add-files" label="+ Add video" contentType="video" mimeType="video/*" onAdded={jest.fn()} />
      </LanguageProvider>
    );

    await fireEvent.press(await findByTestId('add-files'));

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'video/*', copyToCacheDirectory: false })
    );
  });

  it('does nothing and does not call onAdded when the picker is cancelled', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const onAdded = jest.fn();
    const { findByTestId } = await renderButton(onAdded);

    await fireEvent.press(await findByTestId('add-files'));

    expect(onAdded).not.toHaveBeenCalled();
    expect(await getFileReferences('coloring')).toEqual([]);
  });

  // Regression test for the premium-polish accessibility pass: RN's own
  // Pressable already auto-derives accessibilityState.disabled from the
  // `disabled` prop (verified directly against its source), but `busy` —
  // the one signal that ISN'T automatic — was never set at all, so a
  // screen reader had no way to announce that the file picker/write was
  // in progress, only that the button was temporarily unavailable.
  //
  // Placed BEFORE "ignores a rapid second tap while the first pick is
  // still in flight" below, not after: that test's own two-synchronous-
  // taps-then-manual-act pattern was found (independently of this change)
  // to leave the RNTL renderer unable to resolve a fresh `findByTestId` in
  // whatever test runs next in this file — the same class of cross-test
  // renderer corruption already documented elsewhere in this codebase
  // (e.g. EmptyStatePanel.test.tsx's own test-ordering notes).
  it('exposes accessibilityState.busy while a pick is in flight, and clears it once settled', async () => {
    let resolvePicker: (value: unknown) => void = () => {};
    (DocumentPicker.getDocumentAsync as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolvePicker = resolve;
      })
    );
    const { findByTestId, getByTestId } = await renderButton();
    const button = await findByTestId('add-files');

    expect(button.props.accessibilityState).toEqual({ busy: false, disabled: false });

    fireEvent.press(button);
    await waitFor(() =>
      expect(getByTestId('add-files').props.accessibilityState).toEqual({ busy: true, disabled: true })
    );

    resolvePicker({ canceled: true, assets: null });
    await waitFor(() =>
      expect(getByTestId('add-files').props.accessibilityState).toEqual({ busy: false, disabled: false })
    );
  });

  it('shows a friendly alert instead of crashing when the picker throws', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockRejectedValue(new Error('boom'));
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { findByTestId } = await renderButton();

    await fireEvent.press(await findByTestId('add-files'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  });

  describe('compact mode (top-right header placement)', () => {
    function renderCompactButton(onAdded = jest.fn()) {
      return render(
        <LanguageProvider initialLanguage="en">
          <AddFilesButton
            testID="add-files"
            label="+ Add coloring picture"
            contentType="coloring"
            mimeType="image/*"
            onAdded={onAdded}
            compact
          />
        </LanguageProvider>
      );
    }

    it('still carries the full descriptive accessibility label even though the visible glyph shrinks', async () => {
      const { findByTestId, findByLabelText } = await renderCompactButton();

      const button = await findByTestId('add-files');
      expect(button.props.accessibilityLabel).toBe('+ Add coloring picture');
      // A screen reader announces the full label regardless of the
      // shrunken visible text — assert it's reachable by that full label.
      await findByLabelText('+ Add coloring picture');
    });

    it('gives the shrunken visual box a hitSlop so the effective tap target still meets the ~44x44 guideline', async () => {
      const { findByTestId } = await renderCompactButton();

      const button = await findByTestId('add-files');
      const { top, bottom, left, right } = button.props.hitSlop ?? {};
      expect(top).toBeGreaterThanOrEqual(8);
      expect(bottom).toBeGreaterThanOrEqual(8);
      expect(left).toBeGreaterThanOrEqual(8);
      expect(right).toBeGreaterThanOrEqual(8);
    });

    it('still triggers the picker and calls onAdded on a selection, same as the full-size button', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'content://tree/pic1.png', name: 'pic1.png', lastModified: 0 }],
      });
      const onAdded = jest.fn();
      const { findByTestId } = await renderCompactButton(onAdded);

      await fireEvent.press(await findByTestId('add-files'));

      await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
      expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'image/*', multiple: true })
      );
    });
  });

  it('ignores a rapid second tap while the first pick is still in flight', async () => {
    let resolvePicker: (value: unknown) => void = () => {};
    (DocumentPicker.getDocumentAsync as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolvePicker = resolve;
      })
    );
    const { findByTestId } = await renderButton();
    const button = await findByTestId('add-files');

    // Not awaited: the picker's promise is deliberately left unresolved
    // here, so awaiting fireEvent.press's internal act() flush would hang
    // forever. Both taps are fired synchronously, then the picker resolves.
    fireEvent.press(button);
    fireEvent.press(button);
    await act(async () => {
      resolvePicker({ canceled: true, assets: null });
      await Promise.resolve();
    });

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);
  });
});
