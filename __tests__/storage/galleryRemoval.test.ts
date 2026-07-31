import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { removeGalleryItems } from '../../src/storage/galleryRemoval';
import { addFileReferences, getFileReferences } from '../../src/storage/fileReferenceStore';

jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: {
    deleteAsync: jest.fn(),
  },
}));

describe('removeGalleryItems', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    (FileSystem.StorageAccessFramework.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('removes a referenced uri as a reference only, never touching the real file', async () => {
    await addFileReferences('coloring', ['content://picked/dog.png']);

    const result = await removeGalleryItems('coloring', ['content://picked/dog.png'], new Set(['content://picked/dog.png']));

    expect(result).toEqual({ removedCount: 1, failedCount: 0 });
    expect(await getFileReferences('coloring')).toEqual([]);
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
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
