import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VideoGallery } from '../../src/video/VideoGallery';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { addFileReferences } from '../../src/storage/fileReferenceStore';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
  getInfoAsync: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-document-picker');

describe('VideoGallery', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
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
});
