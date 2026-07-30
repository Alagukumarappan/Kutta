import React, { useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { PieceCountPicker } from '../components/PieceCountPicker';
import { colors, radii, spacing, shadow } from '../theme/tokens';
import {
  computeGridDimensions,
  computePieceRects,
  computePuzzleBoardSize,
  shufflePieceOrder,
  PieceRect,
} from './puzzleGrid';

// Thin border/gap drawn around every piece slot so young children can see the
// grid structure (where each piece belongs) even before it's filled in
// correctly. Purely cosmetic — it sits *around* the piece's rect and does
// not change the rect math itself, so pieces still crop the same regions.
const SLOT_BORDER = 3;

function PuzzlePiece({
  imageUri,
  rect,
  containerSize,
  selected,
}: {
  imageUri: string;
  rect: PieceRect;
  containerSize: number;
  selected: boolean;
}) {
  // rects are computed over a containerSize x containerSize image (see computePieceRects call
  // below), so the piece is a crop of the *full-size* image — no extra scaling is needed.
  // The slot View is sized to the piece's rect and clips (overflow: hidden) the full image,
  // shifted so the correct region lands inside the window.
  return (
    <View
      style={[
        {
          width: rect.width,
          height: rect.height,
          overflow: 'hidden',
          borderWidth: SLOT_BORDER,
          borderColor: selected ? colors.sunDark : colors.mintDark,
          backgroundColor: colors.white,
        },
        selected && styles.pieceSelected,
      ]}
    >
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
        style={styles.screen}
        contentContainerStyle={{
          flexGrow: 1,
          padding: spacing.md,
          paddingTop: spacing.md + insets.top,
          paddingBottom: spacing.md + insets.bottom,
          paddingLeft: spacing.md + insets.left,
          paddingRight: spacing.md + insets.right,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={styles.pickerEmoji}>🧩</Text>
        <Text style={styles.pickerTitle}>{t('puzzlePickPieces')}</Text>
        <View style={{ marginTop: spacing.md, width: '100%', maxWidth: 220 }}>
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
      style={styles.screen}
      contentContainerStyle={{
        padding: spacing.md,
        paddingTop: spacing.md + insets.top,
        paddingBottom: spacing.md + insets.bottom,
        paddingLeft: spacing.md + insets.left,
        paddingRight: spacing.md + insets.right,
        alignItems: 'center',
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.row}>
        <View style={styles.previewCard}>
          <Image source={{ uri: imageUri }} style={styles.previewImage} testID="puzzle-preview" />
          <Text style={styles.previewHint}>{t('puzzleMatchHint')}</Text>
        </View>

        <View style={styles.boardFrame}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: puzzleSize }}>
            {order.map((pieceIndex, slotIndex) => (
              <Pressable
                key={slotIndex}
                testID={`puzzle-slot-${slotIndex}`}
                onPress={() => handleTapSlot(slotIndex)}
                hitSlop={4}
              >
                <PuzzlePiece
                  imageUri={imageUri}
                  rect={rects[pieceIndex]}
                  containerSize={puzzleSize}
                  selected={selectedSlot === slotIndex}
                />
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {isSolved && (
        <View testID="puzzle-complete" style={styles.completeBanner}>
          <Text style={styles.completeEmoji}>🎉</Text>
          <Text style={styles.completeText}>{t('puzzleComplete')}</Text>
          <Text style={styles.completeEmoji}>🎉</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pickerEmoji: {
    fontSize: 56,
    marginBottom: spacing.xs,
  },
  pickerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  previewCard: {
    marginRight: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 3,
    borderColor: colors.mintDark,
    padding: spacing.sm,
    alignItems: 'center',
    ...shadow,
    elevation: 4,
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: radii.md,
  },
  previewHint: {
    marginTop: spacing.xs,
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
    maxWidth: 90,
  },
  boardFrame: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 4,
    borderColor: colors.mintDark,
    padding: spacing.sm,
    ...shadow,
    elevation: 4,
  },
  pieceSelected: {
    ...shadow,
    elevation: 6,
  },
  completeBanner: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.sun,
    borderRadius: radii.xl,
    borderWidth: 4,
    borderColor: colors.sunDark,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow,
    elevation: 5,
  },
  completeEmoji: {
    fontSize: 32,
  },
  completeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.ink,
  },
});
