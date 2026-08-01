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

  // Regression test for the premium-polish pass: this gallery used to render
  // a totally blank `<View />` (no spinner, no text) while its folder
  // listing loaded. It must now show a real spinner instead.
  it('shows a spinner (not a blank screen) while the folder is still loading', async () => {
    let resolveListing!: (value: string[]) => void;
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveListing = resolve; })
    );

    const { findByTestId, findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByTestId('puzzle-gallery-loading');
    expect(await findByText('Getting things ready...')).toBeTruthy();

    await act(async () => {
      resolveListing([]);
    });
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

    // Regression test for the premium-polish visual-consistency pass: this
    // empty state used to pass its whole instructional sentence as a single
    // bold `title`, unlike ColoringGallery's own empty state, which already
    // splits a warm short headline from a softer explanatory `message` — a
    // real tone/hierarchy mismatch, now fixed to match.
    await findByText('No pictures yet');
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

  // Regression test for a real bug seen on-device: this gallery used to be
  // its own different-looking grid (a fixed 128x128 tile in 4 columns).
  // Unified onto ColoringGallery's exact responsive 3-per-row shape
  // instead, which carries the same incomplete-last-row risk Coloring hit:
  // a lone tile in the final row would stretch to fill the whole row width
  // (FlatList's `flex: 1` + incomplete-last-row interaction). The fix pads
  // the data with invisible filler tiles up to a multiple of 3.
  it('pads an incomplete last row with invisible filler tiles instead of leaving the last image alone in its row', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/1.jpg',
      'content://tree/pictures/2.jpg',
      'content://tree/pictures/3.jpg',
      'content://tree/pictures/4.jpg',
    ]);

    const { findByTestId, queryAllByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByTestId('puzzle-item-content://tree/pictures/4.jpg');
    const fillers = queryAllByTestId(/puzzle-item-filler-/);
    expect(fillers).toHaveLength(2);
  });

  it('adds no filler tiles when the image count is already an exact multiple of 3', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/1.jpg',
      'content://tree/pictures/2.jpg',
      'content://tree/pictures/3.jpg',
    ]);

    const { findByTestId, queryAllByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByTestId('puzzle-item-content://tree/pictures/3.jpg');
    expect(queryAllByTestId(/puzzle-item-filler-/)).toHaveLength(0);
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

  // Regression tests for the premium-polish accessibility pass: the
  // difficulty modal's dismiss backdrop and its 4 piece-count options had no
  // accessibilityRole/Label/State at all — the trigger pill already had
  // them, but opening the modal dropped a screen-reader user with no way to
  // tell what each option meant or which one was currently chosen (the same
  // class of gap iteration 12 fixed for AgePicker).
  describe('difficulty modal accessibility', () => {
    it('gives every difficulty option a button role, a pieces-count label, and marks only the current difficulty as selected', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );
      await findByTestId('puzzle-gallery-empty');
      await fireEvent.press(await findByTestId('puzzle-difficulty-picker'));

      for (const option of [4, 6, 9, 12]) {
        const optionEl = getByTestId(`puzzle-difficulty-option-${option}`);
        expect(optionEl.props.accessibilityRole).toBe('button');
        expect(optionEl.props.accessibilityLabel).toBe(`${option} pieces`);
        expect(optionEl.props.accessibilityState).toEqual({ selected: option === 4 });
      }
    });

    it('gives the modal-dismiss backdrop a button role and a real label instead of leaving it unlabeled', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );
      await findByTestId('puzzle-gallery-empty');
      await fireEvent.press(await findByTestId('puzzle-difficulty-picker'));

      const overlay = getByTestId('puzzle-difficulty-modal-overlay');
      expect(overlay.props.accessibilityRole).toBe('button');
      expect(overlay.props.accessibilityLabel).toBe('Close difficulty picker');
    });

    it('translates the difficulty option and modal-close labels into German', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="de">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );
      await findByTestId('puzzle-gallery-empty');
      await fireEvent.press(await findByTestId('puzzle-difficulty-picker'));

      expect(getByTestId('puzzle-difficulty-option-9').props.accessibilityLabel).toBe('9 Teile');
      expect(getByTestId('puzzle-difficulty-modal-overlay').props.accessibilityLabel).toBe(
        'Schwierigkeitsauswahl schließen'
      );
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

    // Regression test for the premium-polish accessibility pass: entering
    // multi-select mode already showed a visible checkmark badge on
    // selected tiles, but the underlying RaisedCard exposed no
    // accessibilityState at all — a screen-reader user long-pressing into
    // this mode had no way to tell which tiles were checked.
    it('exposes accessibilityState.selected on tiles once multi-select mode is active', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/pictures/beach.jpg',
        'content://tree/pictures/forest.jpg',
      ]);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      const item = await findByTestId('puzzle-item-content://tree/pictures/beach.jpg');
      await fireEvent(item, 'longPress');

      await findByTestId('puzzle-gallery-selection-bar');
      expect(getByTestId('puzzle-item-content://tree/pictures/beach.jpg').props.accessibilityState).toEqual({
        selected: true,
      });
      expect(getByTestId('puzzle-item-content://tree/pictures/forest.jpg').props.accessibilityState).toEqual({
        selected: false,
      });
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
