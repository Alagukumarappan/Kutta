import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { VideoGallery } from '../../src/video/VideoGallery';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
}));

describe('VideoGallery', () => {
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

  it('gives the retry button a hitSlop so its small text-only tap target meets the ~44x44 guideline', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockRejectedValue(
      new Error('SAF grant revoked')
    );

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    const retryButton = await findByTestId('video-gallery-retry');
    // Same unstyled-Text-only, no-adjacent-sibling situation as
    // ColoringGallery's retry button (see that test for the full rationale).
    const { top, bottom, left, right } = retryButton.props.hitSlop ?? {};
    expect(top).toBeGreaterThanOrEqual(12);
    expect(bottom).toBeGreaterThanOrEqual(12);
    expect(left).toBeGreaterThanOrEqual(12);
    expect(right).toBeGreaterThanOrEqual(12);
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
});
