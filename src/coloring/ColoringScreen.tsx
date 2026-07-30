import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
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

const CANVAS_SIZE = 300;

const PALETTE: [number, number, number, number][] = [
  [255, 0, 0, 255],
  [0, 128, 0, 255],
  [0, 0, 255, 255],
  [255, 200, 0, 255],
  [150, 75, 0, 255],
];

export function ColoringScreen({ imageUri }: { imageUri: string }) {
  const image = useImage(imageUri);
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
    const pixelX = Math.floor((x / CANVAS_SIZE) * width);
    const pixelY = Math.floor((y / CANVAS_SIZE) * height);
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
    <View>
      <View
        testID="coloring-canvas-touch-area"
        onTouchEnd={(e) => handleCanvasTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      >
        <Canvas style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }} testID="coloring-canvas">
          {displayImage && (
            <SkiaImage image={displayImage} x={0} y={0} width={CANVAS_SIZE} height={CANVAS_SIZE} />
          )}
        </Canvas>
      </View>
      <View testID="coloring-palette">
        {PALETTE.map((color, i) => (
          <View
            key={i}
            testID={`palette-color-${i}`}
            style={{ backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})`, width: 30, height: 30 }}
            onTouchEnd={() => setSelectedColor(color)}
          />
        ))}
      </View>
    </View>
  );
}
