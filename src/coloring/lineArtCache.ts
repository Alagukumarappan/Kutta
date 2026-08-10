import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Skia, ColorType, AlphaType, ImageFormat } from '@shopify/react-native-skia';
import { base64ToUint8Array } from './base64';
import { looksPhotographic, convertToLineArt } from './lineArtConversion';

const CACHE_KEY = 'kutta.lineArtCache.v1';
const DERIVED_DIRNAME = 'kutta-line-art/';

interface CacheEntry {
  // Path to the derived PNG, or null when the source was already suitable
  // (not photographic) and should just be used as-is.
  derivedUri: string | null;
}

type CacheMap = Record<string, CacheEntry>;

// Resolved lazily, matching fileReferenceStore.ts's addedFilesDir() -- reading
// `documentDirectory` at import time would make this module's import order
// matter, and is undefined under a bare test mock.
function derivedDir(): string | null {
  const base = FileSystem.documentDirectory;
  return base ? `${base}${DERIVED_DIRNAME}` : null;
}

// Small, fast, deterministic string hash (FNV-1a) -- not cryptographic, just
// needs to turn an arbitrary source uri into a filesystem-safe filename that
// is stable for the same uri across app restarts, so the same source always
// maps to the same derived file.
function hashUri(uri: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < uri.length; i++) {
    hash ^= uri.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

async function readCacheMap(): Promise<CacheMap> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCacheMap(map: CacheMap): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(map));
}

export interface DisplayImage {
  uri: string;
  isConverted: boolean;
}

// The single entry point both ColoringGallery (thumbnail) and ColoringScreen
// (canvas) call. Converts a photographic source image to black-and-white
// line art the first time it's seen, caching the result so every later call
// is a cache hit with no reprocessing. Falls back to the original,
// unconverted source uri on ANY failure -- a slow or uncached photo is
// still usable for coloring; a broken screen is not.
export async function getDisplayImage(sourceUri: string): Promise<DisplayImage> {
  try {
    const map = await readCacheMap();
    const existing = map[sourceUri];
    if (existing) {
      if (existing.derivedUri === null) return { uri: sourceUri, isConverted: false };
      const info = await FileSystem.getInfoAsync(existing.derivedUri);
      if (info.exists) return { uri: existing.derivedUri, isConverted: true };
      // Derived file vanished from disk -- fall through and regenerate it
      // below instead of getting stuck pointing at a dead path forever.
    }

    const base64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToUint8Array(base64);
    const data = Skia.Data.fromBytes(bytes);
    const decoded = Skia.Image.MakeImageFromEncoded(data);
    if (!decoded) return { uri: sourceUri, isConverted: false };

    const width = decoded.width();
    const height = decoded.height();
    const pixelData = decoded.readPixels(0, 0, {
      width,
      height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });
    if (!pixelData) return { uri: sourceUri, isConverted: false };
    const pixels = new Uint8ClampedArray(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength);

    if (!looksPhotographic(pixels, width, height)) {
      await writeCacheMap({ ...map, [sourceUri]: { derivedUri: null } });
      return { uri: sourceUri, isConverted: false };
    }

    const converted = convertToLineArt(pixels, width, height);
    const bytesPerRow = width * 4;
    const convertedData = Skia.Data.fromBytes(
      new Uint8Array(converted.buffer, converted.byteOffset, converted.byteLength)
    );
    const convertedImage = Skia.Image.MakeImage(
      { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
      convertedData,
      bytesPerRow
    );
    if (!convertedImage) return { uri: sourceUri, isConverted: false };

    const pngBase64 = convertedImage.encodeToBase64(ImageFormat.PNG, 100);
    const dir = derivedDir();
    if (!dir) return { uri: sourceUri, isConverted: false };
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const destination = `${dir}${hashUri(sourceUri)}.png`;
    await FileSystem.writeAsStringAsync(destination, pngBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    await writeCacheMap({ ...map, [sourceUri]: { derivedUri: destination } });
    return { uri: destination, isConverted: true };
  } catch {
    return { uri: sourceUri, isConverted: false };
  }
}

// Deletes any cached derived image whose source is no longer in the
// gallery's current, valid uri list -- called once per gallery load so a
// picture removed by ANY path (multi-select removal, a folder-scan entry
// disappearing, a pruned individually-added reference) eventually has its
// derived file cleaned up, without needing a cleanup hook wired into every
// one of those separate removal call sites.
export async function pruneStaleDerivedImages(currentSourceUris: readonly string[]): Promise<void> {
  const map = await readCacheMap();
  const currentSet = new Set(currentSourceUris);
  const staleKeys = Object.keys(map).filter((uri) => !currentSet.has(uri));
  if (staleKeys.length === 0) return;

  await Promise.all(
    staleKeys.map(async (uri) => {
      const entry = map[uri];
      if (entry.derivedUri) {
        try {
          await FileSystem.deleteAsync(entry.derivedUri, { idempotent: true });
        } catch {
          // Best-effort -- matches removeGalleryItems/clearAllFileReferences's
          // established "one bad item doesn't block the rest" convention.
        }
      }
      delete map[uri];
    })
  );
  await writeCacheMap(map);
}

// Used by Settings' "Reset everything" flow alongside clearAllFileReferences
// -- without this, every derived line-art image from the previous child's
// pictures would be left behind in this app's own storage indefinitely.
export async function clearLineArtCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
  const dir = derivedDir();
  if (dir) {
    try {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    } catch {
      // ignored -- see clearAllFileReferences for the same convention.
    }
  }
}
