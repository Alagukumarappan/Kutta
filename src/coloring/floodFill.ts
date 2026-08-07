type RGBA = [number, number, number, number];

function colorsMatch(px: Uint8ClampedArray, index: number, target: RGBA, tolerance: number): boolean {
  return (
    Math.abs(px[index] - target[0]) <= tolerance &&
    Math.abs(px[index + 1] - target[1]) <= tolerance &&
    Math.abs(px[index + 2] - target[2]) <= tolerance &&
    Math.abs(px[index + 3] - target[3]) <= tolerance
  );
}

// True when the pixel at (x, y) is EXACTLY `color` already — the same
// condition `floodFill` below uses to recognise a re-tap that cannot change
// anything. Exported so callers can recognise that no-op BEFORE spending a
// full-buffer copy (and, more importantly, before spending their undo
// snapshot) on a fill that provably has no effect. Out-of-range coordinates
// read `undefined` and therefore never match, matching floodFill's own
// tolerance of an out-of-range seed.
export function pixelMatchesColorExactly(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: RGBA
): boolean {
  const index = (y * width + x) * 4;
  return (
    pixels[index] === color[0] &&
    pixels[index + 1] === color[1] &&
    pixels[index + 2] === color[2] &&
    pixels[index + 3] === color[3]
  );
}

export function floodFill(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillColor: RGBA,
  tolerance = 10
): Uint8ClampedArray {
  const result = pixels.slice();
  const startIndex = (startY * width + startX) * 4;
  const targetColor: RGBA = [result[startIndex], result[startIndex + 1], result[startIndex + 2], result[startIndex + 3]];

  if (pixelMatchesColorExactly(pixels, width, startX, startY, fillColor)) return result;

  const visited = new Uint8Array(width * height);
  const stack: [number, number][] = [[startX, startY]];

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const pixelIndex = y * width + x;
    if (visited[pixelIndex]) continue;

    const rgbaIndex = pixelIndex * 4;
    if (!colorsMatch(result, rgbaIndex, targetColor, tolerance)) continue;

    visited[pixelIndex] = 1;
    result[rgbaIndex] = fillColor[0];
    result[rgbaIndex + 1] = fillColor[1];
    result[rgbaIndex + 2] = fillColor[2];
    result[rgbaIndex + 3] = fillColor[3];

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return result;
}
