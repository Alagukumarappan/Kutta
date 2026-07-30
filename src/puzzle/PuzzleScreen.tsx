import React, { useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { PieceCountPicker } from '../components/PieceCountPicker';
import {
  computeGridDimensions,
  computePieceRects,
  computePuzzleBoardSize,
  shufflePieceOrder,
  PieceRect,
} from './puzzleGrid';

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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const puzzleSize = computePuzzleBoardSize(width, height, insets);
  const [pieceCount, setPieceCount] = useState<4 | 6 | 9 | 12 | null>(null);
  const [pieceCountModalVisible, setPieceCountModalVisible] = useState(false);
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
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16 + insets.top,
          paddingBottom: 16 + insets.bottom,
          paddingLeft: 16 + insets.left,
          paddingRight: 16 + insets.right,
          alignItems: 'center',
        }}
      >
        <Text>{t('puzzlePickPieces')}</Text>
        <View style={{ marginTop: 8, width: '100%', maxWidth: 200 }}>
          <PieceCountPicker
            value={pieceCount}
            onChange={startPuzzle}
            visible={pieceCountModalVisible}
            onOpen={() => setPieceCountModalVisible(true)}
            onClose={() => setPieceCountModalVisible(false)}
            placeholder={t('puzzlePickPieces')}
            testIDPrefix="puzzle-piece-count"
          />
        </View>
      </ScrollView>
    );
  }

  const { rows, cols } = computeGridDimensions(pieceCount);
  const rects = computePieceRects(puzzleSize, puzzleSize, rows, cols);
  const isSolved = order.every((pieceIndex, slotIndex) => pieceIndex === slotIndex);

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        paddingTop: 16 + insets.top,
        paddingBottom: 16 + insets.bottom,
        paddingLeft: 16 + insets.left,
        paddingRight: 16 + insets.right,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ marginRight: 16 }}>
          <Image source={{ uri: imageUri }} style={{ width: 80, height: 80 }} testID="puzzle-preview" />
          {isSolved && <Text testID="puzzle-complete">🎉</Text>}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: puzzleSize }}>
          {order.map((pieceIndex, slotIndex) => (
            <Pressable key={slotIndex} testID={`puzzle-slot-${slotIndex}`} onPress={() => handleTapSlot(slotIndex)}>
              <PuzzlePiece imageUri={imageUri} rect={rects[pieceIndex]} containerSize={puzzleSize} />
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
