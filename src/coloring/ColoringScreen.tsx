import React, { useState } from 'react';
import { View } from 'react-native';
import { Canvas, useImage, Image as SkiaImage } from '@shopify/react-native-skia';
import { floodFill } from './floodFill';

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

  function handleCanvasTap(x: number, y: number) {
    if (!image || !pixels) return;
    const width = image.width();
    const height = image.height();
    const updated = floodFill(pixels, width, height, Math.floor(x), Math.floor(y), selectedColor);
    setPixels(updated);
  }

  return (
    <View>
      <Canvas style={{ width: 300, height: 300 }} testID="coloring-canvas">
        {image && <SkiaImage image={image} x={0} y={0} width={300} height={300} />}
      </Canvas>
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
