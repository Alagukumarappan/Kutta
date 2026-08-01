import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Text, PanResponder, PanResponderInstance, useWindowDimensions, GestureResponderEvent, Alert, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Canvas,
  Image as SkiaImage,
  Path as SkiaPath,
  Skia,
  SkPath,
  ColorType,
  AlphaType,
  SkImage,
} from '@shopify/react-native-skia';
import { floodFill } from './floodFill';
import { base64ToUint8Array } from './base64';
import {
  computeResponsiveRectSize,
  colors,
  spacing,
  radii,
  elevation,
  typography,
  touchTarget,
  motion,
  getActivityPalette,
  RaisedCard,
  RaisedPrimaryButton,
  useReducedMotion,
} from '../design-system';
import { PALETTE, RGBA } from './palette';
import { useLanguage } from '../i18n/LanguageContext';
import Slider from '@react-native-community/slider';
import {
  screenPointToCanvasPoint,
  applyPinchPan,
  clampTransform,
  IDENTITY_TRANSFORM,
  type CanvasTransform,
  type TouchPoint,
} from './canvasTransform';

// Coloring's recognizable accent (see getActivityPalette in
// src/design-system/tokens.ts) — drives the active-tool highlight, the
// selected-swatch ring, and the pen-size slider's tint, so this screen's
// chrome reads as "Coloring" the same way its gallery/home card do.
const coloringAccent = getActivityPalette('coloring');

// Circular palette swatches, sized to the design system's "comfortable"
// touch target (see touchTarget.comfortable in tokens.ts) rather than the
// old flat 44px — bigger, more tappable, and visually richer with the new
// raised selection ring below.
const SWATCH_SIZE = touchTarget.comfortable;

// The toolbar (Fill/Pen/Undo/Clear + palette + pen-size slider) now floats
// as a collapsible OVERLAY on top of the canvas's bottom edge instead of
// sitting below it and shrinking the canvas — see the "toolbar overlay"
// section further down. The canvas therefore only needs to reserve a small
// outer breathing-margin plus the device's own safe-area insets, not a
// hand-budgeted footer height. This screen is landscape-only via
// RootNavigator's runtime orientation lock (app.json itself uses "default"
// rather than a manifest-level lock).
const CANVAS_RESERVED_MARGIN = 32;
const CANVAS_MIN_SIZE = 200;
const CANVAS_MAX_SIZE = 900;

// Default stroke width — visually chunky, sized for a child's fingertip,
// not a thin hairline — plus the adjustable range the pen-size slider lets
// the parent/child pick within.
const PEN_STROKE_WIDTH_DEFAULT = 14;
const PEN_STROKE_WIDTH_MIN = 4;
const PEN_STROKE_WIDTH_MAX = 40;
const PEN_STROKE_WIDTH_STEP = 2;

// How far the expanded toolbar panel slides down to fully hide itself when
// collapsed — a generous fixed distance (comfortably more than the panel's
// real height in any state, Fill/Pen/Undo/Clear all visible + the pen-size
// row) rather than an exact measured height, so collapsing never leaves a
// visible sliver and there's no flash-of-wrong-position before the first
// onLayout measurement would otherwise land.
const TOOLBAR_PANEL_SLIDE_DISTANCE = 320;

// Zoom bounds for the pinch-to-zoom canvas: never below 1 (the canvas's own
// fitted default — zooming "out" further would just show empty space
// beyond the image, which clampTransform's own bounds already prevent, but
// pinning minScale to 1 here means a pinch-in gesture simply stops rather
// than fighting the clamp every frame), and a generous but bounded max so a
// child can zoom in close enough to color fine detail without the image
// eventually degrading into visibly blocky pixels.
const MIN_ZOOM_SCALE = 1;
const MAX_ZOOM_SCALE = 4;

type ToolMode = 'fill' | 'pen';

interface Stroke {
  path: SkPath;
  color: string;
  width: number;
}

