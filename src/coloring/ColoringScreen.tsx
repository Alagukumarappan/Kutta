import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Text, PanResponder, PanResponderInstance, useWindowDimensions, GestureResponderEvent, Alert, Animated } from 'react-native';
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
import { computeResponsiveRectSize } from '../theme/tokens';
import { colors, spacing, radii, shadow } from '../theme/tokens';
import { PALETTE, RGBA } from './palette';
import { useLanguage } from '../i18n/LanguageContext';
import Slider from '@react-native-community/slider';

// Reserves room for the toolbar + palette footer strip rendered below the
// canvas, and outer margins, so the canvas gets as much of the screen as
// possible while still leaving room to pick a tool/color. This screen is
// landscape-only via RootNavigator's runtime orientation lock (app.json
// itself now uses "default" rather than a manifest-level lock). The footer
// (toolbar row ~36dp + its marginBottom 8dp + the 44dp-tall palette strip
// with 8dp of its own margin + the footer's own paddingTop/paddingBottom
// 8+16dp) comes out to roughly 120dp; 150 leaves a modest margin for a
// second toolbar-row wrap (see the "toolbar row screen-fit" note below)
// without reserving as much dead space as the old flat 200dp estimate did.
const CANVAS_RESERVED_HEIGHT = 150;
const CANVAS_RESERVED_WIDTH = 32;
const CANVAS_MIN_SIZE = 200;
const CANVAS_MAX_SIZE = 900;

// Default stroke width — visually chunky, sized for a child's fingertip,
// not a thin hairline — plus the adjustable range the pen-size slider lets
// the parent/child pick within.
const PEN_STROKE_WIDTH_DEFAULT = 14;
const PEN_STROKE_WIDTH_MIN = 4;
const PEN_STROKE_WIDTH_MAX = 40;
const PEN_STROKE_WIDTH_STEP = 2;

