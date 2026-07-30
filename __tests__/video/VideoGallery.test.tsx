import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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

    const { findByTestId, findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByText('Something went wrong loading this content.');
    await fireEvent.press(await findByTestId('video-gallery-retry'));

    await findByTestId('video-item-content://tree/videos/party.mp4');
  });
});
