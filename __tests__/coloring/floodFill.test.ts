import { floodFill } from '../../src/coloring/floodFill';

// 3x3 image, all white (255,255,255,255) except a black (0,0,0,255) border pixel at (1,0)
function makeTestImage(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(3 * 3 * 4).fill(255);
  const setPixel = (x: number, y: number, rgba: [number, number, number, number]) => {
    const i = (y * 3 + x) * 4;
    px[i] = rgba[0];
    px[i + 1] = rgba[1];
    px[i + 2] = rgba[2];
    px[i + 3] = rgba[3];
  };
  setPixel(1, 0, [0, 0, 0, 255]);
  setPixel(1, 1, [0, 0, 0, 255]);
  setPixel(1, 2, [0, 0, 0, 255]);
  return px;
}

function getPixel(px: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [px[i], px[i + 1], px[i + 2], px[i + 3]];
}

describe('floodFill', () => {
  it('fills the connected white region starting at (0,0) with red', () => {
    const px = makeTestImage();
    const result = floodFill(px, 3, 3, 0, 0, [255, 0, 0, 255]);
    expect(getPixel(result, 3, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(result, 3, 0, 1)).toEqual([255, 0, 0, 255]);
    expect(getPixel(result, 3, 0, 2)).toEqual([255, 0, 0, 255]);
  });

  it('does not cross the black border into the region on the other side', () => {
    const px = makeTestImage();
    const result = floodFill(px, 3, 3, 0, 0, [255, 0, 0, 255]);
    expect(getPixel(result, 3, 2, 0)).toEqual([255, 255, 255, 255]);
  });

  it('leaves the border pixels themselves unchanged', () => {
    const px = makeTestImage();
    const result = floodFill(px, 3, 3, 0, 0, [255, 0, 0, 255]);
    expect(getPixel(result, 3, 1, 0)).toEqual([0, 0, 0, 255]);
  });

  it('does not mutate the input buffer', () => {
    const px = makeTestImage();
    const original = px.slice();
    floodFill(px, 3, 3, 0, 0, [255, 0, 0, 255]);
    expect(px).toEqual(original);
  });

  it('returns an unchanged copy when the tapped pixel already matches the fill color (no-op re-tap)', () => {
    const px = makeTestImage();
    // (0,0) starts white (255,255,255,255); filling it white again should hit
    // the early "already this color" exit rather than doing a full traversal.
    const result = floodFill(px, 3, 3, 0, 0, [255, 255, 255, 255]);
    expect(result).toEqual(px);
    expect(result).not.toBe(px); // still returns a fresh copy, not the same reference
  });

  it('is a no-op when starting from a border pixel that already matches the fill color (does not leak into either neighboring region)', () => {
    const px = makeTestImage();
    // Re-filling the already-black border with black should also be a no-op,
    // not attempt to flood across the border into unrelated regions.
    const result = floodFill(px, 3, 3, 1, 0, [0, 0, 0, 255]);
    expect(getPixel(result, 3, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(getPixel(result, 3, 2, 0)).toEqual([255, 255, 255, 255]);
    expect(getPixel(result, 3, 1, 0)).toEqual([0, 0, 0, 255]);
  });

  it('does not throw and returns an unchanged copy when the seed coordinates are negative, including single-axis-only cases', () => {
    const px = makeTestImage();
    // Both axes negative.
    expect(floodFill(px, 3, 3, -1, -1, [255, 0, 0, 255])).toEqual(px);
    // X-only negative (Y in range) — the out-of-range seed can never match
    // any real pixel color (it reads past the buffer), so nothing should
    // ever be filled, regardless of which single axis is out of range.
    expect(floodFill(px, 3, 3, -1, 0, [255, 0, 0, 255])).toEqual(px);
    // Y-only negative (X in range).
    expect(floodFill(px, 3, 3, 0, -1, [255, 0, 0, 255])).toEqual(px);
    expect(() => floodFill(px, 3, 3, -1, 0, [255, 0, 0, 255])).not.toThrow();
  });

  it('does not throw and returns an unchanged copy when the seed coordinates are >= width/height, including single-axis-only cases', () => {
    const px = makeTestImage();
    // Both axes out of range.
    expect(floodFill(px, 3, 3, 3, 3, [255, 0, 0, 255])).toEqual(px);
    // X-only out of range (Y in range).
    expect(floodFill(px, 3, 3, 3, 0, [255, 0, 0, 255])).toEqual(px);
    // Y-only out of range (X in range).
    expect(floodFill(px, 3, 3, 0, 3, [255, 0, 0, 255])).toEqual(px);
    expect(() => floodFill(px, 3, 3, 3, 0, [255, 0, 0, 255])).not.toThrow();
  });

  it('treats a color difference exactly equal to tolerance as a match (inclusive boundary)', () => {
    // 1x3 row: seed pixel white (255,255,255,255), a neighbor whose red
    // channel differs by exactly `tolerance` (5), and a third pixel whose
    // red channel differs by more than tolerance (15) that must stay
    // unfilled. This pins down colorsMatch's `<=` comparison: a diff exactly
    // equal to tolerance must still count as "close enough to match", not
    // just diffs strictly less than tolerance.
    const px = new Uint8ClampedArray(3 * 1 * 4);
    const setPixel = (x: number, rgba: [number, number, number, number]) => {
      const i = x * 4;
      px[i] = rgba[0];
      px[i + 1] = rgba[1];
      px[i + 2] = rgba[2];
      px[i + 3] = rgba[3];
    };
    setPixel(0, [255, 255, 255, 255]); // seed
    setPixel(1, [250, 255, 255, 255]); // diff = 5, exactly == tolerance
    setPixel(2, [240, 255, 255, 255]); // diff = 15, well beyond tolerance

    const result = floodFill(px, 3, 1, 0, 0, [0, 255, 0, 255], 5);

    expect(getPixel(result, 3, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(result, 3, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(result, 3, 2, 0)).toEqual([240, 255, 255, 255]);
  });

  it('fills a 1x1 image (single pixel, seed and only pixel are the same)', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255]); // one white pixel
    const result = floodFill(px, 1, 1, 0, 0, [255, 0, 0, 255]);
    expect(getPixel(result, 1, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(result).not.toBe(px);
    expect(px).toEqual(new Uint8ClampedArray([255, 255, 255, 255])); // input untouched
  });
});
