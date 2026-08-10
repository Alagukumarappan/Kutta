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
// sample or plausible hand-drawn clip art produces, and well below what
// real photographic noise produces even in a small sampled region.
const PHOTOGRAPHIC_DISTINCT_COLOR_THRESHOLD = 40;

// True when `pixels` looks like a real photograph (continuous gradients,
// texture, noise) rather than a flat illustration or existing line art. Only
// photographic images should be converted to line art: converting an
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

// Standard Sobel 3x3 kernels for horizontal (Gx) and vertical (Gy) gradient.
const SOBEL_GX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
const SOBEL_GY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

// A pixel whose combined gradient magnitude is at or above this is drawn as
// a black outline; below it, white. Tuned so a hard boundary is reliably
// caught while flat mid-tone noise within a single region is not.
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
