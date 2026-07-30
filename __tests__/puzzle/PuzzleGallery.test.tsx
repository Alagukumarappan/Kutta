import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PuzzleGallery } from '../../src/puzzle/PuzzleGallery';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as FileSystem from 'expo-file-system';

jest.mock('expo-file-system', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
}));

describe('PuzzleGallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(onSelect).toHaveBeenCalledWith('content://tree/pictures/beach.jpg');
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
});
