import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PuzzleGallery } from '../../src/puzzle/PuzzleGallery';
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
// Alert — same pattern established by SettingsScreen.test.tsx's own
// confirmAlertWith helper for its migration-confirmation Alert.
async function confirmRemoval() {
  const alertSpy = Alert.alert as jest.Mock;
  const [, , buttons] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  const confirmButton = buttons.find((b: { text: string }) => b.text === 'Remove');
  await act(async () => {
    await confirmButton.onPress();
  });
}

describe('PuzzleGallery', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.clear();
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (FileSystem.StorageAccessFramework.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('lists images from the pictures folder and calls onSelect when tapped', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/beach.jpg',
    ]);

    const onSelect = jest.fn();
    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={onSelect} />
      </LanguageProvider>
    );

    const item = await findByTestId('puzzle-item-content://tree/pictures/beach.jpg');
    await fireEvent.press(item);
    // Default difficulty (no stored preference yet) is 4 — see
    // puzzleDifficultyStore.ts.
    expect(onSelect).toHaveBeenCalledWith('content://tree/pictures/beach.jpg', 4);
  });

  it('shows the empty state when there are no pictures', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    const { findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByText('No pictures yet — add some to the pictures folder!');
  });

  it('shows a retry error state instead of a permanently blank screen when the load fails', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock)
      .mockRejectedValueOnce(new Error('SAF grant revoked'))
      .mockResolvedValueOnce(['content://tree/pictures/beach.jpg']);

    const { findByTestId, findByText, findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByText('Something went wrong loading this content.');
    await fireEvent.press(await findByLabelText('Retry'));

    await findByTestId('puzzle-item-content://tree/pictures/beach.jpg');
  });

  // Redesign requirement: every tile must be a comfortable, large tap
  // target (Material's 48dp minimum) — checked statically off the tile's
  // own declared width/height rather than a measured layout, the same way
  // this suite already checks the retry button's hitSlop below rather than
  // simulating a real tap-and-measure.
  it('renders picture tiles at least 48dp in each dimension (comfortable touch target)', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/beach.jpg',
    ]);

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    const tile = await findByTestId('puzzle-item-content://tree/pictures/beach.jpg');
    const flatStyle = [tile.props.style].flat(Infinity).reduce((acc, s) => ({ ...acc, ...s }), {});
    expect(flatStyle.width).toBeGreaterThanOrEqual(48);
    expect(flatStyle.height).toBeGreaterThanOrEqual(48);
  });

  it('gives the retry button a real >=48dp tap target (a raised design-system card, not a bare text label)', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockRejectedValue(
      new Error('SAF grant revoked')
    );
    const { StyleSheet } = require('react-native');

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    // Consistency pass: redesigned onto the shared design-system's
    // RaisedCard, matching ColoringGallery/VideoGallery's own error-state
    // treatment, rather than a bare unstyled "Retry" Text needing hitSlop to
    // reach the ~44x44 guideline (this test's previous form) — the button
    // now carries a real minHeight/minWidth box of its own; assert that
    // directly.
    const target = await findByTestId('puzzle-gallery-retry-target');
    const flattened = StyleSheet.flatten(target.props.style);
    expect(flattened.minHeight).toBeGreaterThanOrEqual(48);
    expect(flattened.minWidth).toBeGreaterThanOrEqual(48);
  });

  describe('individually-added pictures', () => {
    it('shows the "add puzzle picture" button', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const { findByTestId, findByLabelText } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('puzzle-gallery-add');
      await findByLabelText('+ Add puzzle picture');
    });

    it('merges individually-added pictures with the folder content, without duplicates', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/pictures/beach.jpg',
      ]);
      await addFileReferences('puzzle', ['content://picked/mountain.jpg', 'content://tree/pictures/beach.jpg']);

      const { findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('puzzle-item-content://tree/pictures/beach.jpg');
      await findByTestId('puzzle-item-content://picked/mountain.jpg');
    });

    it('silently prunes a reference whose file no longer exists, without affecting the others', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      await addFileReferences('puzzle', ['content://picked/still-there.jpg', 'content://picked/gone.jpg']);
      (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (uri: string) => ({
        exists: uri !== 'content://picked/gone.jpg',
      }));

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('puzzle-item-content://picked/still-there.jpg');
      expect(queryByTestId('puzzle-item-content://picked/gone.jpg')).toBeNull();
    });

    it('reloads the gallery to show a newly-picked picture after using the Add button', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'content://picked/new.jpg', name: 'new.jpg', lastModified: 0 }],
      });

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('puzzle-gallery-empty');
      expect(queryByTestId('puzzle-item-content://picked/new.jpg')).toBeNull();

      await fireEvent.press(await findByTestId('puzzle-gallery-add'));

      await findByTestId('puzzle-item-content://picked/new.jpg');
    });
  });

  describe('difficulty dropdown', () => {
    it('defaults to difficulty 4 the first time, shows it next to the add button, and passes it to onSelect', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/pictures/beach.jpg',
      ]);
      const onSelect = jest.fn();

      const { findByTestId, findByLabelText } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={onSelect} />
        </LanguageProvider>
      );

      await findByLabelText('Difficulty: 4');
      await fireEvent.press(await findByTestId('puzzle-item-content://tree/pictures/beach.jpg'));
      expect(onSelect).toHaveBeenCalledWith('content://tree/pictures/beach.jpg', 4);
    });

    it('lets the parent change the difficulty, and remembers it for the next picture selected', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/pictures/beach.jpg',
      ]);
      const onSelect = jest.fn();

      const { findByTestId, findByLabelText, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={onSelect} />
        </LanguageProvider>
      );

      await fireEvent.press(await findByTestId('puzzle-difficulty-picker'));
      await fireEvent.press(await findByTestId('puzzle-difficulty-option-9'));

      await findByLabelText('Difficulty: 9');
      expect(queryByTestId('puzzle-difficulty-option-9')).toBeNull();

      await fireEvent.press(await findByTestId('puzzle-item-content://tree/pictures/beach.jpg'));
      expect(onSelect).toHaveBeenCalledWith('content://tree/pictures/beach.jpg', 9);
    });

    it('persists the chosen difficulty via savePuzzleDifficulty when changed', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const { findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );
      await findByTestId('puzzle-gallery-empty');
      await fireEvent.press(await findByTestId('puzzle-difficulty-picker'));
      await fireEvent.press(await findByTestId('puzzle-difficulty-option-12'));
      await findByTestId('puzzle-gallery-empty');

      // Read the store directly rather than remounting a second component
      // instance — the round-trip persistence itself (AsyncStorage
      // get/save) is covered independently in
      // __tests__/storage/puzzleDifficultyStore.test.ts.
      const { getPuzzleDifficulty } = require('../../src/storage/puzzleDifficultyStore');
      await waitFor(async () => expect(await getPuzzleDifficulty()).toBe(12));
    });
  });

  describe('long-press multi-select removal', () => {
    it('enters selection mode on long-press, shows a check badge, and does not call onSelect', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/pictures/beach.jpg',
      ]);
      const onSelect = jest.fn();

      const { findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={onSelect} />
        </LanguageProvider>
      );

      const item = await findByTestId('puzzle-item-content://tree/pictures/beach.jpg');
      await fireEvent(item, 'longPress');

      await findByTestId('puzzle-gallery-selection-bar');
      await findByTestId('puzzle-item-check-content://tree/pictures/beach.jpg');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('Cancel exits selection mode without removing anything', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/pictures/beach.jpg',
      ]);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await fireEvent(await findByTestId('puzzle-item-content://tree/pictures/beach.jpg'), 'longPress');
      await fireEvent.press(await findByTestId('puzzle-gallery-cancel-selection'));

      expect(queryByTestId('puzzle-gallery-selection-bar')).toBeNull();
      await findByTestId('puzzle-item-content://tree/pictures/beach.jpg');
    });

    it('removing a folder-sourced item deletes the real file and reloads the gallery', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock)
        .mockResolvedValueOnce(['content://tree/pictures/beach.jpg'])
        .mockResolvedValueOnce([]);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await fireEvent(await findByTestId('puzzle-item-content://tree/pictures/beach.jpg'), 'longPress');
      await fireEvent.press(await findByTestId('puzzle-gallery-remove-selected'));
      await confirmRemoval();

      expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(
        'content://tree/pictures/beach.jpg',
        { idempotent: true }
      );
      await findByTestId('puzzle-gallery-empty');
      expect(queryByTestId('puzzle-item-content://tree/pictures/beach.jpg')).toBeNull();
    });

    it('removing a reference-sourced item only drops the reference, never calling deleteAsync', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      await addFileReferences('puzzle', ['content://picked/mountain.jpg']);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await fireEvent(await findByTestId('puzzle-item-content://picked/mountain.jpg'), 'longPress');
      await fireEvent.press(await findByTestId('puzzle-gallery-remove-selected'));
      await confirmRemoval();

      expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
      await findByTestId('puzzle-gallery-empty');
      expect(queryByTestId('puzzle-item-content://picked/mountain.jpg')).toBeNull();
    });
  });
});
