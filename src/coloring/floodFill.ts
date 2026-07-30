type RGBA = [number, number, number, number];

function colorsMatch(px: Uint8ClampedArray, index: number, target: RGBA, tolerance: number): boolean {
  return (
    Math.abs(px[index] - target[0]) <= tolerance &&
    Math.abs(px[index + 1] - target[1]) <= tolerance &&
    Math.abs(px[index + 2] - target[2]) <= tolerance &&
    Math.abs(px[index + 3] - target[3]) <= tolerance
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

  const targetMatchesFill =
    targetColor[0] === fillColor[0] &&
    targetColor[1] === fillColor[1] &&
    targetColor[2] === fillColor[2] &&
    targetColor[3] === fillColor[3];
  if (targetMatchesFill) return result;

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
