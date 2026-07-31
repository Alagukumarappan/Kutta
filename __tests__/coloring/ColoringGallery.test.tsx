import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ColoringGallery } from '../../src/coloring/ColoringGallery';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
}));

describe('ColoringGallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('gives the retry button a hitSlop so its small text-only tap target meets the ~44x44 guideline', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockRejectedValue(
      new Error('SAF grant revoked')
    );

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    const retryButton = await findByTestId('coloring-gallery-retry');
    // The button has no style/padding of its own — just an unstyled "Retry"
    // Text — so its rendered box is well under the touch-target guideline.
    // It's the only interactive element in this error state (no sibling
    // Pressable directly above/below it), so hitSlop is a safe way to
    // enlarge the tap target without any overlap risk.
    const { top, bottom, left, right } = retryButton.props.hitSlop ?? {};
    expect(top).toBeGreaterThanOrEqual(12);
    expect(bottom).toBeGreaterThanOrEqual(12);
    expect(left).toBeGreaterThanOrEqual(12);
    expect(right).toBeGreaterThanOrEqual(12);
  });
});
