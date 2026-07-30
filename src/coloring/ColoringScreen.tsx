import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Text, PanResponder, PanResponderInstance, useWindowDimensions, GestureResponderEvent } from 'react-native';
import {
  Canvas,
  useImage,
  Image as SkiaImage,
  Path as SkiaPath,
  Skia,
  SkPath,
  ColorType,
  AlphaType,
  SkImage,
} from '@shopify/react-native-skia';
import { floodFill } from './floodFill';
import { computeResponsiveSquareSize } from '../theme/tokens';
import { colors, spacing, radii } from '../theme/tokens';
import { PALETTE, RGBA } from './palette';
import { useLanguage } from '../i18n/LanguageContext';

// Reserves room for the toolbar + palette footer strip rendered below the
// canvas, and outer margins, so the canvas gets as much of the screen as
// possible while still leaving room to pick a tool/color.
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
  const image = useImage(imageUri);
  const { width, height } = useWindowDimensions();
  const canvasSize = computeResponsiveSquareSize(
    width,
    height,
    CANVAS_RESERVED_HEIGHT,
    CANVAS_RESERVED_WIDTH,
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
          if (activePathRef.current) {
            setStrokes((prev) => [...prev, { path: activePathRef.current!, color: selectedDisplayColorRef.current }]);
          }
          activePathRef.current = null;
          setCurrentPath(null);
          return;
        }
        const { locationX, locationY } = evt.nativeEvent;
        handleCanvasTap(locationX, locationY);
      },
    })
  ).current;

  const displayImage = filledImage ?? image;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View testID="coloring-canvas-touch-area" {...panResponder.panHandlers}>
          <Canvas style={{ width: canvasSize, height: canvasSize }} testID="coloring-canvas">
            {displayImage && (
              <SkiaImage image={displayImage} x={0} y={0} width={canvasSize} height={canvasSize} />
            )}
            {strokes.map((stroke, i) => (
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
      </View>

      <View
        testID="coloring-footer"
        style={{
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md,
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
          {PALETTE.map((paletteColor, i) => (
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
                borderRadius: radii.md,
                marginRight: spacing.sm,
                borderWidth: selectedDisplayColor === paletteColor.display ? 3 : 1,
                borderColor: selectedDisplayColor === paletteColor.display ? colors.ink : colors.disabledBorder,
              }}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
