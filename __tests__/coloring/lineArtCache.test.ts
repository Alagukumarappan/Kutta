import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Skia } from '@shopify/react-native-skia';
import { getDisplayImage, pruneStaleDerivedImages, clearLineArtCache } from '../../src/coloring/lineArtCache';
import { looksPhotographic, convertToLineArt } from '../../src/coloring/lineArtConversion';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('../../src/coloring/lineArtConversion', () => ({
  looksPhotographic: jest.fn(),
  convertToLineArt: jest.fn(),
}));

const mockDecodedImage = {
  width: () => 100,
  height: () => 80,
  readPixels: jest.fn(() => ({ buffer: new ArrayBuffer(100 * 80 * 4), byteOffset: 0, byteLength: 100 * 80 * 4 })),
};

jest.mock('@shopify/react-native-skia', () => ({
  Skia: {
    Data: { fromBytes: jest.fn(() => 'fake-data') },
    Image: {
      MakeImageFromEncoded: jest.fn(),
      MakeImage: jest.fn(() => ({
        encodeToBase64: jest.fn(() => 'ZmFrZS1wbmc='),
      })),
    },
  },
  ColorType: { RGBA_8888: 'rgba8888' },
  AlphaType: { Unpremul: 'unpremul' },
  ImageFormat: { PNG: 'png' },
}));

describe('lineArtCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('ZmFrZS1zb3VyY2U=');
    (Skia.Image.MakeImageFromEncoded as jest.Mock).mockReturnValue(mockDecodedImage);
  });

  describe('getDisplayImage', () => {
    it('returns the original uri, unconverted, for a non-photographic image, and records that decision', async () => {
      (looksPhotographic as jest.Mock).mockReturnValue(false);

      const result = await getDisplayImage('content://source/hero.png');

      expect(result).toEqual({ uri: 'content://source/hero.png', isConverted: false });
      expect(convertToLineArt).not.toHaveBeenCalled();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('content://source/hero.png')
      );
    });

    it('converts and caches a photographic image, writing a PNG under documentDirectory', async () => {
      (looksPhotographic as jest.Mock).mockReturnValue(true);
      (convertToLineArt as jest.Mock).mockReturnValue(new Uint8ClampedArray(100 * 80 * 4));

      const result = await getDisplayImage('content://source/photo.jpg');

      expect(result.isConverted).toBe(true);
      expect(result.uri).toMatch(/^file:\/\/\/docs\/kutta-line-art\/.+\.png$/);
      expect(FileSystem.makeDirectoryAsync).toHaveBeenCalled();
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(result.uri, 'ZmFrZS1wbmc=', { encoding: 'base64' });
    });

    it('returns the same derived uri on a second call without re-decoding (cache hit)', async () => {
      (looksPhotographic as jest.Mock).mockReturnValue(true);
      (convertToLineArt as jest.Mock).mockReturnValue(new Uint8ClampedArray(100 * 80 * 4));

      const first = await getDisplayImage('content://source/photo.jpg');

      jest.clearAllMocks();
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify({ 'content://source/photo.jpg': { derivedUri: first.uri } })
      );
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

      const second = await getDisplayImage('content://source/photo.jpg');

      expect(second).toEqual({ uri: first.uri, isConverted: true });
      expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
      expect(looksPhotographic).not.toHaveBeenCalled();
    });

    it('regenerates when a cached derived file has vanished from disk', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify({ 'content://source/photo.jpg': { derivedUri: 'file:///docs/kutta-line-art/stale.png' } })
      );
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      (looksPhotographic as jest.Mock).mockReturnValue(true);
      (convertToLineArt as jest.Mock).mockReturnValue(new Uint8ClampedArray(100 * 80 * 4));

      const result = await getDisplayImage('content://source/photo.jpg');

      expect(result.isConverted).toBe(true);
      expect(FileSystem.readAsStringAsync).toHaveBeenCalled();
    });

    it('falls back to the original uri, unconverted, when the source cannot be decoded', async () => {
      (Skia.Image.MakeImageFromEncoded as jest.Mock).mockReturnValue(null);

      const result = await getDisplayImage('content://source/corrupt.jpg');

      expect(result).toEqual({ uri: 'content://source/corrupt.jpg', isConverted: false });
    });

    it('falls back to the original uri, unconverted, when reading the source throws', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(new Error('SAF grant revoked'));

      const result = await getDisplayImage('content://source/unreachable.jpg');

      expect(result).toEqual({ uri: 'content://source/unreachable.jpg', isConverted: false });
    });
  });

  describe('pruneStaleDerivedImages', () => {
    it('deletes derived files and mapping entries for sources no longer present', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify({
          'content://source/still-here.jpg': { derivedUri: 'file:///docs/kutta-line-art/a.png' },
          'content://source/gone.jpg': { derivedUri: 'file:///docs/kutta-line-art/b.png' },
          'content://source/gone-not-converted.jpg': { derivedUri: null },
        })
      );

      await pruneStaleDerivedImages(['content://source/still-here.jpg']);

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///docs/kutta-line-art/b.png', { idempotent: true });
      expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
      const [, savedJson] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const saved = JSON.parse(savedJson);
      expect(Object.keys(saved)).toEqual(['content://source/still-here.jpg']);
    });

    it('does nothing when every cached source is still present', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify({ 'content://source/still-here.jpg': { derivedUri: 'file:///docs/kutta-line-art/a.png' } })
      );

      await pruneStaleDerivedImages(['content://source/still-here.jpg']);

      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('clearLineArtCache', () => {
    it('removes the cache mapping and deletes the whole derived-image directory', async () => {
      await clearLineArtCache();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(expect.any(String));
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///docs/kutta-line-art/', { idempotent: true });
    });
  });
});
