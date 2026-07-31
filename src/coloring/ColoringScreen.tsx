import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Text, PanResponder, PanResponderInstance, useWindowDimensions, GestureResponderEvent, Alert } from 'react-native';
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

// Visually chunky stroke width sized for a child's fingertip, not a thin
// hairline.
const PEN_STROKE_WIDTH = 14;

type ToolMode = 'fill' | 'pen';

interface Stroke {
  path: SkPath;
  color: string;
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
    CANVAS_RESERVED_HEIGHT + insets.bottom,
    CANVAS_RESERVED_WIDTH + insets.left + insets.right,
    CANVAS_MIN_SIZE,
    CANVAS_MAX_SIZE
  );
  const [selectedColor, setSelectedColor] = useState<RGBA>(PALETTE[0].fill);
  const [selectedDisplayColor, setSelectedDisplayColor] = useState<string>(PALETTE[0].display);
  const [pixels, setPixels] = useState<Uint8ClampedArray | null>(null);
  const [filledImage, setFilledImage] = useState<SkImage | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>('fill');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentPath, setCurrentPath] = useState<SkPath | null>(null);

  // PanResponder callbacks are created once and must always act on the
  // latest state/props, so mirror the values that change over time into
  // refs read from inside the (stable) gesture handlers.
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;
  const selectedColorRef = useRef(selectedColor);
  selectedColorRef.current = selectedColor;
  const selectedDisplayColorRef = useRef(selectedDisplayColor);
  selectedDisplayColorRef.current = selectedDisplayColor;
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
    const pixelX = Math.floor((x / canvasSizeRef.current) * width);
    const pixelY = Math.floor((y / canvasSizeRef.current) * height);
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
      setStrokes((prev) => [...prev, { path: finished, color: selectedDisplayColorRef.current }]);
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
        // is already sized to canvasSize - the same coordinate space these
        // locationX/locationY touch coordinates arrive in, so no further
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
          <Canvas style={{ width: canvasSize, height: canvasSize }} testID="coloring-canvas">
            {displayImage && (
              <SkiaImage image={displayImage} x={0} y={0} width={canvasSize} height={canvasSize} />
            )}
            {strokes.map((stroke, i) => stroke.path && (
              <SkiaPath
                key={i}
                path={stroke.path}
                color={stroke.color}
                style="stroke"
                strokeWidth={PEN_STROKE_WIDTH}
                strokeCap="round"
                strokeJoin="round"
              />
            ))}
            {currentPath && (
              <SkiaPath
                path={currentPath}
                color={selectedDisplayColor}
                style="stroke"
                strokeWidth={PEN_STROKE_WIDTH}
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
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
              borderRadius: radii.md,
              backgroundColor: toolMode === 'fill' ? colors.sky : colors.white,
              borderWidth: 2,
              borderColor: toolMode === 'fill' ? colors.skyDark : colors.disabledBorder,
            }}
          >
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{'\u{1FAA3} '}{t('toolFill')}</Text>
          </Pressable>
          <Pressable
            testID="tool-pen"
            onPress={() => setToolMode('pen')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
              borderRadius: radii.md,
              backgroundColor: toolMode === 'pen' ? colors.sky : colors.white,
              borderWidth: 2,
              borderColor: toolMode === 'pen' ? colors.skyDark : colors.disabledBorder,
            }}
          >
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{'✏️ '}{t('toolPen')}</Text>
          </Pressable>
          {canUndoFill && (
            <Pressable
              testID="undo-fill"
              onPress={handleUndoFill}
              accessibilityRole="button"
              accessibilityLabel={t('undoFill')}
              style={{
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
                borderRadius: radii.md,
                backgroundColor: colors.white,
                borderWidth: 2,
                borderColor: colors.disabledBorder,
              }}
            >
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{'↩️ '}{t('undoFill')}</Text>
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
              style={{
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
                borderRadius: radii.md,
                backgroundColor: colors.white,
                borderWidth: 2,
                borderColor: colors.disabledBorder,
              }}
            >
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{t('clearDrawing')}</Text>
            </Pressable>
          )}
        </View>

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
                  backgroundColor: paletteColor.display,
                  width: 44,
                  height: 44,
                  // Fully circular (radius = half the side) rather than a
                  // rounded square, matching the large circular swatches
                  // used across children's coloring apps.
                  borderRadius: 22,
                  marginRight: spacing.sm,
                  marginTop: spacing.xs,
                  marginBottom: spacing.xs,
                  borderWidth: isSelected ? 3 : 1,
                  borderColor: isSelected ? colors.ink : colors.disabledBorder,
                  // Slight scale-up on the selected swatch, on top of the
                  // existing border-ring change, so the "currently loaded"
                  // color is unmistakable at a glance.
                  transform: [{ scale: isSelected ? 1.12 : 1 }],
                }}
              />
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