export function ColoringScreen({ imageUri }: { imageUri: string }) {
  const { t } = useLanguage();
  // Deliberately NOT using Skia's useImage(imageUri) hook here: on Android it
  // loads the URI via Skia.Data.fromURI, which goes through
  // PlatformContext.java's `new URI(sourceUri).toURL()` /
  // URLConnection - and Java's URL class has no protocol handler for the
  // 'content://' scheme (only http/https/file/ftp/jar). Every photo picked
  // out of the app's SAF-granted folder listing (see ColoringGallery /
  // folderAccess.ts's StorageAccessFramework.readDirectoryAsync) is a
  // content:// URI, so useImage silently resolves to null for every real
  // photo. Instead, read the raw bytes ourselves through
  // expo-file-system/legacy's readAsStringAsync, which - for a SAF
  // content:// URI - goes through Android's ContentResolver.openInputStream
  // rather than java.net.URL, and hand the decoded bytes to Skia's
  // byte-based decoder (the same Skia.Data.fromBytes +
  // Skia.Image.MakeImage(FromEncoded) pattern already used below for the
  // flood-fill write-back), which doesn't care what scheme the original URI
  // had.
  const [image, setImage] = useState<SkImage | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  // Bumped on Retry to force a fresh load attempt even when `imageUri`
  // hasn't changed (e.g. a transient failure) — same pattern used by
  // QuizScreen and ColoringGallery for this identical class of SAF failure
  // (grant revoked, folder/file deleted externally, SD card unmounted).
  const [retryToken, setRetryToken] = useState(0);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [toolMode, setToolMode] = useState<ToolMode>('fill');
  // CANVAS_RESERVED_MARGIN is just a small outer breathing-margin now (the
  // toolbar floats as an overlay — see below — so it no longer shrinks the
  // canvas the way a below-canvas footer used to). The real per-device
  // notch/gesture-bar geometry still has to be added on top of that fixed
  // margin so the canvas never shrinks *into* system-reserved space. This
  // screen is shown with headerShown:false (see RootNavigator — every
  // activity screen dropped the native header/back-button in favor of the
  // device's own hardware/gesture back), so insets.top has to be reserved
  // here explicitly; nothing else consumes it.
  // Rectangular, not square: a landscape phone is short-but-wide, so
  // constraining the canvas to a square would shrink its width down to
  // match the tighter height budget, wasting most of the screen's width as
  // blank margin and leaving the child's actual picture much smaller than
  // it needs to be. Width and height each get their own full share of the
  // available space instead.
  const { width: canvasWidth, height: canvasHeight } = computeResponsiveRectSize(
    width,
    height,
    CANVAS_RESERVED_MARGIN + insets.top + insets.bottom,
    CANVAS_RESERVED_MARGIN + insets.left + insets.right,
    CANVAS_MIN_SIZE,
    CANVAS_MAX_SIZE
  );
  const [selectedColor, setSelectedColor] = useState<RGBA>(PALETTE[0].fill);
  const [selectedDisplayColor, setSelectedDisplayColor] = useState<string>(PALETTE[0].display);
  const [pixels, setPixels] = useState<Uint8ClampedArray | null>(null);
  const [filledImage, setFilledImage] = useState<SkImage | null>(null);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentPath, setCurrentPath] = useState<SkPath | null>(null);
  const [penWidth, setPenWidth] = useState(PEN_STROKE_WIDTH_DEFAULT);

  // PanResponder callbacks are created once and must always act on the
  // latest state/props, so mirror the values that change over time into
  // refs read from inside the (stable) gesture handlers.
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;
  const selectedColorRef = useRef(selectedColor);
  selectedColorRef.current = selectedColor;
  const selectedDisplayColorRef = useRef(selectedDisplayColor);
  selectedDisplayColorRef.current = selectedDisplayColor;
  const penWidthRef = useRef(penWidth);
  penWidthRef.current = penWidth;
  const canvasWidthRef = useRef(canvasWidth);
  canvasWidthRef.current = canvasWidth;
  const canvasHeightRef = useRef(canvasHeight);
  canvasHeightRef.current = canvasHeight;
  const imageRef = useRef(image);
  imageRef.current = image;
  const pixelsRef = useRef(pixels);
  pixelsRef.current = pixels;
  const filledImageRef = useRef(filledImage);
  filledImageRef.current = filledImage;

  const activePathRef = useRef<SkPath | null>(null);

  // --- Zoom/pan (pinch-to-zoom the canvas, then draw/fill at that zoom) ---
  // Animated.ValueXY drives translateX/translateY together (matches this
  // file's existing pattern of one Animated node per compound visual
  // property, e.g. the swatch/toolbar-button scales below); scale is a
  // separate Animated.Value since it doesn't pair naturally into an XY.
  // Both are native-driver-compatible (only ever feed
  // `transform: [{translateX},{translateY},{scale}]`).
  const panXY = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  // Plain-number mirror of the current transform, updated synchronously on
  // every pinch/pan frame — Animated.ValueXY/Value are opaque to a plain
  // read without an imperative extractValue trick, and the existing fill/
  // pen math (plain synchronous functions) needs a plain number to invert
  // against. Mirrored into the Animated nodes via .setValue() each frame
  // instead of using Animated as the actual source of truth.
  const transformRef = useRef<CanvasTransform>(IDENTITY_TRANSFORM);
  // The 2-finger gesture's own in-progress bookkeeping: the transform as it
  // was at the start of the CURRENT gesture FRAME (updated every
  // onPanResponderMove so applyPinchPan always compares consecutive frames,
  // not the whole gesture's start to now — avoiding compounding error), and
  // the two touches' screen positions at that same frame.
  const pinchStartTransformRef = useRef<CanvasTransform>(IDENTITY_TRANSFORM);
  const lastTouchesRef = useRef<[TouchPoint, TouchPoint] | null>(null);

  // --- Touch cursor indicator ------------------------------------------
  // Raw SCREEN point (locationX/Y within coloring-canvas-touch-area, the
  // same coordinate space the PanResponder callbacks already receive) —
  // deliberately NOT inverted through the zoom/pan transform, so it renders
  // exactly under the fingertip regardless of current zoom. `null` when no
  // finger is down/drawing.
  const [touchCursor, setTouchCursor] = useState<{ x: number; y: number } | null>(null);

  // --- Toolbar expand/collapse overlay -----------------------------------
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
  const toolbarExpandedRef = useRef(toolbarExpanded);
  toolbarExpandedRef.current = toolbarExpanded;
  // Whether the panel has EVER been expanded — lazily mounts the (fairly
  // large) panel subtree only once it's actually needed, rather than paying
  // for it on every mount when a child may never open it.
  const toolbarHasEverExpandedRef = useRef(false);
  // Slides the panel's own translateY: 0 = fully on-screen (expanded), a
  // fixed distance = fully off-screen below (collapsed). Starts collapsed
  // (matching toolbarExpanded's own default of false) — NOT 0 — so the
  // panel's very first mount is already positioned off-screen instead of
  // animating in from 0.
  const toolbarSlide = useRef(new Animated.Value(TOOLBAR_PANEL_SLIDE_DISTANCE)).current;
  const activeToolbarSlideAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Single-level "undo last flood fill" (iteration 27). `floodFill` already
  // does `pixels.slice()` internally (see floodFill.ts) rather than
  // mutating its input in place, so the pre-fill `pixels`/`filledImage`
  // pair is already sitting there, untouched, right before each new fill —
  // capturing it here for a possible undo is a pointer copy, not an extra
  // buffer allocation. Deliberately a plain ref (not state) holding at most
  // ONE snapshot: this is a one-level undo, not a history stack, so there's
  // never more than one extra pixel buffer alive at a time.
  const previousFillRef = useRef<{ pixels: Uint8ClampedArray; filledImage: SkImage | null } | null>(null);
  // Mirrors whether `previousFillRef.current` is set, purely so the Undo
  // button's visibility can react to it (refs alone don't trigger renders).
  const [canUndoFill, setCanUndoFill] = useState(false);

  // Load the source photo's bytes ourselves (see the comment above the
  // `image` state) and decode them into an SkImage. Runs once per
  // `imageUri`, and is the only place `image` gets set from source - nothing
  // downstream (readPixels/floodFill/pen overlay) changes.
  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setImageLoadFailed(false);

    (async () => {
      try {
        const base64 = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const bytes = base64ToUint8Array(base64);
        const data = Skia.Data.fromBytes(bytes);
        const decoded = Skia.Image.MakeImageFromEncoded(data);
        if (cancelled) return;
        if (decoded) {
          setImage(decoded);
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

  // Read the raw RGBA pixel buffer out of the decoded image so floodFill has
  // something to operate on. Runs once per loaded image.
  useEffect(() => {
    if (!image) {
      setPixels(null);
      setFilledImage(null);
      return;
    }
    const width = image.width();
    const height = image.height();
    const data = image.readPixels(0, 0, {
      width,
      height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });
    setPixels(data ? new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) : null);
    setFilledImage(null);
    setStrokes([]);
    setCurrentPath(null);
    // A fresh photo means any previous fill snapshot no longer applies —
    // there's nothing left to undo back to.
    previousFillRef.current = null;
    setCanUndoFill(false);
  }, [image]);

  function handleCanvasTap(x: number, y: number) {
    const image = imageRef.current;
    const pixels = pixelsRef.current;
    if (!image || !pixels) return;
    const width = image.width();
    const height = image.height();

    // Tap coordinates arrive in the Canvas's displayed (possibly scaled)
    // coordinate space; map them back into the pixel buffer's native space.
    // Width and height are scaled independently (the canvas is rectangular,
    // not square — see computeResponsiveRectSize), so each axis uses its
    // own ratio rather than a single shared one.
    const pixelX = Math.floor((x / canvasWidthRef.current) * width);
    const pixelY = Math.floor((y / canvasHeightRef.current) * height);
    if (pixelX < 0 || pixelY < 0 || pixelX >= width || pixelY >= height) return;

    const updated = floodFill(pixels, width, height, pixelX, pixelY, selectedColorRef.current);
    // Capture the pre-fill buffer/image for a single-level undo BEFORE
    // overwriting state below. `pixels`/`filledImageRef.current` here are
    // exactly what was on screen right before this fill — floodFill never
    // mutates its input (see floodFill.ts's own `pixels.slice()`), so this
    // is just holding onto the reference that already existed, not copying
    // anything new.
    previousFillRef.current = { pixels, filledImage: filledImageRef.current };
    setCanUndoFill(true);
    setPixels(updated);

    const bytesPerRow = width * 4;
    const data = Skia.Data.fromBytes(new Uint8Array(updated.buffer, updated.byteOffset, updated.byteLength));
    const newImage = Skia.Image.MakeImage(
      { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
      data,
      bytesPerRow
    );
    if (newImage) setFilledImage(newImage);
  }

  // Restores the single most-recent flood fill's pre-fill state and clears
  // the snapshot — one level of undo only, not a history stack. Deliberately
  // NOT gated behind a confirmation dialog (unlike `clear-drawing` above):
  // it only ever reverts the one most recent fill, a much smaller and
  // cheaper-to-redo action than wiping every pen stroke, so a confirmation
  // tap here would just be friction, not a real safety need.
  function handleUndoFill() {
    const previous = previousFillRef.current;
    if (!previous) return;
    setPixels(previous.pixels);
    setFilledImage(previous.filledImage);
    previousFillRef.current = null;
    setCanUndoFill(false);
  }

  // Commits the in-progress stroke (if any) into `strokes` and clears the
  // active-stroke refs/state. Shared by the release and terminate handlers
  // so a stroke is never lost or double-committed regardless of how the
  // gesture ends.
  //
  // The captured `finished` local is important: `setStrokes`'s updater can
  // be deferred by React and run later, after `activePathRef.current` has
  // already been reset to null on the next line. Reading the ref directly
  // inside the updater would then push `null` into `strokes`, and Skia's
  // <SkiaPath path={null}> throws "Invalid path: null" at render time.
  function finishActiveStroke() {
    const finished = activePathRef.current;
    activePathRef.current = null;
    if (finished) {
      // Each stroke keeps the width it was drawn with, captured at the
      // moment it's committed — moving the pen-size slider afterward must
      // only affect the NEXT stroke, not retroactively resize ones already
      // on the canvas (the same reasoning `color` above already follows).
      setStrokes((prev) => [
        ...prev,
        { path: finished, color: selectedDisplayColorRef.current, width: penWidthRef.current },
      ]);
    }
    setCurrentPath(null);
  }

  // Reads the current gesture's touch points as plain {x,y} pairs, in PAGE
  // space (pageX/pageY) rather than location space: pinch math only cares
  // about RELATIVE distances/midpoint deltas between two consecutive
  // frames, so either coordinate space works as long as it's used
  // consistently — pageX/pageY is preferable here because
  // nativeEvent.touches[].locationX/Y for the non-primary touch is less
  // reliable cross-platform in RN's responder system, while pageX/pageY is
  // always populated. Falls back to a single-touch reading (from
  // locationX/Y) when `touches` is absent/empty — this is what every
  // existing test's fake responder event shape already looks like (they
  // only ever set locationX/Y, never a `touches` array), so this fallback
  // is exactly what keeps all of them passing unmodified alongside the new
  // pinch/pan behavior.
  function touchesFromEvent(evt: GestureResponderEvent): TouchPoint[] {
    const touches = evt.nativeEvent.touches;
    if (!touches || touches.length === 0) {
      return [{ x: evt.nativeEvent.locationX, y: evt.nativeEvent.locationY }];
    }
    return touches.map((touch) => ({ x: touch.pageX, y: touch.pageY }));
  }

  const panResponder = useRef<PanResponderInstance>(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt) => {
        // RNTL's fireEvent dispatch checks whether an event handler is
        // "enabled" (see isEventEnabled in its fire-event source) by
        // invoking this exact callback speculatively, sometimes without a
        // real event object — guard against that rather than assuming evt
        // is always a genuine GestureResponderEvent.
        const touchCount = evt?.nativeEvent?.touches?.length ?? 1;
        return touchCount >= 2 || toolModeRef.current === 'pen';
      },
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        // Auto-collapse: any new touch on the canvas — a 1-finger draw/fill
        // or the start of a 2-finger pinch/pan alike — means the child's
        // attention just returned to the picture, so an expanded toolbar
        // collapses out of the way first.
        if (toolbarExpandedRef.current) collapseToolbar();

        const touches = touchesFromEvent(evt);
        if (touches.length >= 2) {
          // Entering (or re-entering, if a 3rd finger touched down
          // mid-gesture) pinch/pan mode: snapshot the transform and the two
          // touches' current positions as this gesture's/frame's baseline.
          pinchStartTransformRef.current = transformRef.current;
          lastTouchesRef.current = [touches[0], touches[1]];
          setTouchCursor(null); // pinch/pan never shows the draw cursor
          return;
        }

        lastTouchesRef.current = null;
        const { locationX, locationY } = evt.nativeEvent;
        // The RAW screen point drives the touch-cursor indicator regardless
        // of tool mode — a fill tap gets a brief cursor too, not just pen
        // strokes.
        setTouchCursor({ x: locationX, y: locationY });

        if (toolModeRef.current !== 'pen') return;
        // Pen strokes are drawn as an overlay directly on the Canvas, which
        // is rendered inside the same zoom/pan-transformed wrapper the
        // photo itself sits in (see the render below) — so a stroke drawn
        // while zoomed in needs to be recorded in the CANVAS's own
        // (untransformed) coordinate space, not the raw screen point, for
        // it to land in the same place relative to the photo regardless of
        // current zoom/pan.
        const { x, y } = screenPointToCanvasPoint(locationX, locationY, transformRef.current);
        const path = Skia.Path.Make();
        path.moveTo(x, y);
        activePathRef.current = path;
        setCurrentPath(path.copy());
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const touches = touchesFromEvent(evt);

        if (touches.length >= 2) {
          if (!lastTouchesRef.current) {
            // A 2nd finger just joined mid-gesture (e.g. while pen-drawing
            // with 1 finger) — start a fresh pinch baseline rather than
            // misapplying pinch math against a stale/absent one. The
            // in-progress stroke is abandoned without committing it (the
            // same "not drawn" outcome as lifting the finger without
            // moving) — simplest correct behavior, avoids a half-drawn
            // stray line.
            pinchStartTransformRef.current = transformRef.current;
            lastTouchesRef.current = [touches[0], touches[1]];
            activePathRef.current = null;
            setCurrentPath(null);
            setTouchCursor(null);
            return;
          }
          const next = clampTransform(
            applyPinchPan(pinchStartTransformRef.current, lastTouchesRef.current, [touches[0], touches[1]]),
            {
              minScale: MIN_ZOOM_SCALE,
              maxScale: MAX_ZOOM_SCALE,
              canvasWidth: canvasWidthRef.current,
              canvasHeight: canvasHeightRef.current,
            }
          );
          transformRef.current = next;
          scaleAnim.setValue(next.scale);
          panXY.setValue({ x: next.translateX, y: next.translateY });
          // This frame's touches become the baseline for the NEXT frame
          // (per-frame, not per-gesture, so error never compounds across a
          // long pinch).
          pinchStartTransformRef.current = next;
          lastTouchesRef.current = [touches[0], touches[1]];
          return;
        }

        // Fell back to (or stayed at) 1 finger.
        lastTouchesRef.current = null;
        const { locationX, locationY } = evt.nativeEvent;
        setTouchCursor({ x: locationX, y: locationY });
        if (toolModeRef.current !== 'pen' || !activePathRef.current) return;
        const { x, y } = screenPointToCanvasPoint(locationX, locationY, transformRef.current);
        activePathRef.current.lineTo(x, y);
        setCurrentPath(activePathRef.current.copy());
      },
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        setTouchCursor(null);
        const wasTwoFinger = lastTouchesRef.current !== null;
        lastTouchesRef.current = null;
        if (wasTwoFinger) return; // ending a pinch/pan is not a draw/fill action

        if (toolModeRef.current === 'pen') {
          finishActiveStroke();
          return;
        }
        const { locationX, locationY } = evt.nativeEvent;
        const { x, y } = screenPointToCanvasPoint(locationX, locationY, transformRef.current);
        handleCanvasTap(x, y);
      },
      onPanResponderTerminate: () => {
        setTouchCursor(null);
        lastTouchesRef.current = null;
        if (toolModeRef.current === 'pen') {
          finishActiveStroke();
        }
      },
    })
  ).current;

  // --- Palette swatch selection pop (this iteration) ---------------------
  // The selected swatch's `scale: 1.12` used to be a plain, instantly-applied
  // style value; this animates the transition instead, using the same
  // lazily-created-and-cached-by-index Animated.Value Map the quiz's
  // progress dots use (QuestionRenderer.tsx's dotScalesRef) rather than one
  // fixed-size array, since this palette has grown over past iterations (now
  // 17 colors) and a Map avoids over-allocating for a count that could grow
  // again. Only the already-selected swatch's Animated.Value starts life at
  // 1.12 (matching its already-selected resting state); every other swatch
  // starts at the plain resting 1 — so mounting never animates anything, it
  // only settles once a NEW selection actually happens below.
  const swatchScalesRef = useRef<Map<number, Animated.Value>>(new Map());
  function getSwatchScale(index: number, initiallySelected: boolean): Animated.Value {
    let value = swatchScalesRef.current.get(index);
    if (!value) {
      value = new Animated.Value(initiallySelected ? 1.12 : 1);
      swatchScalesRef.current.set(index, value);
    }
    return value;
  }

  // Tracks the previously-selected display color purely to detect a real
  // selection CHANGE (not the initial mount) so the pop below can't fire on
  // first render — mirrors QuestionRenderer's prevCurrentIndexRef for the
  // progress dots.
  const prevSelectedDisplayColorRef = useRef(selectedDisplayColor);
  const activeSwatchAnimationsRef = useRef<Map<number, Animated.CompositeAnimation>>(new Map());
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const prevColor = prevSelectedDisplayColorRef.current;
    prevSelectedDisplayColorRef.current = selectedDisplayColor;
    if (prevColor === selectedDisplayColor) return;

    function pop(index: number, toValue: number) {
      const scale = getSwatchScale(index, false);
      activeSwatchAnimationsRef.current.get(index)?.stop();
      // Same reduce-motion treatment as the quiz progress-dots' identical
      // pop pattern (iteration 25): land directly on the resting scale
      // instead of springing, since this is the exact bouncy/overshooting
      // motion category the OS setting exists to suppress. The isSelected
      // border/shadow swap below still conveys the selection change on its
      // own.
      if (reducedMotion) {
        scale.setValue(toValue);
        return;
      }
      // Quick, light spring — same speed/bounciness as the quiz progress
      // dots' pop — gentle enough for a 2-8 year old audience and brief
      // enough not to delay picking the next color.
      const animation = Animated.spring(scale, {
        toValue,
        useNativeDriver: true,
        speed: 20,
        bounciness: 6,
      });
      activeSwatchAnimationsRef.current.set(index, animation);
      animation.start();
    }

    const newIndex = PALETTE.findIndex((p) => p.display === selectedDisplayColor);
    const prevIndex = PALETTE.findIndex((p) => p.display === prevColor);
    if (newIndex >= 0) pop(newIndex, 1.12);
    if (prevIndex >= 0) pop(prevIndex, 1);
  }, [selectedDisplayColor, reducedMotion]);

  useEffect(() => {
    return () => {
      activeSwatchAnimationsRef.current.forEach((animation) => animation.stop());
    };
  }, []);

  // --- Toolbar button press feedback (this iteration) ---------------------
  // Same lightweight "press-in scale-down, spring back on release" language
  // as Home's cards / the quiz's answer options (see HomeScreen.tsx's
  // cardScales/animateCard), adapted to these smaller toolbar buttons. Kept
  // as one fixed Animated.Value per button key (created once via useRef,
  // like HomeScreen's cardScales keyed by testID) rather than a Map, since
  // the toolbar only ever has these 4 known buttons — Undo/Clear drawing
  // simply keep an idle, unused Animated.Value while not rendered, which
  // costs nothing.
  const toolbarScales = useRef({
    'tool-fill': new Animated.Value(1),
    'tool-pen': new Animated.Value(1),
    'undo-fill': new Animated.Value(1),
    'clear-drawing': new Animated.Value(1),
  }).current;
  type ToolbarButtonKey = keyof typeof toolbarScales;
  const activeToolbarAnimationsRef = useRef<Partial<Record<ToolbarButtonKey, Animated.CompositeAnimation>>>({});

  function animateToolbarButton(key: ToolbarButtonKey, toValue: number) {
    activeToolbarAnimationsRef.current[key]?.stop();
    // Same reduce-motion treatment as this screen's palette-swatch pop
    // (iteration 29) and useTiltPress's app-wide press feedback (iteration
    // 24): land directly on the target scale instead of animating. This
    // spring has no overshoot (bounciness: 0) so it's gentler than the
    // swatch pop, but it's still the scale-transform press feedback
    // reduce-motion guidance targets.
    if (reducedMotion) {
      toolbarScales[key].setValue(toValue);
      return;
    }
    // Native-driven, no-overshoot spring — only ever touches `transform`,
    // so it can't affect this footer's layout/screen-fit (see the
    // "toolbar row screen-fit" note above).
    const animation = Animated.spring(toolbarScales[key], {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    });
    activeToolbarAnimationsRef.current[key] = animation;
    animation.start();
  }

  useEffect(() => {
    return () => {
      Object.values(activeToolbarAnimationsRef.current).forEach((animation) => animation?.stop());
    };
  }, []);

  // --- Toolbar expand/collapse (this iteration) --------------------------
  // The Fill/Pen/Undo/Clear + palette + pen-size-slider panel now floats as
  // a collapsible overlay over the canvas's bottom edge instead of
  // permanently occupying a footer strip below it — see the render below.
  function expandToolbar() {
    toolbarHasEverExpandedRef.current = true;
    setToolbarExpanded(true);
    animateToolbarSlide(0);
  }

  function collapseToolbar() {
    setToolbarExpanded(false);
    animateToolbarSlide(TOOLBAR_PANEL_SLIDE_DISTANCE);
  }

  function animateToolbarSlide(toValue: number) {
    activeToolbarSlideAnimationRef.current?.stop();
    if (reducedMotion) {
      toolbarSlide.setValue(toValue);
      return;
    }
    // Reuses the same gentle, no-overshoot spring preset as the toolbar
    // buttons' own press feedback (motion.spring.pressGentle) — a
    // slide-in/out panel should feel calm, not bouncy, matching this
    // file's existing "gentle vs bouncy" split (pressGentle for buttons/
    // panel motion, the swatch pop's own speed:20/bounciness:6 reserved for
    // genuine celebratory pops).
    const animation = Animated.spring(toolbarSlide, {
      toValue,
      useNativeDriver: true,
      ...motion.spring.pressGentle,
    });
    activeToolbarSlideAnimationRef.current = animation;
    animation.start();
  }

  useEffect(() => {
    return () => {
      activeToolbarSlideAnimationRef.current?.stop();
    };
  }, []);

  const displayImage = filledImage ?? image;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.canvas,
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {imageLoadFailed ? (
          <View testID="coloring-image-load-error">
            <RaisedCard
              testID="coloring-image-load-error-card"
              color={colors.surface}
              borderColor={coloringAccent.accentDark}
              elevationLevel="level3"
              style={styles.errorCardOuter}
            >
              <View style={styles.errorCardInner}>
                <Text style={styles.errorTitle}>{t('coloringImageLoadError')}</Text>
                <RaisedPrimaryButton
                  testID="coloring-retry"
                  label={t('retry')}
                  onPress={() => setRetryToken((n) => n + 1)}
                  color={coloringAccent.accent}
                  size="compact"
                />
              </View>
            </RaisedCard>
          </View>
        ) : (
          <>
            <View testID="coloring-canvas-touch-area" {...panResponder.panHandlers}>
              {/* Clips zoomed/panned content to the canvas's own footprint
                  so panning never visually spills past its original bounds
                  into the rest of the screen. */}
              <View style={{ width: canvasWidth, height: canvasHeight, overflow: 'hidden' }}>
                <Animated.View
                  testID="coloring-canvas-transform"
                  style={{
                    width: canvasWidth,
                    height: canvasHeight,
                    // Scale about the TOP-LEFT corner (0,0) rather than RN's
                    // default center-origin transform, matching
                    // canvasTransform.ts's own math exactly: a canvas point
                    // (cx,cy) lands on screen at (cx*scale+translateX,
                    // cy*scale+translateY), which only holds with a
                    // top-left transform origin.
                    transformOrigin: [0, 0, 0],
                    transform: [{ translateX: panXY.x }, { translateY: panXY.y }, { scale: scaleAnim }],
                  }}
                >
                  <Canvas style={{ width: canvasWidth, height: canvasHeight }} testID="coloring-canvas">
                    {displayImage && (
                      <SkiaImage image={displayImage} x={0} y={0} width={canvasWidth} height={canvasHeight} />
                    )}
                    {strokes.map((stroke, i) => stroke.path && (
                      <SkiaPath
                        key={i}
                        path={stroke.path}
                        color={stroke.color}
                        style="stroke"
                        strokeWidth={stroke.width}
                        strokeCap="round"
                        strokeJoin="round"
                      />
                    ))}
                    {currentPath && (
                      <SkiaPath
                        path={currentPath}
                        color={selectedDisplayColor}
                        style="stroke"
                        strokeWidth={penWidth}
                        strokeCap="round"
                        strokeJoin="round"
                      />
                    )}
                  </Canvas>
                </Animated.View>
              </View>

              {/* Touch cursor: a sibling of the transformed Animated.View
                  above, NOT inside it — it must track the raw screen point
                  under the fingertip regardless of current zoom/pan, per
                  the "simply touching the screen doesn't look good" request
                  this responds to. Pen mode previews the actual stroke
                  thickness/color; fill mode shows a paint-bucket glyph. */}
              {touchCursor && (
                <View
                  testID="touch-cursor"
                  pointerEvents="none"
                  style={[
                    styles.touchCursorBase,
                    toolMode === 'pen'
                      ? {
                          width: penWidth + 8,
                          height: penWidth + 8,
                          borderRadius: (penWidth + 8) / 2,
                          borderColor: selectedDisplayColor,
                          left: touchCursor.x - (penWidth + 8) / 2,
                          top: touchCursor.y - (penWidth + 8) / 2,
                        }
                      : {
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          borderColor: coloringAccent.accentDark,
                          left: touchCursor.x - 18,
                          top: touchCursor.y - 18,
                        },
                  ]}
                >
                  {toolMode === 'fill' && <Text style={styles.touchCursorFillIcon}>{'\u{1FAA3}'}</Text>}
                </View>
              )}
            </View>

            {/* Toolbar overlay: floats on top of the canvas's bottom edge
                instead of pushing it up, so the canvas always keeps its
                full computed size. Collapsed = a small floating handle;
                expanded = the full Fill/Pen/Undo/Clear/palette panel. */}
            {!toolbarExpanded && (
              <Pressable
                testID="toolbar-handle"
                onPress={expandToolbar}
                accessibilityRole="button"
                accessibilityLabel={t('toolbarExpand')}
                style={[styles.toolbarHandle, { bottom: spacing.md + insets.bottom }]}
              >
                <Text style={styles.toolbarHandleIcon}>{toolMode === 'fill' ? '\u{1FAA3}' : '✏️'}</Text>
              </Pressable>
            )}

            {(toolbarHasEverExpandedRef.current || toolbarExpanded) && (
              <Animated.View
                testID="coloring-toolbar-panel"
                pointerEvents={toolbarExpanded ? 'auto' : 'none'}
                style={[
                  styles.toolbarPanel,
                  elevation.level3,
                  {
                    paddingBottom: spacing.md + insets.bottom,
                    transform: [{ translateY: toolbarSlide }],
                  },
                ]}
              >
                <Pressable
                  testID="toolbar-collapse"
                  onPress={collapseToolbar}
                  accessibilityRole="button"
                  accessibilityLabel={t('toolbarCollapse')}
                  style={styles.toolbarCollapseChevron}
                >
                  <Text style={styles.toolbarCollapseChevronText}>{'\u{2304}'}</Text>
                </Pressable>

                <View
          testID="coloring-toolbar-row"
          style={{
            flexDirection: 'row',
            // See the "toolbar row screen-fit" note in Technical Decisions
            // (iteration 28): with up to 4 buttons visible at once (Fill,
            // Pen, Undo, Clear drawing — reachable together after both a
            // fill and a pen stroke) and German text running noticeably
            // longer than English (`clearDrawing`'s "Zeichnung löschen" is
            // the longest), a hand-computed worst case leaves only a
            // moderate safety margin against a narrow landscape phone's
            // width once notch/gesture-bar insets are subtracted — not the
            // huge, confidently-safe margin the quiz's progress-dots row
            // had (iteration 20). `flexWrap: 'wrap'` costs nothing visually
            // in the common one-row case and removes the overflow risk
            // entirely by dropping excess buttons to a second line instead
            // of clipping them off-screen. `gap` (RN 0.86 supports it,
            // already used elsewhere in this codebase, e.g.
            // QuizScreen.tsx/SettingsScreen.tsx) replaces the old
            // per-button `marginRight` so wrapped rows get consistent
            // vertical spacing too, not just horizontal.
            flexWrap: 'wrap',
            gap: spacing.sm,
            marginBottom: spacing.sm,
          }}
        >
          <Pressable
            testID="tool-fill"
            onPress={() => setToolMode('fill')}
            onPressIn={() => animateToolbarButton('tool-fill', 0.94)}
            onPressOut={() => animateToolbarButton('tool-fill', 1)}
            accessibilityRole="button"
            accessibilityLabel={t('toolFill')}
            accessibilityState={{ selected: toolMode === 'fill' }}
          >
            {/* This inner Animated.View ("button face") is what presses down —
                the outer Pressable's own layout box/hit area never changes,
                the same separation HomeScreen's cardFace/Pressable split
                uses. Restyled onto the shared design-system's raised-button
                look (touchTarget.minimum height, elevation, the activity's
                own accent when active) — the press-in/out spring itself
                (toolbarScales, 0.94/1) is untouched. */}
            <Animated.View
              testID="tool-fill-face"
              style={[
                styles.toolbarButtonFace,
                toolMode === 'fill' ? styles.toolbarButtonFaceActive : styles.toolbarButtonFaceNeutral,
                elevation.level2,
                { transform: [{ scale: toolbarScales['tool-fill'] }] },
              ]}
            >
              <Text style={[styles.toolbarButtonText, toolMode === 'fill' && styles.toolbarButtonTextActive]}>
                {'\u{1FAA3} '}{t('toolFill')}
              </Text>
            </Animated.View>
          </Pressable>
          <Pressable
            testID="tool-pen"
            onPress={() => setToolMode('pen')}
            onPressIn={() => animateToolbarButton('tool-pen', 0.94)}
            onPressOut={() => animateToolbarButton('tool-pen', 1)}
            accessibilityRole="button"
            accessibilityLabel={t('toolPen')}
            accessibilityState={{ selected: toolMode === 'pen' }}
          >
            <Animated.View
              testID="tool-pen-face"
              style={[
                styles.toolbarButtonFace,
                toolMode === 'pen' ? styles.toolbarButtonFaceActive : styles.toolbarButtonFaceNeutral,
                elevation.level2,
                { transform: [{ scale: toolbarScales['tool-pen'] }] },
              ]}
            >
              <Text style={[styles.toolbarButtonText, toolMode === 'pen' && styles.toolbarButtonTextActive]}>
                {'✏️ '}{t('toolPen')}
              </Text>
            </Animated.View>
          </Pressable>
          {canUndoFill && (
            <Pressable
              testID="undo-fill"
              onPress={handleUndoFill}
              onPressIn={() => animateToolbarButton('undo-fill', 0.94)}
              onPressOut={() => animateToolbarButton('undo-fill', 1)}
              accessibilityRole="button"
              accessibilityLabel={t('undoFill')}
            >
              <Animated.View
                testID="undo-fill-face"
                style={[
                  styles.toolbarButtonFace,
                  styles.toolbarButtonFaceNeutral,
                  elevation.level2,
                  { transform: [{ scale: toolbarScales['undo-fill'] }] },
                ]}
              >
                <Text style={styles.toolbarButtonText}>{'↩️ '}{t('undoFill')}</Text>
              </Animated.View>
            </Pressable>
          )}
          {strokes.length > 0 && (
            <Pressable
              testID="clear-drawing"
              onPress={() =>
                // Clearing wipes every pen stroke a child has drawn with a
                // single tap and cannot be undone, so — unlike picking a
                // tool/color, which is trivially reversible — this needs a
                // confirmation step first. Uses the same Alert.alert
                // cancel/confirm pattern already established for
                // SettingsScreen's destructive folder-migration action, for
                // consistency rather than introducing a second confirmation
                // UI in this codebase.
                Alert.alert(
                  t('clearDrawingConfirmTitle'),
                  t('clearDrawingConfirmBody'),
                  [
                    { text: t('clearDrawingConfirmCancel'), style: 'cancel', onPress: () => {} },
                    {
                      text: t('clearDrawingConfirmConfirm'),
                      style: 'destructive',
                      onPress: () => setStrokes([]),
                    },
                  ],
                  { cancelable: true }
                )
              }
              onPressIn={() => animateToolbarButton('clear-drawing', 0.94)}
              onPressOut={() => animateToolbarButton('clear-drawing', 1)}
              accessibilityRole="button"
              accessibilityLabel={t('clearDrawing')}
            >
              <Animated.View
                testID="clear-drawing-face"
                style={[
                  styles.toolbarButtonFace,
                  styles.toolbarButtonFaceDanger,
                  elevation.level2,
                  { transform: [{ scale: toolbarScales['clear-drawing'] }] },
                ]}
              >
                <Text style={[styles.toolbarButtonText, styles.toolbarButtonTextDanger]}>{t('clearDrawing')}</Text>
              </Animated.View>
            </Pressable>
          )}
        </View>

        {toolMode === 'pen' && (
          // Only shown in pen mode — fill mode has no use for a stroke
          // width, and showing it unconditionally would permanently cost
          // this already-tight footer extra height for no benefit. The
          // Slider component itself (and its onValueChange wiring) is
          // untouched — only this surrounding chrome (the raised panel and
          // label/value text) is restyled, plus the Slider's own tint
          // colors so it matches the new bubblegum accent.
          <View testID="pen-size-row" style={[styles.penSizeRow, elevation.level1]}>
            <Text style={styles.penSizeLabel}>{t('penSizeLabel')}</Text>
            <Slider
              testID="pen-size-slider"
              style={{ flex: 1, height: 40 }}
              minimumValue={PEN_STROKE_WIDTH_MIN}
              maximumValue={PEN_STROKE_WIDTH_MAX}
              step={PEN_STROKE_WIDTH_STEP}
              value={penWidth}
              onValueChange={setPenWidth}
              minimumTrackTintColor={coloringAccent.accentDark}
              maximumTrackTintColor={colors.line}
              thumbTintColor={coloringAccent.accent}
              accessibilityLabel={t('penSizeLabel')}
            />
            <Text testID="pen-size-value" style={styles.penSizeValue}>
              {penWidth}
            </Text>
          </View>
        )}

        <ScrollView
          testID="coloring-palette"
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {PALETTE.map((paletteColor, i) => {
            const isSelected = selectedDisplayColor === paletteColor.display;
            return (
              <Pressable
                key={i}
                testID={`palette-color-${i}`}
                accessibilityRole="button"
                accessibilityLabel={t(paletteColor.nameKey)}
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  setSelectedColor(paletteColor.fill);
                  setSelectedDisplayColor(paletteColor.display);
                }}
                // The visual swatch is SWATCH_SIZE (56x56, already at/above
                // the ~48x48 guideline on its own); this hitSlop is a small
                // extra margin of safety, not a requirement. Swatches sit
                // `spacing.sm` (8px) apart, so 2px of hitSlop on each side
                // still leaves a 4px gap between neighboring hit zones — no
                // overlap.
                hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
                style={{
                  width: SWATCH_SIZE,
                  height: SWATCH_SIZE,
                  marginRight: spacing.sm,
                  marginTop: spacing.xs,
                  marginBottom: spacing.xs,
                }}
              >
                {/* Inner Animated.View ("swatch face") carries the actual
                    color/border and the animated selected-state scale — the
                    outer Pressable above stays a fixed-size hit target so
                    the scale pop never disturbs this row's layout, the same
                    Pressable/inner-face split HomeScreen's cards use.
                    Restyled with a bigger, richer circular swatch and a
                    strong raised selection ring (the activity accent's dark
                    border shade + its own elevated shadow when selected) —
                    the pop-on-select scale animation itself (1.12/1, via
                    getSwatchScale/swatchScalesRef above) is untouched. */}
                <Animated.View
                  testID={`palette-color-${i}-swatch`}
                  style={[
                    {
                      width: SWATCH_SIZE,
                      height: SWATCH_SIZE,
                      backgroundColor: paletteColor.display,
                      // Fully circular (radius = half the side) rather than a
                      // rounded square, matching the large circular swatches
                      // used across children's coloring apps.
                      borderRadius: SWATCH_SIZE / 2,
                      borderWidth: isSelected ? 4 : 2,
                      borderColor: isSelected ? coloringAccent.accentDark : colors.line,
                      transform: [{ scale: getSwatchScale(i, isSelected) }],
                    },
                    isSelected ? elevation.level3 : elevation.level1,
                  ]}
                />
              </Pressable>
            );
          })}
        </ScrollView>
              </Animated.View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  errorCardOuter: {
    width: '100%',
    maxWidth: 420,
  },
  errorCardInner: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  errorTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  touchCursorBase: {
    position: 'absolute',
    borderWidth: 2,
    // Translucent so it never fully hides the artwork under the fingertip.
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchCursorFillIcon: {
    fontSize: 16,
  },
  toolbarHandle: {
    position: 'absolute',
    alignSelf: 'center',
    width: touchTarget.primaryCTA,
    height: touchTarget.primaryCTA,
    borderRadius: touchTarget.primaryCTA / 2,
    backgroundColor: coloringAccent.accent,
    borderWidth: 2,
    borderColor: coloringAccent.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.level3,
  },
  toolbarHandleIcon: {
    fontSize: 28,
  },
  toolbarPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  toolbarCollapseChevron: {
    alignSelf: 'center',
    padding: spacing.xs,
    marginBottom: spacing.xs,
  },
  toolbarCollapseChevronText: {
    fontSize: 20,
    color: colors.inkMuted,
  },
  toolbarButtonFace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 2,
  },
  toolbarButtonFaceNeutral: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
  },
  toolbarButtonFaceActive: {
    backgroundColor: coloringAccent.accent,
    borderColor: coloringAccent.accentDark,
  },
  toolbarButtonFaceDanger: {
    backgroundColor: colors.berrySoft,
    borderColor: colors.berryDark,
  },
  toolbarButtonText: {
    fontSize: typography.buttonSmall.fontSize,
    fontWeight: typography.buttonSmall.fontWeight,
    color: colors.ink,
  },
  toolbarButtonTextActive: {
    color: colors.white,
  },
  toolbarButtonTextDanger: {
    color: colors.berryDark,
  },
  penSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  penSizeLabel: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
    color: colors.ink,
  },
  penSizeValue: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
    color: colors.ink,
    minWidth: 28,
    textAlign: 'right',
  },
});
