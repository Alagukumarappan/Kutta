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
});
