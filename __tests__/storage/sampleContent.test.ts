import { Image } from 'react-native';
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

// Resolving through React Native core's OWN `Image.resolveAssetSource` first
// (mocked here to return a bare Android resource identifier, e.g. "z6" -
// exactly what a real release build actually returns, no scheme/colon), then
// handing that to `Asset.fromURI`, is the real fix for a genuine bug found by
// extracting an actual built release APK: `expo-asset`'s OWN internal
// resolver (a separate reimplementation, not a re-export of React Native
// core's) unconditionally builds a fake "https://expo.dev/..." URL for any
// app not using expo-updates, even for a purely local bundled asset — so
// `Asset.fromModule(module).downloadAsync()` genuinely tried to fetch that
// fake URL over the network and failed, EVERY time, on a real release APK,
// despite passing under a naive mock and working fine in a Metro-connected
// dev build (see sampleContent.ts's own comment for the full trace). Mocking
// at the `Image.resolveAssetSource`/`Asset.fromURI` boundary (rather than
// mocking `Asset.fromModule` directly, as this suite used to) means these
// tests actually exercise the real seam where that bug lived.
const mockDownloadAsync = jest.fn().mockResolvedValue(undefined);
const mockAssetState: { localUri: string | null } = { localUri: 'file:///bundled/sample-asset.png' };
jest.mock('expo-asset', () => ({
  Asset: {
    fromURI: jest.fn(() => ({
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
    // Mirrors what a real release build actually returns: a bare Android
    // resource identifier (no scheme, no colon) - not a network URL.
    jest.spyOn(Image, 'resolveAssetSource').mockImplementation((module) => ({
      uri: `resolved-resource-${module}`,
      width: 100,
      height: 100,
      scale: 1,
    }));
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
      expect(Image.resolveAssetSource).toHaveBeenCalledTimes(5);
      expect(Asset.fromURI).toHaveBeenCalledTimes(5);
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

    // Regression test for the real release-APK bug: `expo-asset`'s
    // `Asset.fromModule` resolves a bundled module's URI ITSELF internally,
    // via a broken code path that always builds a fake network URL. The fix
    // resolves the URI through React Native core's `Image.resolveAssetSource`
    // FIRST, then hands that (correct, bare-resource-identifier) URI to
    // `Asset.fromURI` — this test pins down that exact hand-off, which the
    // old `Asset.fromModule`-based code (and a mock of it) couldn't
    // distinguish from the broken version at all.
    it('resolves each sample through Image.resolveAssetSource before handing the URI to Asset.fromURI', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      await seedSamplePictures('content://tree/pictures');

      const resolvedCalls = (Image.resolveAssetSource as jest.Mock).mock.results.map((r) => r.value.uri);
      const fromURICalls = (Asset.fromURI as jest.Mock).mock.calls.map((c) => c[0]);
      expect(fromURICalls.sort()).toEqual(resolvedCalls.sort());
    });

    it('creates each destination file with the same name and mime type as the sample', async () => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      await seedSampleColoring('content://tree/coloring');

      expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
        'content://tree/coloring',
        'hero.png',
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

      expect(Image.resolveAssetSource).toHaveBeenCalledTimes(5);
      expect(Asset.fromURI).toHaveBeenCalledTimes(5);
      // Only 4 of the 5 got past the failed download.
      expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledTimes(4);
    });
  });
});
