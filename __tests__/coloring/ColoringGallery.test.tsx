import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColoringGallery } from '../../src/coloring/ColoringGallery';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { addFileReferences } from '../../src/storage/fileReferenceStore';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn(), deleteAsync: jest.fn() },
  getInfoAsync: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-document-picker');

// Simulates tapping the destructive button of the remove-confirmation
// Alert — same pattern already established by SettingsScreen.test.tsx's
// own confirmAlertWith helper for its migration-confirmation Alert.
async function confirmRemoval() {
  const alertSpy = Alert.alert as jest.Mock;
  const [, , buttons] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  const confirmButton = buttons.find((b: { text: string }) => b.text === 'Remove');
  await act(async () => {
    await confirmButton.onPress();
  });
}

describe('ColoringGallery', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.clear();
    // pruneMissingFileReferences (used to merge individually-added files
    // into every gallery load) calls this — most tests below have no
    // individually-added files at all, so it's harmless either way, but a
    // default keeps every existing test's mock setup unchanged.
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (FileSystem.StorageAccessFramework.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  // Regression test for the premium-polish pass: this gallery used to render
  // a totally blank `<View />` (no spinner, no text) while its folder
  // listing loaded — a child staring at an empty white screen with zero
  // feedback. It must now show a real spinner instead.
  it('shows a spinner (not a blank screen) while the folder is still loading', async () => {
    let resolveListing!: (value: string[]) => void;
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveListing = resolve; })
    );

    const { findByTestId, findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByTestId('coloring-gallery-loading');
    expect(await findByText('Getting things ready...')).toBeTruthy();

    await act(async () => {
      resolveListing([]);
    });
  });

  it('lists images from the coloring folder and calls onSelect when tapped', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/coloring/cat-outline.png',
      'content://tree/coloring/house-outline.png',
    ]);

    const onSelect = jest.fn();
    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={onSelect} />
      </LanguageProvider>
    );

    const item = await findByTestId('coloring-item-content://tree/coloring/cat-outline.png');
    await fireEvent.press(item);
    expect(onSelect).toHaveBeenCalledWith('content://tree/coloring/cat-outline.png');
  });

  it('shows the empty state when the coloring folder has no images', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    const { findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByText('No coloring pages yet — add some to the coloring folder!');
  });

  it('shows a retry error state instead of a permanently blank screen when the load fails', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock)
      .mockRejectedValueOnce(new Error('SAF grant revoked'))
      .mockResolvedValueOnce(['content://tree/coloring/cat-outline.png']);

    const { findByTestId, findByText, findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByText('Something went wrong loading this content.');
    // Screen-reader users need an accessible name for the retry button, not
    // just visible text — assert it's exposed as an accessibility label too.
    await findByLabelText('Retry');
    await fireEvent.press(await findByTestId('coloring-gallery-retry'));

    await findByTestId('coloring-item-content://tree/coloring/cat-outline.png');
  });

  it('gives the retry button a real >=48dp tap target (a raised design-system card, not a bare text label)', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockRejectedValue(
      new Error('SAF grant revoked')
    );
    const { StyleSheet } = require('react-native');

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    // Redesigned onto the shared design-system's RaisedCard: rather than a
    // bare, unstyled "Retry" Text needing hitSlop to reach the ~44x44
    // guideline (this test's previous form), the button now carries a real
    // minHeight/minWidth box of its own — assert that directly.
    const target = await findByTestId('coloring-gallery-retry-target');
    const flattened = StyleSheet.flatten(target.props.style);
    expect(flattened.minHeight).toBeGreaterThanOrEqual(48);
    expect(flattened.minWidth).toBeGreaterThanOrEqual(48);
  });

  describe('individually-added pictures', () => {
    it('shows the "add coloring picture" button', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const { findByTestId, findByLabelText } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('coloring-gallery-add');
      await findByLabelText('+ Add coloring picture');
    });

    it('merges individually-added pictures with the folder content, without duplicates', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/coloring/cat-outline.png',
      ]);
      await addFileReferences('coloring', [
        'content://picked/dog.png',
        'content://tree/coloring/cat-outline.png', // already in the folder — must not duplicate
      ]);

      const { findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('coloring-item-content://tree/coloring/cat-outline.png');
      await findByTestId('coloring-item-content://picked/dog.png');
    });

    it('silently prunes a reference whose file no longer exists, without affecting the others', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      await addFileReferences('coloring', ['content://picked/still-there.png', 'content://picked/gone.png']);
      (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (uri: string) => ({
        exists: uri !== 'content://picked/gone.png',
      }));

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('coloring-item-content://picked/still-there.png');
      expect(queryByTestId('coloring-item-content://picked/gone.png')).toBeNull();
    });

    it('reloads the gallery to show a newly-picked picture after using the Add button', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'content://picked/new.png', name: 'new.png', lastModified: 0 }],
      });

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('coloring-gallery-empty');
      expect(queryByTestId('coloring-item-content://picked/new.png')).toBeNull();

      await fireEvent.press(await findByTestId('coloring-gallery-add'));

      await findByTestId('coloring-item-content://picked/new.png');
    });
  });

  describe('long-press multi-select removal', () => {
    it('enters selection mode on long-press, shows a check badge, and does not call onSelect', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/coloring/cat.png',
      ]);
      const onSelect = jest.fn();

      const { findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={onSelect} />
        </LanguageProvider>
      );

      const item = await findByTestId('coloring-item-content://tree/coloring/cat.png');
      await fireEvent(item, 'longPress');

      await findByTestId('coloring-gallery-selection-bar');
      const check = await findByTestId('coloring-item-check-content://tree/coloring/cat.png');
      expect(check.props.children).toBeTruthy();
      expect(onSelect).not.toHaveBeenCalled();
    });

    // Regression test for the premium-polish accessibility pass: entering
    // multi-select mode already showed a visible checkmark badge on
    // selected tiles, but the underlying RaisedCard exposed no
    // accessibilityState at all — a screen-reader user long-pressing into
    // this mode had no way to tell which tiles were checked.
    it('exposes accessibilityState.selected on tiles once multi-select mode is active', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/coloring/cat.png',
        'content://tree/coloring/dog.png',
      ]);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      const item = await findByTestId('coloring-item-content://tree/coloring/cat.png');
      await fireEvent(item, 'longPress');

      await findByTestId('coloring-gallery-selection-bar');
      expect(getByTestId('coloring-item-content://tree/coloring/cat.png').props.accessibilityState).toEqual({
        selected: true,
      });
      expect(getByTestId('coloring-item-content://tree/coloring/dog.png').props.accessibilityState).toEqual({
        selected: false,
      });
    });

    it('tapping a tile while selecting toggles it instead of opening it, and exits selection mode once nothing is selected', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/coloring/cat.png',
      ]);
      const onSelect = jest.fn();

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={onSelect} />
        </LanguageProvider>
      );

      const item = await findByTestId('coloring-item-content://tree/coloring/cat.png');
      await fireEvent(item, 'longPress');
      await findByTestId('coloring-gallery-selection-bar');

      await fireEvent.press(item); // toggles it back off — the only selected item
      expect(queryByTestId('coloring-gallery-selection-bar')).toBeNull();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('Cancel exits selection mode without removing anything', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/coloring/cat.png',
      ]);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await fireEvent(await findByTestId('coloring-item-content://tree/coloring/cat.png'), 'longPress');
      await fireEvent.press(await findByTestId('coloring-gallery-cancel-selection'));

      expect(queryByTestId('coloring-gallery-selection-bar')).toBeNull();
      await findByTestId('coloring-item-content://tree/coloring/cat.png');
    });

    it('removing a folder-sourced item deletes the real file and reloads the gallery', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock)
        .mockResolvedValueOnce(['content://tree/coloring/cat.png'])
        .mockResolvedValueOnce([]);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await fireEvent(await findByTestId('coloring-item-content://tree/coloring/cat.png'), 'longPress');
      await fireEvent.press(await findByTestId('coloring-gallery-remove-selected'));
      await confirmRemoval();

      expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(
        'content://tree/coloring/cat.png',
        { idempotent: true }
      );
      await findByTestId('coloring-gallery-empty');
      expect(queryByTestId('coloring-item-content://tree/coloring/cat.png')).toBeNull();
    });

    it('removing a reference-sourced item only drops the reference, never calling deleteAsync', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      await addFileReferences('coloring', ['content://picked/dog.png']);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await fireEvent(await findByTestId('coloring-item-content://picked/dog.png'), 'longPress');
      await fireEvent.press(await findByTestId('coloring-gallery-remove-selected'));
      await confirmRemoval();

      expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
      await findByTestId('coloring-gallery-empty');
      expect(queryByTestId('coloring-item-content://picked/dog.png')).toBeNull();
    });
  });
});
