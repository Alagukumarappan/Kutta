import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import {
  seedSampleColoring,
  seedSamplePictures,
  seedSampleQuizImages,
  getSampleQuestionsJson,
} from '../../src/storage/sampleContent';

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
  StorageAccessFramework: {
    readDirectoryAsync: jest.fn(),
    createFileAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
  },
}));

// `Asset.fromModule(...).downloadAsync()` + `.localUri` is the SDK-official
// way to resolve a bundled require()'d asset to a real local file:// path in
// BOTH dev and release builds — replacing a previous
// `Image.resolveAssetSource` + `FileSystem.downloadAsync` approach that only
// ever worked while Metro's dev server was reachable (see sampleContent.ts's
// own comment): on a genuine installed release APK, the resolved URI is an
// Android `asset:///` URI, which `downloadAsync` cannot fetch since it's not
// a network request — every seed silently failed there despite passing here
// under the old mock and working fine against a Metro-connected dev build.
const mockDownloadAsync = jest.fn().mockResolvedValue(undefined);
const mockAssetState: { localUri: string | null } = { localUri: 'file:///bundled/sample-asset.png' };
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      downloadAsync: mockDownloadAsync,
      get localUri() {
        return mockAssetState.localUri;
      },
    })),
  },
}));

describe('sampleContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDownloadAsync.mockResolvedValue(undefined);
    mockAssetState.localUri = 'file:///bundled/sample-asset.png';
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('ZmFrZS1iYXNlNjQ=');
    (FileSystem.StorageAccessFramework.createFileAsync as jest.Mock).mockResolvedValue(
      'content://tree/dest/created-file'
    );
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
      expect(Asset.fromModule).toHaveBeenCalledTimes(5);
      expect(mockDownloadAsync).toHaveBeenCalledTimes(5);
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(5);
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///bundled/sample-asset.png', {
        encoding: 'base64',
      });
      expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledTimes(5);
      expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledTimes(5);
      expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledWith(
        'content://tree/dest/created-file',
        'ZmFrZS1iYXNlNjQ=',
        { encoding: 'base64' }
      );
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

      expect(mockDownloadAsync).not.toHaveBeenCalled();
      expect(FileSystem.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();
    });

    it('does nothing (and does not throw) when the folder cannot be listed', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockRejectedValue(
        new Error('SAF grant revoked')
      );

      await expect(seedSampleQuizImages('content://tree/quiz/images')).resolves.toBeUndefined();
      expect(mockDownloadAsync).not.toHaveBeenCalled();
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

    it('skips a sample whose bundled asset cannot be resolved to a local file, without throwing', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      mockAssetState.localUri = null;

      await expect(seedSamplePictures('content://tree/pictures')).resolves.toBeUndefined();

      expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
      expect(FileSystem.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();
    });

    it('continues seeding the remaining files when downloadAsync rejects for one sample', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      mockDownloadAsync.mockRejectedValueOnce(new Error('asset copy failed'));

      await expect(seedSampleColoring('content://tree/coloring')).resolves.toBeUndefined();

      expect(Asset.fromModule).toHaveBeenCalledTimes(5);
      // Only 4 of the 5 got past the failed download.
      expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledTimes(4);
    });
  });
});
