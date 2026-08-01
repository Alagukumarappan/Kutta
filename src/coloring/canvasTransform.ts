// Pure zoom/pan math for ColoringScreen's pinch-to-zoom canvas — no RN
// imports, mirroring floodFill.ts's own "plain functions + exported types"
// convention so this stays independently unit-testable.
//
// Transform model: canvas-space point (cx, cy) is displayed on screen at
// (cx * scale + translateX, cy * scale + translateY) — i.e. scale is
// applied about the canvas's own top-left origin (0,0), then the result is
// translated. This must match exactly how the transform is APPLIED in
// ColoringScreen.tsx's render (an Animated.View with
// `transformOrigin: [0, 0]` and `transform: [{translateX},{translateY},{scale}]`)
// — see that file's own rendering comment for the pinned convention.

export interface CanvasTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export const IDENTITY_TRANSFORM: CanvasTransform = { scale: 1, translateX: 0, translateY: 0 };

export interface Point {
  x: number;
  y: number;
}

export interface TouchPoint {
  x: number;
  y: number;
}

// Inverts the screen->canvas mapping described above. Guards against a
// zero/non-finite scale (should never happen given clampTransform's own
// minScale floor, but keeps this safe to unit-test with adversarial input
// independent of caller discipline, rather than silently producing
// Infinity/NaN).
export function screenPointToCanvasPoint(screenX: number, screenY: number, transform: CanvasTransform): Point {
  const scale = Number.isFinite(transform.scale) && transform.scale !== 0 ? transform.scale : 1;
  return {
    x: (screenX - transform.translateX) / scale,
    y: (screenY - transform.translateY) / scale,
  };
}

export interface TransformClampOptions {
  // Never let the user zoom "out" past the canvas's own fitted default.
  minScale: number;
  maxScale: number;
  canvasWidth: number;
  canvasHeight: number;
}

// Keeps the scaled content covering the canvas viewport — never allows a
// pan that reveals empty space beyond the image's edge. At a given `scale`,
// the content is `canvasWidth * scale` wide; the valid translateX range so
// the viewport [0, canvasWidth] stays fully covered by
// [translateX, translateX + canvasWidth*scale] is
// [canvasWidth*(1-scale), 0] (translateX never positive, and never smaller
// than canvasWidth*(1-scale)). At scale === minScale === 1 this pins
// translateX/Y to exactly 0, reproducing the untouched identity transform
// every pre-zoom test already assumes.
export function clampTransform(transform: CanvasTransform, opts: TransformClampOptions): CanvasTransform {
  const scale = Math.min(opts.maxScale, Math.max(opts.minScale, transform.scale));
  const minTranslateX = opts.canvasWidth * (1 - scale);
  const minTranslateY = opts.canvasHeight * (1 - scale);
  const translateX = Math.min(0, Math.max(minTranslateX, transform.translateX));
  const translateY = Math.min(0, Math.max(minTranslateY, transform.translateY));
  return { scale, translateX, translateY };
}

export function touchDistance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function touchMidpoint(a: TouchPoint, b: TouchPoint): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Given the transform BEFORE this gesture frame and the previous/current
// two-finger touch pairs (both in the same screen coordinate space —
// ColoringScreen.tsx uses pageX/pageY for this, see its own comment on why),
// returns the new (unclamped — callers pipe the result through
// clampTransform immediately) transform: scale changes by the ratio of
// current/previous inter-finger distance, and pan is adjusted so the
// midpoint between the fingers stays visually anchored under the fingers
// (standard pinch-to-zoom-about-a-point behavior).
export function applyPinchPan(
  previous: CanvasTransform,
  prevTouches: [TouchPoint, TouchPoint],
  currentTouches: [TouchPoint, TouchPoint]
): CanvasTransform {
  const prevDist = touchDistance(prevTouches[0], prevTouches[1]);
  const currDist = touchDistance(currentTouches[0], currentTouches[1]);
  const scaleRatio = prevDist > 0 ? currDist / prevDist : 1;
  const newScale = previous.scale * scaleRatio;

  const prevMid = touchMidpoint(prevTouches[0], prevTouches[1]);
  const currMid = touchMidpoint(currentTouches[0], currentTouches[1]);

  // Anchor: the canvas-space point under the midpoint before this frame
  // must map to the SAME canvas-space point after this frame, landing under
  // the NEW midpoint (currMid) — i.e.
  //   anchor = screenPointToCanvasPoint(prevMid, previous)
  //   currMid = anchor * newScale + newTranslate  =>  newTranslate = currMid - anchor*newScale
  const anchor = screenPointToCanvasPoint(prevMid.x, prevMid.y, previous);
  const translateX = currMid.x - anchor.x * newScale;
  const translateY = currMid.y - anchor.y * newScale;

  return { scale: newScale, translateX, translateY };
}
