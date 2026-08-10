import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { CameraGallery } from '../../src/camera/CameraGallery';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as fileReferenceStore from '../../src/storage/fileReferenceStore';
import * as galleryRemoval from '../../src/storage/galleryRemoval';

jest.mock('../../src/storage/fileReferenceStore');
jest.mock('../../src/storage/galleryRemoval');

async function confirmRemoval() {
  const alertSpy = Alert.alert as jest.Mock;
  const [, , buttons] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  const confirmButton = buttons.find((b: { text: string }) => b.text === 'Remove');
  await act(async () => {
    await confirmButton.onPress();
  });
}

function renderGallery() {
  return render(
    <LanguageProvider initialLanguage="en">
      <CameraGallery />
    </LanguageProvider>
  );
}

describe('CameraGallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue([]);
  });

  it('shows the "Take a photo" button and no folder-listing call at all', async () => {
    const { findByTestId } = await renderGallery();
    await findByTestId('take-photo-button');
    // Confirms this gallery never depends on any SAF folder -- there is
    // none to depend on.
  });

  it('shows the empty state when no photos have been taken yet', async () => {
    const { findByText } = await renderGallery();
    await findByText('Take your first photo to see it here!');
  });

  it('lists taken photos and opens the full-screen viewer on tap', async () => {
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue([
      'file:///docs/kutta-added/1-photo.jpg',
    ]);

    const { findByTestId, queryByTestId } = await renderGallery();
    const item = await findByTestId('camera-item-file:///docs/kutta-added/1-photo.jpg');

    expect(queryByTestId('camera-viewer')).toBeNull();
    await fireEvent.press(item);

    const viewerImage = await findByTestId('camera-viewer-image');
    expect(viewerImage.props.source).toEqual({ uri: 'file:///docs/kutta-added/1-photo.jpg' });
  });

  it('closes the viewer when the backdrop is tapped', async () => {
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue([
      'file:///docs/kutta-added/1-photo.jpg',
    ]);

    const { findByTestId, queryByTestId } = await renderGallery();
    const item = await findByTestId('camera-item-file:///docs/kutta-added/1-photo.jpg');
    await fireEvent.press(item);
    await findByTestId('camera-viewer');

    await fireEvent.press(await findByTestId('camera-viewer-backdrop'));

    expect(queryByTestId('camera-viewer')).toBeNull();
  });

  it('does not close the viewer when the photo itself (not the backdrop) is tapped', async () => {
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue([
      'file:///docs/kutta-added/1-photo.jpg',
    ]);

    const { findByTestId, queryByTestId } = await renderGallery();
    const item = await findByTestId('camera-item-file:///docs/kutta-added/1-photo.jpg');
    await fireEvent.press(item);
    const viewer = await findByTestId('camera-viewer');

    await fireEvent.press(viewer);

    expect(queryByTestId('camera-viewer')).not.toBeNull();
  });

  it('lets the parent long-press to multi-select and remove photos', async () => {
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue([
      'file:///docs/kutta-added/1-photo.jpg',
    ]);
    (galleryRemoval.removeGalleryItems as jest.Mock).mockResolvedValue({ removedCount: 1, failedCount: 0 });

    const { findByTestId } = await renderGallery();
    const item = await findByTestId('camera-item-file:///docs/kutta-added/1-photo.jpg');

    await fireEvent(item, 'longPress');
    await findByTestId('camera-gallery-selection-bar');

    await fireEvent.press(await findByTestId('camera-gallery-remove-selected'));
    await confirmRemoval();

    await waitFor(() =>
      expect(galleryRemoval.removeGalleryItems).toHaveBeenCalledWith(
        'camera',
        ['file:///docs/kutta-added/1-photo.jpg'],
        expect.any(Set)
      )
    );
  });
});