// The pen-size slider row (~40dp) + its marginBottom (8dp) only renders in
// pen mode, so it must only be reserved then too — otherwise switching to
// pen mode would make the real footer taller than CANVAS_RESERVED_HEIGHT
// budgeted for, pushing the footer down past what the canvas's fixed
// height already assumed instead of shrinking the canvas to make room.
const PEN_SIZE_ROW_RESERVED_HEIGHT = 48;

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
  // CANVAS_RESERVED_HEIGHT/WIDTH above assume a "typical" phone's on-screen
  // nav bar; they don't know about *this* device's actual notch/gesture-bar
  // geometry, which varies (e.g. a Samsung S22's cutout and 3-button/gesture
  // nav differ from the emulator's). Add the real, per-device bottom/left/
  // right insets on top of those fixed margins so the canvas never shrinks
  // *into* what it originally reserved (the fixed constants still cover the
  // footer chrome; the insets cover the additional system-reserved area
  // outside that). insets.top is deliberately NOT added here: this screen is
  // shown with headerShown:true (see RootNavigator), so the native header
  // already consumes the top inset before this component's flex:1 container
  // gets its share of the window — adding it again would double-count it.
  // Rectangular, not square: a landscape phone is short-but-wide, so
  // constraining the canvas to a square would shrink its width down to
  // match the tighter height budget, wasting most of the screen's width as
  // blank margin and leaving the child's actual picture much smaller than
  // it needs to be. Width and height each get their own full share of the
  // available space instead.
  const { width: canvasWidth, height: canvasHeight } = computeResponsiveRectSize(
    width,
    height,
    CANVAS_RESERVED_HEIGHT + (toolMode === 'pen' ? PEN_SIZE_ROW_RESERVED_HEIGHT : 0) + insets.bottom,
    CANVAS_RESERVED_WIDTH + insets.left + insets.right,
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

  const panResponder = useRef<PanResponderInstance>(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => toolModeRef.current === 'pen',
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        if (toolModeRef.current !== 'pen') return;
        const { locationX, locationY } = evt.nativeEvent;
        // Pen strokes are drawn as an overlay directly on the Canvas, which
        // is already sized to canvasWidth/canvasHeight - the same
        // coordinate space these locationX/locationY touch coordinates
        // arrive in, so no further
        // scaling is needed here (unlike the fill-mode pixel-buffer lookup,
        // which maps this same raw coordinate into the image's native pixel
        // space instead).
        const path = Skia.Path.Make();
        path.moveTo(locationX, locationY);
        activePathRef.current = path;
        setCurrentPath(path.copy());
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        if (toolModeRef.current !== 'pen' || !activePathRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        activePathRef.current.lineTo(locationX, locationY);
        setCurrentPath(activePathRef.current.copy());
      },
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        if (toolModeRef.current === 'pen') {
          finishActiveStroke();
          return;
        }
        const { locationX, locationY } = evt.nativeEvent;
        handleCanvasTap(locationX, locationY);
      },
      onPanResponderTerminate: () => {
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

  useEffect(() => {
    const prevColor = prevSelectedDisplayColorRef.current;
    prevSelectedDisplayColorRef.current = selectedDisplayColor;
    if (prevColor === selectedDisplayColor) return;

    function pop(index: number, toValue: number) {
      const scale = getSwatchScale(index, false);
      activeSwatchAnimationsRef.current.get(index)?.stop();
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
  }, [selectedDisplayColor]);

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

  const displayImage = filledImage ?? image;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {imageLoadFailed ? (
          <View testID="coloring-image-load-error" style={{ alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: 'bold',
                color: colors.ink,
                textAlign: 'center',
                marginBottom: spacing.md,
              }}
            >
              {t('coloringImageLoadError')}
            </Text>
            <Pressable
              testID="coloring-retry"
              onPress={() => setRetryToken((n) => n + 1)}
              accessibilityRole="button"
              accessibilityLabel={t('retry')}
              style={{
                backgroundColor: colors.coral,
                borderColor: colors.coralDark,
                borderWidth: 2,
                borderRadius: radii.xl,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.xl,
                ...shadow,
                elevation: 4,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.white }}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : (
        <View testID="coloring-canvas-touch-area" {...panResponder.panHandlers}>
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
        </View>
        )}
      </View>

      <View
        testID="coloring-footer"
        style={{
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md + insets.bottom,
          paddingTop: spacing.sm,
        }}
      >
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
          >
            {/* This inner Animated.View ("button face") is what presses down —
                the outer Pressable's own layout box/hit area never changes,
                the same separation HomeScreen's cardFace/Pressable split
                uses. */}
            <Animated.View
              testID="tool-fill-face"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
                borderRadius: radii.md,
                backgroundColor: toolMode === 'fill' ? colors.sky : colors.white,
                borderWidth: 2,
                borderColor: toolMode === 'fill' ? colors.skyDark : colors.disabledBorder,
                transform: [{ scale: toolbarScales['tool-fill'] }],
              }}
            >
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{'\u{1FAA3} '}{t('toolFill')}</Text>
            </Animated.View>
          </Pressable>
          <Pressable
            testID="tool-pen"
            onPress={() => setToolMode('pen')}
            onPressIn={() => animateToolbarButton('tool-pen', 0.94)}
            onPressOut={() => animateToolbarButton('tool-pen', 1)}
          >
            <Animated.View
              testID="tool-pen-face"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
                borderRadius: radii.md,
                backgroundColor: toolMode === 'pen' ? colors.sky : colors.white,
                borderWidth: 2,
                borderColor: toolMode === 'pen' ? colors.skyDark : colors.disabledBorder,
                transform: [{ scale: toolbarScales['tool-pen'] }],
              }}
            >
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{'✏️ '}{t('toolPen')}</Text>
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
                style={{
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                  borderRadius: radii.md,
                  backgroundColor: colors.white,
                  borderWidth: 2,
                  borderColor: colors.disabledBorder,
                  transform: [{ scale: toolbarScales['undo-fill'] }],
                }}
              >
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{'↩️ '}{t('undoFill')}</Text>
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
            >
              <Animated.View
                testID="clear-drawing-face"
                style={{
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                  borderRadius: radii.md,
                  backgroundColor: colors.white,
                  borderWidth: 2,
                  borderColor: colors.disabledBorder,
                  transform: [{ scale: toolbarScales['clear-drawing'] }],
                }}
              >
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{t('clearDrawing')}</Text>
              </Animated.View>
            </Pressable>
          )}
        </View>

        {toolMode === 'pen' && (
          // Only shown in pen mode — fill mode has no use for a stroke
          // width, and showing it unconditionally would permanently cost
          // this already-tight footer extra height for no benefit.
          <View
            testID="pen-size-row"
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}
          >
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{t('penSizeLabel')}</Text>
            <Slider
              testID="pen-size-slider"
              style={{ flex: 1, height: 40 }}
              minimumValue={PEN_STROKE_WIDTH_MIN}
              maximumValue={PEN_STROKE_WIDTH_MAX}
              step={PEN_STROKE_WIDTH_STEP}
              value={penWidth}
              onValueChange={setPenWidth}
              minimumTrackTintColor={colors.skyDark}
              maximumTrackTintColor={colors.disabledBorder}
              thumbTintColor={colors.sky}
              accessibilityLabel={t('penSizeLabel')}
            />
            <Text testID="pen-size-value" style={{ color: colors.ink, fontWeight: '600', minWidth: 28 }}>
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
                // The visual swatch is 44x44; this extends the tappable
                // (not visible) area by 2px on every edge so the effective
                // tap target meets the ~48x48 logical-pixel guideline.
                // Swatches sit `spacing.sm` (8px) apart, so 2px of hitSlop
                // on each side still leaves a 4px gap between neighboring
                // hit zones — no overlap.
                hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
                style={{
                  width: 44,
                  height: 44,
                  marginRight: spacing.sm,
                  marginTop: spacing.xs,
                  marginBottom: spacing.xs,
                }}
              >
                {/* Inner Animated.View ("swatch face") carries the actual
                    color/border and the animated selected-state scale — the
                    outer Pressable above stays a fixed-size hit target so
                    the scale pop never disturbs this row's layout, the same
                    Pressable/inner-face split HomeScreen's cards use. */}
                <Animated.View
                  testID={`palette-color-${i}-swatch`}
                  style={{
                    width: 44,
                    height: 44,
                    backgroundColor: paletteColor.display,
                    // Fully circular (radius = half the side) rather than a
                    // rounded square, matching the large circular swatches
                    // used across children's coloring apps.
                    borderRadius: 22,
                    borderWidth: isSelected ? 3 : 1,
                    borderColor: isSelected ? colors.ink : colors.disabledBorder,
                    // Slight scale-up on the selected swatch, on top of the
                    // existing border-ring change, so the "currently loaded"
                    // color is unmistakable at a glance — now animated into
                    // a light spring "pop" rather than snapping instantly.
                    transform: [{ scale: getSwatchScale(i, isSelected) }],
                  }}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
