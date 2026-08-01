import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getFileReferences,
  addFileReferences,
  removeFileReference,
  pruneMissingFileReferences,
  clearAllFileReferences,
} from '../../src/storage/fileReferenceStore';

jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
}));

describe('fileReferenceStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe('getFileReferences / addFileReferences', () => {
    it('returns an empty array when nothing has been added yet', async () => {
      expect(await getFileReferences('coloring')).toEqual([]);
    });

    it('adds new references and persists them', async () => {
      const refs = await addFileReferences('coloring', ['content://tree/a.png', 'content://tree/b.png']);
      expect(refs.map((r) => r.uri)).toEqual(['content://tree/a.png', 'content://tree/b.png']);
      expect(await getFileReferences('coloring')).toEqual(refs);
    });

    it('keeps content types independent of one another', async () => {
      await addFileReferences('coloring', ['content://tree/a.png']);
      await addFileReferences('video', ['content://tree/a.mp4']);
      expect(await getFileReferences('coloring')).toHaveLength(1);
      expect(await getFileReferences('video')).toHaveLength(1);
    });

    it('does not duplicate a uri that is added twice', async () => {
      await addFileReferences('puzzle', ['content://tree/a.jpg']);
      const refs = await addFileReferences('puzzle', ['content://tree/a.jpg', 'content://tree/b.jpg']);
      expect(refs.map((r) => r.uri)).toEqual(['content://tree/a.jpg', 'content://tree/b.jpg']);
    });

    it('ignores malformed stored JSON rather than throwing', async () => {
      await AsyncStorage.setItem('kutta.fileRefs.coloring.v1', 'not json');
      expect(await getFileReferences('coloring')).toEqual([]);
    });

    it('ignores a stored value that is not an array', async () => {
      await AsyncStorage.setItem('kutta.fileRefs.coloring.v1', JSON.stringify({ oops: true }));
      expect(await getFileReferences('coloring')).toEqual([]);
    });

    it('filters out malformed individual entries but keeps the well-formed ones', async () => {
      await AsyncStorage.setItem(
        'kutta.fileRefs.coloring.v1',
        JSON.stringify([{ uri: 'content://tree/good.png', addedAt: 1 }, { oops: true }, null, 'not-an-object'])
      );
      expect(await getFileReferences('coloring')).toEqual([{ uri: 'content://tree/good.png', addedAt: 1 }]);
    });
  });

  describe('removeFileReference', () => {
    it('removes only the given uri, leaving the others intact', async () => {
      await addFileReferences('coloring', ['content://tree/a.png', 'content://tree/b.png', 'content://tree/c.png']);

      const remaining = await removeFileReference('coloring', 'content://tree/b.png');

      expect(remaining.map((r) => r.uri)).toEqual(['content://tree/a.png', 'content://tree/c.png']);
      expect((await getFileReferences('coloring')).map((r) => r.uri)).toEqual([
        'content://tree/a.png',
        'content://tree/c.png',
      ]);
    });

    it('is a no-op (and does not rewrite storage) when the uri is not present', async () => {
      await addFileReferences('video', ['content://tree/a.mp4']);
      const setItemSpy = jest.spyOn(AsyncStorage, 'setItem');
      setItemSpy.mockClear();

      const remaining = await removeFileReference('video', 'content://tree/not-there.mp4');

      expect(remaining.map((r) => r.uri)).toEqual(['content://tree/a.mp4']);
      expect(setItemSpy).not.toHaveBeenCalled();
    });

    it('does not affect other content types', async () => {
      await addFileReferences('puzzle', ['content://tree/shared-name.jpg']);
      await addFileReferences('coloring', ['content://tree/shared-name.jpg']);

      await removeFileReference('puzzle', 'content://tree/shared-name.jpg');

      expect(await getFileReferences('puzzle')).toEqual([]);
      expect((await getFileReferences('coloring')).map((r) => r.uri)).toEqual(['content://tree/shared-name.jpg']);
    });
  });

  describe('pruneMissingFileReferences', () => {
    it('keeps references whose file still exists', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      await addFileReferences('coloring', ['content://tree/a.png']);

      const valid = await pruneMissingFileReferences('coloring');
      expect(valid).toEqual(['content://tree/a.png']);
      expect(await getFileReferences('coloring')).toHaveLength(1);
    });

    it('drops only the missing reference, leaving the others intact', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (uri: string) => ({
        exists: uri !== 'content://tree/gone.png',
      }));
      await addFileReferences('coloring', ['content://tree/a.png', 'content://tree/gone.png', 'content://tree/b.png']);

      const valid = await pruneMissingFileReferences('coloring');
      expect(valid).toEqual(['content://tree/a.png', 'content://tree/b.png']);

      const stored = await getFileReferences('coloring');
      expect(stored.map((r) => r.uri)).toEqual(['content://tree/a.png', 'content://tree/b.png']);
    });

    it('treats a getInfoAsync rejection (e.g. a revoked SAF grant) the same as a missing file', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValue(new Error('permission revoked'));
      await addFileReferences('video', ['content://tree/a.mp4']);

      const valid = await pruneMissingFileReferences('video');
      expect(valid).toEqual([]);
      expect(await getFileReferences('video')).toEqual([]);
    });

    it('does not rewrite storage when nothing needed pruning', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      await addFileReferences('puzzle', ['content://tree/a.jpg']);
      const setItemSpy = jest.spyOn(AsyncStorage, 'setItem');
      setItemSpy.mockClear();

      await pruneMissingFileReferences('puzzle');
      expect(setItemSpy).not.toHaveBeenCalled();
    });

    it('returns an empty array and writes nothing when there are no references at all', async () => {
      const setItemSpy = jest.spyOn(AsyncStorage, 'setItem');
      setItemSpy.mockClear();

      const valid = await pruneMissingFileReferences('coloring');
      expect(valid).toEqual([]);
      expect(setItemSpy).not.toHaveBeenCalled();
    });
  });

  // Regression tests for a real cross-profile data-leak bug fix: these
  // references are keyed globally (kutta.fileRefs.<type>.v1), not scoped to
  // any one profile, so without a way to clear them a fresh profile created
  // after Settings' "Reset everything" would silently inherit every file the
  // PREVIOUS child's parent had individually added.
  describe('clearAllFileReferences', () => {
    it('clears references across every content type, not just one', async () => {
      await addFileReferences('coloring', ['content://tree/a.jpg']);
      await addFileReferences('puzzle', ['content://tree/b.jpg']);
      await addFileReferences('video', ['content://tree/c.mp4']);

      await clearAllFileReferences();

      expect(await getFileReferences('coloring')).toEqual([]);
      expect(await getFileReferences('puzzle')).toEqual([]);
      expect(await getFileReferences('video')).toEqual([]);
    });

    it('does not throw when there was nothing to clear', async () => {
      await expect(clearAllFileReferences()).resolves.toBeUndefined();
    });
  });
});
