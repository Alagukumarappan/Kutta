import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Text, PanResponder, PanResponderInstance, useWindowDimensions, GestureResponderEvent } from 'react-native';
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
import { computeResponsiveSquareSize } from '../theme/tokens';
import { colors, spacing, radii } from '../theme/tokens';
import { PALETTE, RGBA } from './palette';
import { useLanguage } from '../i18n/LanguageContext';

// Reserves room for the toolbar + palette footer strip rendered below the
// canvas, and outer margins, so the canvas gets as much of the screen as
// possible while still leaving room to pick a tool/color. This screen is
// landscape-only via RootNavigator's runtime orientation lock (app.json
// itself now uses "default" rather than a manifest-level lock). The footer
// (toolbar buttons + palette swatches + padding/margins) needs roughly
// 180-190dp on a typical phone, so 200 leaves a small margin rather than
// letting the canvas clip against the footer.
const CANVAS_RESERVED_HEIGHT = 200;
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
  const canvasSize = computeResponsiveSquareSize(
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
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;
  const imageRef = useRef(image);
  imageRef.current = image;
  const pixelsRef = useRef(pixels);
  pixelsRef.current = pixels;

  const activePathRef = useRef<SkPath | null>(null);

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
  }, [imageUri]);

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
          <View testID="coloring-image-load-error">
            <Text style={{ color: colors.ink }}>{t('coloringImageLoadError')}</Text>
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
        <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
          <Pressable
            testID="tool-fill"
            onPress={() => setToolMode('fill')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
              borderRadius: radii.md,
              marginRight: spacing.sm,
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
              marginRight: spacing.sm,
              backgroundColor: toolMode === 'pen' ? colors.sky : colors.white,
              borderWidth: 2,
              borderColor: toolMode === 'pen' ? colors.skyDark : colors.disabledBorder,
            }}
          >
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{'✏️ '}{t('toolPen')}</Text>
          </Pressable>
          {strokes.length > 0 && (
            <Pressable
              testID="clear-drawing"
              onPress={() => setStrokes([])}
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
                onPress={() => {
                  setSelectedColor(paletteColor.fill);
                  setSelectedDisplayColor(paletteColor.display);
                }}
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
