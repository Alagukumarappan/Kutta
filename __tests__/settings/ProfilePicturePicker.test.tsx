import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfilePicturePicker } from '../../src/settings/ProfilePicturePicker';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
}));

describe('ProfilePicturePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists images from the pictures folder and calls onSelect exactly once when a thumbnail is tapped', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/beach.jpg',
      'content://tree/pictures/park.jpg',
    ]);

    const onSelect = jest.fn();
    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={onSelect}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    const item = await findByTestId('profile-picture-item-content://tree/pictures/beach.jpg');
    // Simulate a double-tap on the same thumbnail — the guard is a ref set
    // synchronously inside the very first onPress, so it blocks the second
    // tap regardless of whether React has re-rendered in between.
    await fireEvent.press(item);
    await fireEvent.press(item);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('content://tree/pictures/beach.jpg');
  });

  it('does not list the folder at all while not visible', () => {
    render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible={false}
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    expect(FileSystem.StorageAccessFramework.readDirectoryAsync).not.toHaveBeenCalled();
  });

  it('shows the empty state when the pictures folder has no images', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    const { findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    await findByText('No pictures yet — add some to the pictures folder!');
  });

  it('shows a retry error state instead of a permanently blank modal when listing fails, e.g. a revoked SAF grant', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock)
      .mockRejectedValueOnce(new Error('SAF grant revoked'))
      .mockResolvedValueOnce(['content://tree/pictures/beach.jpg']);

    const { findByTestId, findByText, findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    await findByText('Something went wrong loading this content.');
    await findByLabelText('Retry');
    await fireEvent.press(await findByTestId('profile-picture-picker-retry'));

    await findByTestId('profile-picture-item-content://tree/pictures/beach.jpg');
  });

  it('calls onClose without calling onSelect when Cancel is tapped', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/beach.jpg',
    ]);
    const onSelect = jest.fn();
    const onClose = jest.fn();

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={onSelect}
          onClose={onClose}
        />
      </LanguageProvider>
    );

    await fireEvent.press(await findByTestId('profile-picture-picker-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('labels each thumbnail for screen readers without exposing the raw filename', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/birthday-party-with-grandma.jpg',
    ]);

    const { findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    // Labeled generically ("Choose a picture 1"), not by filename.
    await findByLabelText('Choose a picture 1');
  });

  it('re-lists the folder every time the modal is reopened', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/beach.jpg',
    ]);

    const { rerender } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible={false}
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    expect(FileSystem.StorageAccessFramework.readDirectoryAsync).not.toHaveBeenCalled();

    rerender(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    await waitFor(() => expect(FileSystem.StorageAccessFramework.readDirectoryAsync).toHaveBeenCalledTimes(1));
  });
});
