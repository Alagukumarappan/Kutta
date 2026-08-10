# Coloring Line-Art Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any photographic image that ends up in the coloring gallery (via the "+" Add button or dropped straight into the parent's coloring folder) is automatically converted to black-and-white line art before it's shown or colored, so the flood-fill tool works on it the same way it does on the bundled samples.

**Architecture:** Two new pure modules (`lineArtConversion.ts` for the detection/conversion algorithms, `lineArtCache.ts` for the on-device cache/orchestration) plug into the existing `ColoringGallery.tsx` (thumbnail) and `ColoringScreen.tsx` (canvas load) call sites, both going through the same `getDisplayImage()` entry point so the preview and the actual coloring page always match.

**Tech Stack:** React Native + Expo, `@shopify/react-native-skia` (already a dependency — no new libraries), `expo-file-system/legacy`, `@react-native-async-storage/async-storage`, Jest + `@testing-library/react-native`.

## Global Constraints

- No new native dependency. Reuse `@shopify/react-native-skia` APIs already available: `Skia.Data.fromBytes`, `Skia.Image.MakeImageFromEncoded`, `image.readPixels`, `Skia.Image.MakeImage`, `image.encodeToBase64`.
- Fully offline — nothing here may make a network request.
- Never modify or overwrite a parent's original file. Derived images are always separate files this app owns.
- No Co-Authored-By in any commit message.
- Do not touch `jest.config.js`, `babel.config.js`, or `tsconfig.json`.
- Full suite (`npm test`) and `npx tsc --noEmit` must stay clean after every task.
- Full spec: `docs/superpowers/specs/2026-08-07-coloring-line-art-conversion-design.md`.

---

### Task 1: `looksPhotographic` — detect photo vs. flat illustration

**Files:**
- Create: `src/coloring/lineArtConversion.ts`
- Test: `__tests__/coloring/lineArtConversion.test.ts`

**Interfaces:**
- Produces: `looksPhotographic(pixels: Uint8ClampedArray, width: number, height: number): boolean` — pure function, no Skia/React Native imports. `pixels` is a flat RGBA buffer (4 bytes per pixel, row-major), matching the shape `floodFill.ts` already uses.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/coloring/lineArtConversion.test.ts`:

```ts
import { looksPhotographic } from '../../src/coloring/lineArtConversion';

function makeSolidBuffer(width: number, height: number, r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = a;
  }
  return pixels;
}

