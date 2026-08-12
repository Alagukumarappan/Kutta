import React from 'react';
import { Alert } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useSelectableGallery } from '../../src/components/useSelectableGallery';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as fileReferenceStore from '../../src/storage/fileReferenceStore';
import * as galleryRemoval from '../../src/storage/galleryRemoval';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
}));
jest.mock('../../src/storage/fileReferenceStore');
jest.mock('../../src/storage/galleryRemoval');

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(LanguageProvider, { initialLanguage: 'en', children });
}

const isImageFile = (uri: string) => uri.endsWith('.png');

async function confirmRemoval() {
  const alertSpy = Alert.alert as jest.Mock;
  const [, , buttons] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  const confirmButton = buttons.find((b: { text: string }) => b.text === 'Remove');
  await act(async () => {
    await confirmButton.onPress();
  });
}

describe('useSelectableGallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue([]);
  });

  it('loads folder contents filtered by isValidFile, merged with any individually-added extras', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://a.png',
      'content://b.txt',
    ]);
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue(['content://extra.png']);

    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'coloring', isImageFile), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).not.toBeNull());

    expect(result.current.items).toEqual(['content://a.png', 'content://extra.png']);
    expect(result.current.error).toBe(false);
  });

  // 'camera' content has no whole-folder SAF counterpart -- every camera
  // photo is an individually-added reference, so there's nothing to list.
  it('skips the SAF folder listing entirely and uses only references when no folderUri is given', async () => {
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue(['file:///data/app/kutta-added/1.jpg']);

    const { result } = await renderHook(() => useSelectableGallery(undefined, 'camera', isImageFile), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).not.toBeNull());

    expect(result.current.items).toEqual(['file:///data/app/kutta-added/1.jpg']);
    expect(result.current.error).toBe(false);
    expect(FileSystem.StorageAccessFramework.readDirectoryAsync).not.toHaveBeenCalled();
  });

  // Regression test: individually-added references must NOT be filtered by
  // isValidFile — unlike a folder listing, the system document picker
  // routinely returns an opaque content:// URI with no extension at all
  // (e.g. a video from Google Photos), which a naive extension check would
  // wrongly reject even though it's a perfectly valid, already
  // mimeType-constrained pick (see AddFilesButton).
  it('does not filter individually-added references by isValidFile, even when their uri has no matching extension', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue([
      'content://media/external/video/media/12345',
    ]);

    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'video', isImageFile), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).not.toBeNull());

    expect(result.current.items).toEqual(['content://media/external/video/media/12345']);
  });

  it('never shows an error screen just because there is no folder, even if references fail to load too', async () => {
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockRejectedValue(new Error('storage unavailable'));

    const { result } = await renderHook(() => useSelectableGallery(undefined, 'camera', isImageFile), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).not.toBeNull());

    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBe(false);
  });

  it('calls onItemsLoaded with the merged item list once loading succeeds', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue(['content://a.png']);
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue([]);

    const onItemsLoaded = jest.fn();
    const { result } = await renderHook(
      () => useSelectableGallery('content://folder', 'coloring', isImageFile, onItemsLoaded),
      { wrapper }
    );

    await waitFor(() => expect(result.current.items).not.toBeNull());

    expect(onItemsLoaded).toHaveBeenCalledWith(['content://a.png']);
  });

  it('does not duplicate an item that is both in the folder and individually referenced', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue(['content://a.png']);
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue(['content://a.png']);

    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'coloring', isImageFile), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toEqual(['content://a.png']);
  });

  it('sets error instead of throwing when the folder read fails and there is nothing else to show', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockRejectedValue(new Error('revoked'));

    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'video', isImageFile), { wrapper });

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.items).toBeNull();
  });

  // Regression test: the two sources are unrelated — the whole point of the
  // "+" button is adding a picture WITHOUT putting it in the configured
  // folder. A revoked SAF grant used to fail them together, replacing the
  // gallery with an error screen that hid perfectly reachable added pictures
  // and took the "+" button (which only lives in the normal header) with it.
  it('still shows individually-added files when the folder read fails', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockRejectedValue(new Error('revoked'));
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockResolvedValue(['content://extra.png']);

    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'coloring', isImageFile), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).toEqual(['content://extra.png']));
    expect(result.current.error).toBe(false);
  });

  // The mirror case: a failing AsyncStorage read must not blank out a
  // perfectly healthy content folder either.
  it('still shows folder content when the reference lookup fails', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue(['content://a.png']);
    (fileReferenceStore.pruneMissingFileReferences as jest.Mock).mockRejectedValue(new Error('storage full'));

    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'coloring', isImageFile), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).toEqual(['content://a.png']));
    expect(result.current.error).toBe(false);
  });

  it('retry() re-runs the load even when the folder uri is unchanged', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockRejectedValueOnce(new Error('flaky'));
    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'puzzle', isImageFile), { wrapper });
    await waitFor(() => expect(result.current.error).toBe(true));

    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue(['content://a.png']);
    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.items).toEqual(['content://a.png']));
  });

  it('enters selection mode on long-press, toggles items, and exits automatically when the selection empties', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://a.png',
      'content://b.png',
    ]);
    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'coloring', isImageFile), {
      wrapper,
    });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    await act(async () => { result.current.handleLongPress('content://a.png'); });
    expect(result.current.selectionMode).toBe(true);
    expect(result.current.selectedUris.has('content://a.png')).toBe(true);

    await act(async () => { result.current.toggleSelected('content://b.png'); });
    expect(result.current.selectedUris.size).toBe(2);

    await act(async () => { result.current.toggleSelected('content://a.png'); });
    await act(async () => { result.current.toggleSelected('content://b.png'); });
    // Selection emptied out via toggling, not Cancel — must auto-exit
    // selection mode, matching every gallery's pre-extraction behavior.
    expect(result.current.selectionMode).toBe(false);
  });

  it('handleCancelSelection exits selection mode and clears the selection', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue(['content://a.png']);
    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'coloring', isImageFile), {
      wrapper,
    });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    await act(async () => { result.current.handleLongPress('content://a.png'); });
    await act(async () => { result.current.handleCancelSelection(); });

    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedUris.size).toBe(0);
  });

  it('handleRemoveSelected asks for confirmation, then removes and reloads, passing the correct contentType through', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue(['content://a.png']);
    (galleryRemoval.removeGalleryItems as jest.Mock).mockResolvedValue({ removedCount: 1, failedCount: 0 });

    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'video', isImageFile), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    await act(async () => { result.current.handleLongPress('content://a.png'); });
    await act(async () => {
      result.current.handleRemoveSelected();
    });

    expect(Alert.alert).toHaveBeenCalled();
    await confirmRemoval();

    expect(galleryRemoval.removeGalleryItems).toHaveBeenCalledWith(
      'video',
      ['content://a.png'],
      expect.any(Set)
    );
    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedUris.size).toBe(0);
  });

  it('shows an error alert if any item fails to remove, but still exits selection mode', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue(['content://a.png']);
    (galleryRemoval.removeGalleryItems as jest.Mock).mockResolvedValue({ removedCount: 0, failedCount: 1 });

    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'puzzle', isImageFile), { wrapper });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    await act(async () => { result.current.handleLongPress('content://a.png'); });
    await act(async () => {
      result.current.handleRemoveSelected();
    });
    await confirmRemoval();

    expect(Alert.alert).toHaveBeenLastCalledWith("Some items couldn't be removed — please try again.");
    expect(result.current.selectionMode).toBe(false);
  });

  it('handleRemoveSelected is a no-op when nothing is selected', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue(['content://a.png']);
    const { result } = await renderHook(() => useSelectableGallery('content://folder', 'coloring', isImageFile), {
      wrapper,
    });
    await waitFor(() => expect(result.current.items).not.toBeNull());

    await act(async () => {
      result.current.handleRemoveSelected();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(galleryRemoval.removeGalleryItems).not.toHaveBeenCalled();
  });
});
