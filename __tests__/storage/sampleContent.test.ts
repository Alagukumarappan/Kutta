import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';
import {
  seedSampleColoring,
  seedSamplePictures,
  seedSampleQuizImages,
  getSampleQuestionsJson,
} from '../../src/storage/sampleContent';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
  StorageAccessFramework: {
    readDirectoryAsync: jest.fn(),
    createFileAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
  },
}));

describe('sampleContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ uri: 'file:///cache/downloaded' });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('ZmFrZS1iYXNlNjQ=');
    (FileSystem.StorageAccessFramework.createFileAsync as jest.Mock).mockResolvedValue(
      'content://tree/dest/created-file'
    );
    // Jest's environment doesn't run Metro's real asset-registration
    // pipeline, so a require()'d image module resolves to nothing usable
    // here by default — stub it the way the bundled app actually behaves
    // (a real, loadable asset URI) for every test except the one below that
    // deliberately exercises the "can't be resolved" fallback.
    jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({ uri: 'asset:///bundled-sample.png' } as any);
  });

  describe('getSampleQuestionsJson', () => {
    it('returns parseable JSON with a non-empty questions array', () => {
      const parsed = JSON.parse(getSampleQuestionsJson());
      expect(Array.isArray(parsed.questions)).toBe(true);
      expect(parsed.questions.length).toBeGreaterThan(0);
    });
  });

  describe('seedSampleColoring / seedSamplePictures / seedSampleQuizImages', () => {
    it('copies every sample file into a genuinely empty folder by reading it back as base64 and writing it into the SAF folder', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      await seedSampleColoring('content://tree/coloring');

      // 5 sample coloring images, per sampleContent.ts's SAMPLE_COLORING list.
      // This deliberately does NOT use StorageAccessFramework.copyAsync — its
      // native Android implementation doesn't support a file:// source being
      // copied into a content:// SAF directory destination (verified against
      // FileSystemLegacyModule.kt), which silently failed every seed copy on
      // a real device despite passing here when that mock returned success.
      expect(FileSystem.downloadAsync).toHaveBeenCalledTimes(5);
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(5);
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///cache/downloaded', {
        encoding: 'base64',
      });
      expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledTimes(5);
      expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledTimes(5);
      expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledWith(
        'content://tree/dest/created-file',
        'ZmFrZS1iYXNlNjQ=',
        { encoding: 'base64' }
      );
      // Each downloaded cache file is cleaned up afterward.
      expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(5);
    });

    it('creates each destination file with the same name and mime type as the sample', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      await seedSampleColoring('content://tree/coloring');

      expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
        'content://tree/coloring',
        'barbie.png',
        'image/png'
      );
      expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
        'content://tree/coloring',
        'bunny.jpeg',
        'image/jpeg'
      );
    });

    it('does nothing when the destination folder already has content', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/pictures/existing.jpg',
      ]);

      await seedSamplePictures('content://tree/pictures');

      expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
      expect(FileSystem.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();
    });

    it('does nothing (and does not throw) when the folder cannot be listed', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockRejectedValue(
        new Error('SAF grant revoked')
      );

      await expect(seedSampleQuizImages('content://tree/quiz/images')).resolves.toBeUndefined();
      expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
    });

    it('continues seeding the remaining files when one write fails partway through', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      (FileSystem.StorageAccessFramework.writeAsStringAsync as jest.Mock)
        .mockRejectedValueOnce(new Error('destination briefly unavailable'))
        .mockResolvedValue(undefined);

      await expect(seedSampleColoring('content://tree/coloring')).resolves.toBeUndefined();

      // All 5 were attempted despite the first one failing.
      expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledTimes(5);
    });

    it('skips a sample whose bundled asset cannot be resolved, without throwing', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      const resolveSpy = jest.spyOn(Image, 'resolveAssetSource').mockReturnValue(undefined as any);

      await expect(seedSamplePictures('content://tree/pictures')).resolves.toBeUndefined();

      expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
      resolveSpy.mockRestore();
    });
  });
});
