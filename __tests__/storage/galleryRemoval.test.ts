import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { removeGalleryItems } from '../../src/storage/galleryRemoval';
import { addFileReferences, getFileReferences } from '../../src/storage/fileReferenceStore';

jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/app/',
  deleteAsync: jest.fn(),
  StorageAccessFramework: {
    deleteAsync: jest.fn(),
  },
}));

const APP_OWNED = 'file:///data/app/kutta-added/1700000000000-0-dog.png';

describe('removeGalleryItems', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    (FileSystem.StorageAccessFramework.deleteAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  // A picked IMAGE is copied into the app's own storage when added, so that
  // copy has no other owner: dropping only the reference used to leak it
  // forever into app-private storage the OS never reclaims and the parent
  // can't see or clean up.
  it('also deletes the bytes when the reference points at a copy this app owns', async () => {
    await addFileReferences('coloring', [APP_OWNED]);

    const result = await removeGalleryItems('coloring', [APP_OWNED], new Set([APP_OWNED]));

    expect(result).toEqual({ removedCount: 1, failedCount: 0 });
    expect(await getFileReferences('coloring')).toEqual([]);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(APP_OWNED, { idempotent: true });
    // Never routed through SAF — this is a plain app-private file.
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
  });

  // The delete is a tidy-up, not the thing the parent asked for: the
  // reference is already gone, so the removal must still report success.
  it('still reports success when deleting an app-owned copy fails', async () => {
    (FileSystem.deleteAsync as jest.Mock).mockRejectedValue(new Error('read-only'));
    await addFileReferences('coloring', [APP_OWNED]);

    const result = await removeGalleryItems('coloring', [APP_OWNED], new Set([APP_OWNED]));

    expect(result).toEqual({ removedCount: 1, failedCount: 0 });
    expect(await getFileReferences('coloring')).toEqual([]);
  });

  it('removes a referenced uri as a reference only, never touching the real file', async () => {
    await addFileReferences('coloring', ['content://picked/dog.png']);

    const result = await removeGalleryItems('coloring', ['content://picked/dog.png'], new Set(['content://picked/dog.png']));

    expect(result).toEqual({ removedCount: 1, failedCount: 0 });
    expect(await getFileReferences('coloring')).toEqual([]);
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
    // Not app-owned (it still lives wherever the parent picked it from), so
    // the bytes themselves must be left completely alone.
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it('deletes a folder-sourced uri as a real file, never touching the reference store', async () => {
    await addFileReferences('puzzle', ['content://picked/other.jpg']);

    const result = await removeGalleryItems('puzzle', ['content://tree/pictures/beach.jpg'], new Set(['content://picked/other.jpg']));

    expect(result).toEqual({ removedCount: 1, failedCount: 0 });
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith('content://tree/pictures/beach.jpg', {
      idempotent: true,
    });
    // The unrelated reference is untouched.
    expect((await getFileReferences('puzzle')).map((r) => r.uri)).toEqual(['content://picked/other.jpg']);
  });

  it('handles a mixed batch of referenced and folder-sourced uris correctly', async () => {
    await addFileReferences('video', ['content://picked/a.mp4', 'content://picked/b.mp4']);

    const result = await removeGalleryItems(
      'video',
      ['content://picked/a.mp4', 'content://tree/videos/party.mp4'],
      new Set(['content://picked/a.mp4', 'content://picked/b.mp4'])
    );

    expect(result).toEqual({ removedCount: 2, failedCount: 0 });
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledTimes(1);
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith('content://tree/videos/party.mp4', {
      idempotent: true,
    });
    expect((await getFileReferences('video')).map((r) => r.uri)).toEqual(['content://picked/b.mp4']);
  });

  it('continues removing the rest of the batch when one item fails', async () => {
    (FileSystem.StorageAccessFramework.deleteAsync as jest.Mock)
      .mockRejectedValueOnce(new Error('permission revoked'))
      .mockResolvedValue(undefined);

    const result = await removeGalleryItems(
      'coloring',
      ['content://tree/coloring/gone.png', 'content://tree/coloring/still-there.png'],
      new Set()
    );

    expect(result).toEqual({ removedCount: 1, failedCount: 1 });
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledTimes(2);
  });

  it('returns zero counts for an empty selection', async () => {
    const result = await removeGalleryItems('coloring', [], new Set());
    expect(result).toEqual({ removedCount: 0, failedCount: 0 });
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
  });
});
