import React, { useEffect, useState } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import {
  Canvas,
  useImage,
  Image as SkiaImage,
  Skia,
  ColorType,
  AlphaType,
  SkImage,
} from '@shopify/react-native-skia';
import { floodFill } from './floodFill';
import { computeResponsiveSquareSize } from '../theme/tokens';

// Reserves room for the palette strip (rendered beside the canvas in
// landscape) and outer margins, so the canvas sizes to fit a short-but-wide
// window instead of overflowing it.
const CANVAS_RESERVED_HEIGHT = 80;
const CANVAS_RESERVED_WIDTH = 140;
const CANVAS_MIN_SIZE = 200;
const CANVAS_MAX_SIZE = 420;

const PALETTE: [number, number, number, number][] = [
  [255, 0, 0, 255],
  [0, 128, 0, 255],
  [0, 0, 255, 255],
  [255, 200, 0, 255],
  [150, 75, 0, 255],
];

export function ColoringScreen({ imageUri }: { imageUri: string }) {
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
  const [selectedColor, setSelectedColor] = useState<[number, number, number, number]>(PALETTE[0]);
  const [pixels, setPixels] = useState<Uint8ClampedArray | null>(null);
  const [filledImage, setFilledImage] = useState<SkImage | null>(null);

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
  }, [image]);

  function handleCanvasTap(x: number, y: number) {
    if (!image || !pixels) return;
    const width = image.width();
    const height = image.height();

    // Tap coordinates arrive in the Canvas's displayed (possibly scaled)
    // coordinate space; map them back into the pixel buffer's native space.
    const pixelX = Math.floor((x / canvasSize) * width);
    const pixelY = Math.floor((y / canvasSize) * height);
    if (pixelX < 0 || pixelY < 0 || pixelX >= width || pixelY >= height) return;

    const updated = floodFill(pixels, width, height, pixelX, pixelY, selectedColor);
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

  const displayImage = filledImage ?? image;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View
          testID="coloring-canvas-touch-area"
          onTouchEnd={(e) => handleCanvasTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        >
          <Canvas style={{ width: canvasSize, height: canvasSize }} testID="coloring-canvas">
            {displayImage && (
              <SkiaImage image={displayImage} x={0} y={0} width={canvasSize} height={canvasSize} />
            )}
          </Canvas>
        </View>
        <View testID="coloring-palette" style={{ marginLeft: 16 }}>
          {PALETTE.map((color, i) => (
            <View
              key={i}
              testID={`palette-color-${i}`}
              style={{
                backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})`,
                width: 36,
                height: 36,
                marginBottom: 8,
              }}
              onTouchEnd={() => setSelectedColor(color)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
