import React, { useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { computeGridDimensions, computePieceRects, shufflePieceOrder, PieceRect } from './puzzleGrid';

const PUZZLE_SIZE = 300;
const PIECE_COUNT_OPTIONS: (4 | 6 | 9 | 12)[] = [4, 6, 9, 12];

function PuzzlePiece({ imageUri, rect, containerSize }: { imageUri: string; rect: PieceRect; containerSize: number }) {
  // rects are computed over a containerSize x containerSize image (see computePieceRects call
  // below), so the piece is a crop of the *full-size* image — no extra scaling is needed.
  // The slot View is sized to the piece's rect and clips (overflow: hidden) the full image,
  // shifted so the correct region lands inside the window.
  return (
    <View style={{ width: rect.width, height: rect.height, overflow: 'hidden' }}>
      <Image
        testID="puzzle-piece-image"
        source={{ uri: imageUri }}
        style={{
          width: containerSize,
          height: containerSize,
          marginLeft: -rect.x,
          marginTop: -rect.y,
        }}
      />
    </View>
  );
}

export function PuzzleScreen({ imageUri }: { imageUri: string }) {
  const { t } = useLanguage();
  const [pieceCount, setPieceCount] = useState<4 | 6 | 9 | 12 | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  function startPuzzle(count: 4 | 6 | 9 | 12) {
    setPieceCount(count);
    setOrder(shufflePieceOrder(count));
    setSelectedSlot(null);
  }

  function handleTapSlot(slotIndex: number) {
    if (selectedSlot === null) {
      setSelectedSlot(slotIndex);
      return;
    }
    if (selectedSlot === slotIndex) {
      setSelectedSlot(null);
      return;
    }
    const next = order.slice();
    [next[selectedSlot], next[slotIndex]] = [next[slotIndex], next[selectedSlot]];
    setOrder(next);
    setSelectedSlot(null);
  }

  if (!pieceCount) {
    return (
      <View>
        <Text>{t('puzzlePickPieces')}</Text>
        {PIECE_COUNT_OPTIONS.map((count) => (
          <Pressable key={count} testID={`piece-count-${count}`} onPress={() => startPuzzle(count)}>
            <Text>{count}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  const { rows, cols } = computeGridDimensions(pieceCount);
  const rects = computePieceRects(PUZZLE_SIZE, PUZZLE_SIZE, rows, cols);
  const isSolved = order.every((pieceIndex, slotIndex) => pieceIndex === slotIndex);

  return (
    <View>
      <Image source={{ uri: imageUri }} style={{ width: 80, height: 80 }} testID="puzzle-preview" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: PUZZLE_SIZE }}>
        {order.map((pieceIndex, slotIndex) => (
          <Pressable key={slotIndex} testID={`puzzle-slot-${slotIndex}`} onPress={() => handleTapSlot(slotIndex)}>
            <PuzzlePiece imageUri={imageUri} rect={rects[pieceIndex]} containerSize={PUZZLE_SIZE} />
          </Pressable>
        ))}
      </View>
      {isSolved && <Text testID="puzzle-complete">🎉</Text>}
    </View>
  );
}