// Deterministic RGB "noise" -- each channel is a different linear mix of
// (x, y), so every sampled pixel gets a distinct color the way a real
// photo's continuous gradients/texture do (unlike a true random generator,
// this guarantees high variety even across a sparse sample grid).
function makeNoiseBuffer(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = (x * 13 + y * 97) % 256;
      pixels[i + 1] = (x * 61 + y * 17) % 256;
      pixels[i + 2] = (x * 29 + y * 53) % 256;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

// A handful of large flat-colored blocks -- what flat clip art (e.g. the
// bundled hero.png) looks like: a small, fixed palette of solid fills.
function makeFlatIllustrationBuffer(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const palette = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = palette[(x + y) % palette.length];
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

describe('looksPhotographic', () => {
  it('is false for a single flat color (a blank/solid region)', () => {
    const pixels = makeSolidBuffer(64, 64, 200, 100, 50);
    expect(looksPhotographic(pixels, 64, 64)).toBe(false);
  });

  it('is false for an already-grayscale line-art style image (black/white only)', () => {
    const pixels = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) {
      const shade = i % 2 === 0 ? 0 : 255;
      pixels[i * 4] = shade;
      pixels[i * 4 + 1] = shade;
      pixels[i * 4 + 2] = shade;
      pixels[i * 4 + 3] = 255;
    }
    expect(looksPhotographic(pixels, 64, 64)).toBe(false);
  });

  it('is false for flat clip art with a handful of solid-colored regions', () => {
    const pixels = makeFlatIllustrationBuffer(64, 64);
    expect(looksPhotographic(pixels, 64, 64)).toBe(false);
  });

  it('is true for photographic noise (many distinct colors, like a real photo)', () => {
    const pixels = makeNoiseBuffer(64, 64);
    expect(looksPhotographic(pixels, 64, 64)).toBe(true);
  });

  it('does not crash on an image smaller than the sample stride', () => {
    const pixels = makeSolidBuffer(2, 2, 10, 20, 30);
    expect(() => looksPhotographic(pixels, 2, 2)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/coloring/lineArtConversion.test.ts`
Expected: FAIL — `Cannot find module '../../src/coloring/lineArtConversion'`

- [ ] **Step 3: Write the implementation**

Create `src/coloring/lineArtConversion.ts`:

```ts
// Pure pixel-buffer functions -- no Skia or React Native imports, so these
// can be unit tested with plain synthetic buffers and reused from
// lineArtCache.ts without pulling in any platform dependency here.

// Samples every Nth pixel along each axis rather than every pixel, for
// speed on a large (up to 1600px, see ColoringScreen.tsx's
// MAX_PIXEL_BUFFER_DIMENSION) photo. 7 is prime, so the sample grid can't
// land in lock-step with a real photo's own periodic patterns (a tiled
// texture, a grid of windows) the way an even stride like 8 sometimes can.
const SAMPLE_STRIDE = 7;

// Each channel is quantized to 4 bits (16 levels) before counting distinct
// colors -- coarse enough that a flat illustration's antialiased edges
// (a handful of in-between blend pixels at each shape boundary) don't get
// counted as new distinct colors, but fine enough that a real photo's
// continuous gradients and texture still produce hundreds of distinct
// buckets.
const QUANTIZE_BITS = 4;

// A photo produces far more than this many distinct quantized colors even
// at a sparse sample; flat clip art or existing line art -- a small, fixed
// palette of solid fills -- does not. Chosen well above what any bundled
// sample or plausible hand-drawn clip art produces (see the "flat
// illustration" test case), and well below what real photographic noise
// produces even in a small sampled region.
const PHOTOGRAPHIC_DISTINCT_COLOR_THRESHOLD = 40;

// True when `pixels` looks like a real photograph (continuous gradients,
// texture, noise) rather than a flat illustration or existing line art --
// the two cases described in the coloring line-art conversion design doc
// (docs/superpowers/specs/2026-08-07-coloring-line-art-conversion-design.md).
// Only photographic images should be converted: converting an
// already-suitable flat-colored image (like the bundled hero.png) would
// replace a good coloring page with a worse one.
export function looksPhotographic(pixels: Uint8ClampedArray, width: number, height: number): boolean {
  const seen = new Set<number>();
  const shift = 8 - QUANTIZE_BITS;

  for (let y = 0; y < height; y += SAMPLE_STRIDE) {
    for (let x = 0; x < width; x += SAMPLE_STRIDE) {
      const i = (y * width + x) * 4;
      const r = pixels[i] >> shift;
      const g = pixels[i + 1] >> shift;
      const b = pixels[i + 2] >> shift;
      const key = (r << (QUANTIZE_BITS * 2)) | (g << QUANTIZE_BITS) | b;
      seen.add(key);
      if (seen.size > PHOTOGRAPHIC_DISTINCT_COLOR_THRESHOLD) return true;
    }
  }

  return seen.size > PHOTOGRAPHIC_DISTINCT_COLOR_THRESHOLD;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/coloring/lineArtConversion.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/coloring/lineArtConversion.ts __tests__/coloring/lineArtConversion.test.ts
git commit -m "Add looksPhotographic detector for the coloring line-art conversion"
```

---

### Task 2: `convertToLineArt` — Sobel edge detection on a pixel buffer

**Files:**
- Modify: `src/coloring/lineArtConversion.ts`
- Test: `__tests__/coloring/lineArtConversion.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (independent function in the same file).
- Produces: `convertToLineArt(pixels: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray` — pure function. Input/output are both flat RGBA buffers of the same dimensions. Output pixels are either pure black `[0,0,0,255]` (an edge) or pure white `[255,255,255,255]` (not an edge).

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/coloring/lineArtConversion.test.ts`:

```ts
import { convertToLineArt } from '../../src/coloring/lineArtConversion';

function pixelAt(buffer: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3]];
}

describe('convertToLineArt', () => {
  it('produces an all-white result for a perfectly flat, edgeless image', () => {
    const width = 10;
    const height = 10;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      pixels[i * 4] = 128;
      pixels[i * 4 + 1] = 128;
      pixels[i * 4 + 2] = 128;
      pixels[i * 4 + 3] = 255;
    }

    const result = convertToLineArt(pixels, width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        expect(pixelAt(result, width, x, y)).toEqual([255, 255, 255, 255]);
      }
    }
  });

  it('marks a hard vertical color boundary as a black edge', () => {
    const width = 10;
    const height = 10;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const shade = x < width / 2 ? 0 : 255;
        pixels[i] = shade;
        pixels[i + 1] = shade;
        pixels[i + 2] = shade;
        pixels[i + 3] = 255;
      }
    }

    const result = convertToLineArt(pixels, width, height);

    // The column(s) straddling the boundary (x=4 and x=5) must be edges;
    // a column far from the boundary (x=1, deep in the black region) must
    // not be, since it has no neighbouring contrast at all.
    expect(pixelAt(result, width, 4, 5)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(result, width, 1, 5)).toEqual([255, 255, 255, 255]);
  });

  it('always returns opaque pixels (alpha 255), never a transparency mask', () => {
    const width = 4;
    const height = 4;
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    const result = convertToLineArt(pixels, width, height);
    for (let i = 0; i < width * height; i++) {
      expect(result[i * 4 + 3]).toBe(255);
    }
  });

  it('returns a buffer of the same length as the input', () => {
    const width = 8;
    const height = 6;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const result = convertToLineArt(pixels, width, height);
    expect(result.length).toBe(pixels.length);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/coloring/lineArtConversion.test.ts`
Expected: FAIL — `convertToLineArt is not a function` (4 new failures, the 5 from Task 1 still pass)

- [ ] **Step 3: Write the implementation**

Append to `src/coloring/lineArtConversion.ts`:

```ts
// Standard Sobel 3x3 kernels for horizontal (Gx) and vertical (Gy) gradient.
const SOBEL_GX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
const SOBEL_GY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

// A pixel whose combined gradient magnitude is at or above this is drawn as
// a black outline; below it, white. Tuned so a hard boundary (see the
// "hard vertical color boundary" test) is reliably caught while flat
// mid-tone noise within a single region is not.
const EDGE_MAGNITUDE_THRESHOLD = 80;

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Converts a photographic pixel buffer into black-and-white line art: a
// standard Sobel edge detector run on the buffer's grayscale luminance,
// thresholded to pure black (edge) / white (not an edge). Operates on the
// same flat RGBA buffer shape floodFill.ts already uses, so lineArtCache.ts
// can round-trip it through the same
// `image.readPixels` -> process -> `Skia.Image.MakeImage` pattern
// ColoringScreen.tsx already establishes for its own pixel work.
export function convertToLineArt(pixels: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    gray[i] = luminance(pixels[base], pixels[base + 1], pixels[base + 2]);
  }

  const result = new Uint8ClampedArray(pixels.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let gx = 0;
      let gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          // Clamp-to-edge at the image boundary, rather than wrapping or
          // zero-padding, so the outermost pixels don't read a false edge
          // against an assumed black/transparent border.
          const sx = Math.min(width - 1, Math.max(0, x + kx));
          const sy = Math.min(height - 1, Math.max(0, y + ky));
          const value = gray[sy * width + sx];
          const kernelIndex = (ky + 1) * 3 + (kx + 1);
          gx += value * SOBEL_GX[kernelIndex];
          gy += value * SOBEL_GY[kernelIndex];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const shade = magnitude >= EDGE_MAGNITUDE_THRESHOLD ? 0 : 255;
      const outIndex = (y * width + x) * 4;
      result[outIndex] = shade;
      result[outIndex + 1] = shade;
      result[outIndex + 2] = shade;
      result[outIndex + 3] = 255;
    }
  }

  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/coloring/lineArtConversion.test.ts`
Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/coloring/lineArtConversion.ts __tests__/coloring/lineArtConversion.test.ts
git commit -m "Add convertToLineArt Sobel edge-detection conversion"
```

---

### Task 3: `lineArtCache.ts` — conversion cache and orchestration

**Files:**
- Create: `src/coloring/lineArtCache.ts`
- Test: `__tests__/coloring/lineArtCache.test.ts`

**Interfaces:**
- Consumes: `looksPhotographic(pixels, width, height): boolean` and `convertToLineArt(pixels, width, height): Uint8ClampedArray` from `./lineArtConversion` (Tasks 1-2).
- Produces:
  - `getDisplayImage(sourceUri: string): Promise<{ uri: string; isConverted: boolean }>`
  - `pruneStaleDerivedImages(currentSourceUris: readonly string[]): Promise<void>`
  - `clearLineArtCache(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/coloring/lineArtCache.test.ts`:

```ts
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
  readPixels: jest.fn(() => new Uint8Array(100 * 80 * 4)),
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
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        result.uri,
        'ZmFrZS1wbmc=',
        { encoding: 'base64' }
      );
    });

    it('returns the same derived uri on a second call without re-decoding (cache hit)', async () => {
      (looksPhotographic as jest.Mock).mockReturnValue(true);
      (convertToLineArt as jest.Mock).mockReturnValue(new Uint8ClampedArray(100 * 80 * 4));

      const first = await getDisplayImage('content://source/photo.jpg');

      // Simulate the cache map now containing the entry written above, and
      // the derived file genuinely existing on a second, fresh call.
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify({ 'content://source/photo.jpg': { derivedUri: first.uri } })
      );
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/coloring/lineArtCache.test.ts`
Expected: FAIL — `Cannot find module '../../src/coloring/lineArtCache'`

- [ ] **Step 3: Write the implementation**

Create `src/coloring/lineArtCache.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/coloring/lineArtCache.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/coloring/lineArtCache.ts __tests__/coloring/lineArtCache.test.ts
git commit -m "Add lineArtCache: converts, caches, and prunes coloring line-art images"
```

---

### Task 4: Wire `ColoringScreen.tsx` to load through `getDisplayImage`

**Files:**
- Modify: `src/coloring/ColoringScreen.tsx` (the load effect at lines 355-382, shown in full context below)
- Test: `__tests__/coloring/ColoringScreen.test.tsx`

**Interfaces:**
- Consumes: `getDisplayImage(sourceUri: string): Promise<{ uri: string; isConverted: boolean }>` from `./lineArtCache` (Task 3).

- [ ] **Step 1: Write the failing test**

At the top of `__tests__/coloring/ColoringScreen.test.tsx`, alongside the existing `jest.mock('@shopify/react-native-skia', ...)` and `jest.mock('expo-file-system/legacy', ...)` calls (lines 49-74), add:

```ts
jest.mock('../../src/coloring/lineArtCache', () => ({
  getDisplayImage: jest.fn((uri: string) => Promise.resolve({ uri, isConverted: false })),
}));
```

And add the import near the top, alongside the existing `import * as FileSystem from 'expo-file-system/legacy';`:

```ts
import { getDisplayImage } from '../../src/coloring/lineArtCache';
```

Then add a new test alongside the existing `'shows the canvas once the photo loads and decodes successfully'` test (around line 187), following that test's exact `render`/`findByTestId` pattern:

```ts
  it('loads through getDisplayImage instead of reading the raw source uri directly', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(FAKE_BASE64);
    (getDisplayImage as jest.Mock).mockResolvedValue({
      uri: 'file:///docs/kutta-line-art/converted.png',
      isConverted: true,
    });

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ColoringScreen imageUri={IMAGE_URI} />
      </LanguageProvider>
    );

    await findByTestId('coloring-canvas-touch-area');
    expect(getDisplayImage).toHaveBeenCalledWith(IMAGE_URI);
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
      'file:///docs/kutta-line-art/converted.png',
      { encoding: 'base64' }
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/coloring/ColoringScreen.test.tsx -t "getDisplayImage"`
Expected: FAIL -- `FileSystem.readAsStringAsync` was called with `IMAGE_URI`, not the converted uri (and `getDisplayImage` was never called at all, since the mock module doesn't exist as an import in the source yet).

- [ ] **Step 3: Update the implementation**

In `src/coloring/ColoringScreen.tsx`, add the import near the top (alongside the existing `./floodFill` and `./base64` imports):

```ts
import { getDisplayImage } from './lineArtCache';
```

Replace the load effect (currently lines 355-382):

```ts
  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setImageLoadFailed(false);

    (async () => {
      try {
        const { uri: displayUri } = await getDisplayImage(imageUri);
        if (cancelled) return;
        const base64 = await FileSystem.readAsStringAsync(displayUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const bytes = base64ToUint8Array(base64);
        const data = Skia.Data.fromBytes(bytes);
        const decoded = Skia.Image.MakeImageFromEncoded(data);
        if (cancelled) return;
        if (decoded) {
          setImage(downscaleForColoring(decoded));
        } else {
          setImageLoadFailed(true);
        }
      } catch {
        if (!cancelled) setImageLoadFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageUri, retryToken]);
```

(This is the whole `getDisplayImage` call resolving to either the original `imageUri` unchanged -- for a non-photographic image, or on any internal failure -- or the cached converted PNG's file uri. Either way, the rest of the effect reads and decodes whatever uri comes back exactly as it already did.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/coloring/ColoringScreen.test.tsx`
Expected: PASS -- the new test plus every existing test in this file.

- [ ] **Step 5: Commit**

```bash
git add src/coloring/ColoringScreen.tsx __tests__/coloring/ColoringScreen.test.tsx
git commit -m "Load the coloring canvas through getDisplayImage for line-art conversion"
```

---

### Task 5: Wire `ColoringGallery.tsx` thumbnails and cleanup sweep

**Files:**
- Create: `src/coloring/ColoringGalleryTileImage.tsx`
- Modify: `src/coloring/ColoringGallery.tsx`
- Modify: `src/components/useSelectableGallery.ts`
- Test: `__tests__/coloring/ColoringGallery.test.tsx`
- Test: `__tests__/components/useSelectableGallery.test.ts`

**Interfaces:**
- Consumes: `getDisplayImage`, `pruneStaleDerivedImages` from `./lineArtCache` (Task 3).
- Produces: `ColoringGalleryTileImage({ uri: string, style: StyleProp<ImageStyle> })` -- a small component resolving `uri` to its display image lazily, falling back to the raw `uri` while pending or on failure.
- Modifies `useSelectableGallery`'s signature to accept an optional 4th parameter: `onItemsLoaded?: (uris: string[]) => void`, called with the merged `items` list right after `setItems(merged)`. This is generic (no coloring-specific logic in the shared hook) -- only `ColoringGallery` passes a callback.

- [ ] **Step 1: Write the failing test for `useSelectableGallery`'s new callback**

Find the existing test file `__tests__/components/useSelectableGallery.test.ts` and add:

```ts
it('calls onItemsLoaded with the merged item list once loading succeeds', async () => {
  (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue(['content://folder/a.jpg']);
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null); // no file references

  const onItemsLoaded = jest.fn();
  const { result } = renderHook(() => useSelectableGallery('content://folder', 'coloring', () => true, onItemsLoaded));

  await waitFor(() => {
    expect(result.current.items).not.toBeNull();
  });

  expect(onItemsLoaded).toHaveBeenCalledWith(['content://folder/a.jpg']);
});
```

(Match the exact mock setup -- `FileSystem`, `AsyncStorage` import names and how `pruneMissingFileReferences`'s underlying `AsyncStorage`/`FileSystem` calls are already mocked -- to whatever this test file's existing tests already do.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/components/useSelectableGallery.test.ts -t "onItemsLoaded"`
Expected: FAIL -- `onItemsLoaded` was not called (the parameter doesn't exist yet).

- [ ] **Step 3: Update `useSelectableGallery.ts`**

Change the function signature:

```ts
export function useSelectableGallery(
  folderUri: string,
  contentType: FileReferenceContentType,
  isValidFile: (uri: string) => boolean,
  onItemsLoaded?: (uris: string[]) => void
) {
```

In the load effect, right after `setItems(merged);`:

```ts
      setItems(merged);
      setReferencedUris(new Set(extraItems));
      onItemsLoaded?.(merged);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/components/useSelectableGallery.test.ts`
Expected: PASS -- new test plus every existing test in this file.

- [ ] **Step 5: Write the failing test for the tile image component**

Create `__tests__/coloring/ColoringGalleryTileImage.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ColoringGalleryTileImage } from '../../src/coloring/ColoringGalleryTileImage';
import { getDisplayImage } from '../../src/coloring/lineArtCache';

jest.mock('../../src/coloring/lineArtCache', () => ({
  getDisplayImage: jest.fn(),
}));

describe('ColoringGalleryTileImage', () => {
  it('shows the raw source uri immediately, then swaps to the converted uri once resolved', async () => {
    let resolveDisplay: (value: { uri: string; isConverted: boolean }) => void = () => {};
    (getDisplayImage as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveDisplay = resolve;
      })
    );

    const { getByTestId } = render(
      <ColoringGalleryTileImage testID="tile-img" uri="content://source/photo.jpg" style={{}} />
    );

    expect(getByTestId('tile-img').props.source.uri).toBe('content://source/photo.jpg');

    resolveDisplay({ uri: 'file:///docs/kutta-line-art/converted.png', isConverted: true });

    await waitFor(() => {
      expect(getByTestId('tile-img').props.source.uri).toBe('file:///docs/kutta-line-art/converted.png');
    });
  });

  it('keeps showing the raw source uri if resolution fails', async () => {
    (getDisplayImage as jest.Mock).mockRejectedValue(new Error('decode failed'));

    const { getByTestId } = render(
      <ColoringGalleryTileImage testID="tile-img" uri="content://source/corrupt.jpg" style={{}} />
    );

    await waitFor(() => {
      expect(getDisplayImage).toHaveBeenCalled();
    });
    expect(getByTestId('tile-img').props.source.uri).toBe('content://source/corrupt.jpg');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx jest __tests__/coloring/ColoringGalleryTileImage.test.tsx`
Expected: FAIL -- `Cannot find module '../../src/coloring/ColoringGalleryTileImage'`

- [ ] **Step 7: Write the implementation**

Create `src/coloring/ColoringGalleryTileImage.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import { getDisplayImage } from './lineArtCache';

// Resolves a gallery item's raw source uri to its (possibly converted)
// display image lazily, per tile -- so a big gallery doesn't block on
// converting every thumbnail at once. Shows the raw source immediately
// (never a blank tile) and swaps to the converted line-art uri once ready;
// on any failure it just keeps showing the raw source, matching
// lineArtCache's own fallback-to-original discipline.
export function ColoringGalleryTileImage({
  testID,
  uri,
  style,
}: {
  testID?: string;
  uri: string;
  style: StyleProp<ImageStyle>;
}) {
  const [displayUri, setDisplayUri] = useState(uri);

  useEffect(() => {
    let cancelled = false;
    setDisplayUri(uri);

    getDisplayImage(uri)
      .then((result) => {
        if (!cancelled) setDisplayUri(result.uri);
      })
      .catch(() => {
        // Keep showing the raw source uri -- matches getDisplayImage's own
        // fallback-to-original behavior for every internal failure.
      });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return <Image testID={testID} source={{ uri: displayUri }} style={style} resizeMode="cover" />;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx jest __tests__/coloring/ColoringGalleryTileImage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Write the failing test for the gallery wiring**

In `__tests__/coloring/ColoringGallery.test.tsx`, add the import and mock alongside the existing `jest.mock` calls at the top of the file (lines 11-16):

```ts
import { pruneStaleDerivedImages } from '../../src/coloring/lineArtCache';

jest.mock('../../src/coloring/lineArtCache', () => ({
  pruneStaleDerivedImages: jest.fn().mockResolvedValue(undefined),
}));
```

Then add a new test alongside the existing `'lists images from the coloring folder and calls onSelect when tapped'` test (around line 67), following that test's exact setup:

```ts
  it('sweeps stale derived line-art images once the folder listing has loaded', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/coloring/cat-outline.png',
    ]);

    await render(
      <LanguageProvider initialLanguage="en">
        <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    expect(pruneStaleDerivedImages).toHaveBeenCalledWith(['content://tree/coloring/cat-outline.png']);
  });
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx jest __tests__/coloring/ColoringGallery.test.tsx -t "sweeps stale"`
Expected: FAIL -- `pruneStaleDerivedImages` was not called.

- [ ] **Step 11: Update `ColoringGallery.tsx`**

Add the imports:

```ts
import { ColoringGalleryTileImage } from './ColoringGalleryTileImage';
import { pruneStaleDerivedImages } from './lineArtCache';
```

Change the `useSelectableGallery` call to pass the new callback:

```ts
  const {
    items: images,
    error,
    selectionMode,
    selectedUris,
    removing,
    retry,
    toggleSelected,
    handleLongPress,
    handleCancelSelection,
    handleRemoveSelected,
  } = useSelectableGallery(coloringFolderUri, 'coloring', isImageFile, (uris) => {
    pruneStaleDerivedImages(uris).catch(() => {
      // Best-effort housekeeping -- a failed sweep just means stale derived
      // files linger a little longer, never a user-visible failure.
    });
  });
```

Replace the tile's `<Image source={{ uri: item }} style={styles.tileImage} resizeMode="cover" />` with:

```tsx
                  <ColoringGalleryTileImage testID={`coloring-item-image-${item}`} uri={item} style={styles.tileImage} />
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npx jest __tests__/coloring/ColoringGallery.test.tsx __tests__/coloring/ColoringGalleryTileImage.test.tsx __tests__/components/useSelectableGallery.test.ts`
Expected: PASS -- every test in all three files.

- [ ] **Step 13: Commit**

```bash
git add src/coloring/ColoringGalleryTileImage.tsx src/coloring/ColoringGallery.tsx src/components/useSelectableGallery.ts \
  __tests__/coloring/ColoringGalleryTileImage.test.tsx __tests__/coloring/ColoringGallery.test.tsx __tests__/components/useSelectableGallery.test.ts
git commit -m "Show converted line-art thumbnails in the coloring gallery and sweep stale derived files"
```

---

### Task 6: Wire `clearLineArtCache` into Settings' "Reset everything"

**Files:**
- Modify: `src/settings/SettingsScreen.tsx` (imports at the top, and `performReset` at lines 302-332)
- Test: `__tests__/settings/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `clearLineArtCache(): Promise<void>` from `../coloring/lineArtCache` (Task 3).

- [ ] **Step 1: Write the failing test**

In `__tests__/settings/SettingsScreen.test.tsx`, find the existing "Reset everything" test(s) (search for `clearAllFileReferences` or `performReset`/`handleReset`) and add, alongside the existing mock of `clearAllFileReferences`:

```ts
jest.mock('../../src/coloring/lineArtCache', () => ({
  clearLineArtCache: jest.fn().mockResolvedValue(undefined),
}));
```

```ts
import { clearLineArtCache } from '../../src/coloring/lineArtCache';

it('clears the line-art derived-image cache as part of Reset everything', async () => {
  // (drive the existing reset-confirm flow exactly as the current
  // "clears all file references on reset" test already does, then:)
  expect(clearLineArtCache).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/settings/SettingsScreen.test.tsx -t "line-art"`
Expected: FAIL -- `clearLineArtCache` was not called.

- [ ] **Step 3: Update `SettingsScreen.tsx`**

Add the import alongside the existing `clearAllFileReferences` import:

```ts
import { clearLineArtCache } from '../coloring/lineArtCache';
```

In `performReset`, add the call right after `await clearAllFileReferences();`:

```ts
      await clearAllFileReferences();
      await clearLineArtCache();
      await clearPuzzleDifficulty();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/settings/SettingsScreen.test.tsx`
Expected: PASS -- new test plus every existing test in this file.

- [ ] **Step 5: Commit**

```bash
git add src/settings/SettingsScreen.tsx __tests__/settings/SettingsScreen.test.tsx
git commit -m "Clear the line-art derived-image cache on Reset everything"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: every suite passes, including all suites touched in Tasks 1-6.

- [ ] **Step 2: Run the typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm no attribution in any commit from this plan**

Run: `git log --oneline -8`
Expected: 6 commits from Tasks 1-6 (2 test-adding tasks may have folded into one commit each per task as written above), each authored by the project's normal author, no `Co-Authored-By` line in any commit message.

- [ ] **Step 4: Push**

Run: `git push <configured-remote-with-credentials> master`
Expected: push succeeds; `git rev-parse HEAD` matches `git ls-remote` for `master`.
