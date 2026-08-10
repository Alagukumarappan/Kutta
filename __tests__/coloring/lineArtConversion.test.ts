import { looksPhotographic, convertToLineArt } from '../../src/coloring/lineArtConversion';

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
