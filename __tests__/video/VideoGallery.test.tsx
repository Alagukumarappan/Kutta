import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VideoGallery } from '../../src/video/VideoGallery';
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

describe('VideoGallery', () => {
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
        <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByTestId('video-gallery-loading');
    expect(await findByText('Getting things ready...')).toBeTruthy();

    await act(async () => {
      resolveListing([]);
    });
  });

  it('lists videos and calls onSelect when tapped', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/videos/party.mp4',
    ]);

    const onSelect = jest.fn();
    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoGallery videosFolderUri="content://tree/videos" onSelect={onSelect} />
      </LanguageProvider>
    );

    const item = await findByTestId('video-item-content://tree/videos/party.mp4');
    await fireEvent.press(item);
    expect(onSelect).toHaveBeenCalledWith('content://tree/videos/party.mp4');
  });

  it('shows the empty state when there are no videos', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    const { findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    // Regression test for the premium-polish visual-consistency pass: this
    // empty state used to pass its whole instructional sentence as a single
    // bold `title`, unlike ColoringGallery's own empty state, which already
    // splits a warm short headline from a softer explanatory `message` — a
    // real tone/hierarchy mismatch, now fixed to match.
    await findByText('No videos yet');
    await findByText('No videos yet — add some to the videos folder!');
  });

  it('shows a retry error state instead of a permanently blank screen when the load fails', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock)
      .mockRejectedValueOnce(new Error('SAF grant revoked'))
      .mockResolvedValueOnce(['content://tree/videos/party.mp4']);

    const { findByTestId, findByText, findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByText('Something went wrong loading this content.');
    await fireEvent.press(await findByLabelText('Retry'));

    await findByTestId('video-item-content://tree/videos/party.mp4');
  });

  it('gives the retry button a tap target that meets the ~44x44 guideline', async () => {
    // Previously this was a bare Text-only Pressable that relied on a
    // hitSlop to reach the guideline (see ColoringGallery's retry button for
    // that pattern). The redesign replaced it with the shared design-system
    // RaisedPrimaryButton, whose own `contentStyle` guarantees a real
    // (non-hitSlop) minHeight of at least `touchTarget.minimum` (48) — so
    // this asserts that guarantee is still met, wherever in the button's
    // subtree it now lives, rather than a hitSlop that no longer exists.
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockRejectedValue(
      new Error('SAF grant revoked')
    );

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    const retryButton = await findByTestId('video-gallery-retry');

    const collectMinHeights = (node: any): number[] => {
      if (!node || typeof node !== 'object') return [];
      const styles = Array.isArray(node.props?.style)
        ? node.props.style.flat(Infinity)
        : node.props?.style
        ? [node.props.style]
        : [];
      const own = styles
        .filter((s: any) => s && typeof s.minHeight === 'number')
        .map((s: any) => s.minHeight as number);
      const children: any[] = Array.isArray(node.children) ? node.children : [];
      return [...own, ...children.flatMap(collectMinHeights)];
    };

    const minHeights = collectMinHeights(retryButton.toJSON());
    expect(minHeights.some((h) => h >= 44)).toBe(true);
  });

  it('gives each video row a real minHeight so its tap target meets the ~44px guideline', async () => {
    // Unlike the retry button above, each row is a FlatList item with NO
    // gap/separator between consecutive rows — a naive hitSlop fix here
    // would make adjacent rows' hit zones overlap, risking a mis-tap on
    // the wrong video. A real minHeight (which grows the row itself,
    // pushing later rows down rather than creating an invisible overlap)
    // is the safe way to close this gap instead.
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/videos/party.mp4',
      'content://tree/videos/beach.mp4',
    ]);

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    const item = await findByTestId('video-item-content://tree/videos/party.mp4');
    const flattenStyle = (style: any): Record<string, unknown> =>
      Array.isArray(style) ? Object.assign({}, ...style.map(flattenStyle)) : style || {};
    const style = flattenStyle(item.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });

  describe('individually-added videos', () => {
    it('shows the "add video" button', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const { findByTestId, findByLabelText } = await render(
        <LanguageProvider initialLanguage="en">
          <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('video-gallery-add');
      await findByLabelText('+ Add video');
    });

    it('merges individually-added videos with the folder content, without duplicates', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/videos/party.mp4',
      ]);
      await addFileReferences('video', ['content://picked/holiday.mp4', 'content://tree/videos/party.mp4']);

      const { findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('video-item-content://tree/videos/party.mp4');
      await findByTestId('video-item-content://picked/holiday.mp4');
    });

    it('silently prunes a reference whose file no longer exists, without affecting the others', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      await addFileReferences('video', ['content://picked/still-there.mp4', 'content://picked/gone.mp4']);
      (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (uri: string) => ({
        exists: uri !== 'content://picked/gone.mp4',
      }));

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('video-item-content://picked/still-there.mp4');
      expect(queryByTestId('video-item-content://picked/gone.mp4')).toBeNull();
    });

    it('reloads the gallery to show a newly-picked video after using the Add button', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'content://picked/new.mp4', name: 'new.mp4', lastModified: 0 }],
      });

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('video-gallery-empty');
      expect(queryByTestId('video-item-content://picked/new.mp4')).toBeNull();

      await fireEvent.press(await findByTestId('video-gallery-add'));

      await findByTestId('video-item-content://picked/new.mp4');
    });
  });

  describe('long-press multi-select removal', () => {
    it('enters selection mode on long-press, shows a check badge, and does not call onSelect', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/videos/party.mp4',
      ]);
      const onSelect = jest.fn();

      const { findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <VideoGallery videosFolderUri="content://tree/videos" onSelect={onSelect} />
        </LanguageProvider>
      );

      const item = await findByTestId('video-item-content://tree/videos/party.mp4');
      await fireEvent(item, 'longPress');

      await findByTestId('video-gallery-selection-bar');
      await findByTestId('video-item-check-content://tree/videos/party.mp4');
      expect(onSelect).not.toHaveBeenCalled();
    });

    // Regression test for the premium-polish accessibility pass: entering
    // multi-select mode already showed a visible checkmark badge on
    // selected tiles, but the underlying RaisedCard exposed no
    // accessibilityState at all — a screen-reader user long-pressing into
    // this mode had no way to tell which tiles were checked.
    it('exposes accessibilityState.selected on tiles once multi-select mode is active', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/videos/party.mp4',
        'content://tree/videos/other.mp4',
      ]);

      const { findByTestId, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      const item = await findByTestId('video-item-content://tree/videos/party.mp4');
      await fireEvent(item, 'longPress');

      await findByTestId('video-gallery-selection-bar');
      expect(getByTestId('video-item-content://tree/videos/party.mp4').props.accessibilityState).toEqual({
        selected: true,
      });
      expect(getByTestId('video-item-content://tree/videos/other.mp4').props.accessibilityState).toEqual({
        selected: false,
      });
    });

    it('Cancel exits selection mode without removing anything', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/videos/party.mp4',
      ]);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await fireEvent(await findByTestId('video-item-content://tree/videos/party.mp4'), 'longPress');
      await fireEvent.press(await findByTestId('video-gallery-cancel-selection'));

      expect(queryByTestId('video-gallery-selection-bar')).toBeNull();
      await findByTestId('video-item-content://tree/videos/party.mp4');
    });

    it('removing a folder-sourced item deletes the real file and reloads the gallery', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock)
        .mockResolvedValueOnce(['content://tree/videos/party.mp4'])
        .mockResolvedValueOnce([]);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await fireEvent(await findByTestId('video-item-content://tree/videos/party.mp4'), 'longPress');
      await fireEvent.press(await findByTestId('video-gallery-remove-selected'));
      await confirmRemoval();

      expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(
        'content://tree/videos/party.mp4',
        { idempotent: true }
      );
      await findByTestId('video-gallery-empty');
      expect(queryByTestId('video-item-content://tree/videos/party.mp4')).toBeNull();
    });

    it('removing a reference-sourced item only drops the reference, never calling deleteAsync', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      await addFileReferences('video', ['content://picked/holiday.mp4']);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
        </LanguageProvider>
      );

      await fireEvent(await findByTestId('video-item-content://picked/holiday.mp4'), 'longPress');
      await fireEvent.press(await findByTestId('video-gallery-remove-selected'));
      await confirmRemoval();

      expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
      await findByTestId('video-gallery-empty');
      expect(queryByTestId('video-item-content://picked/holiday.mp4')).toBeNull();
    });
  });
});
