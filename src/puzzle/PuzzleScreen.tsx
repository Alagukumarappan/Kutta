import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
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

// Thin border drawn around every piece slot so young children can see the
// grid structure (where each piece belongs) even before it's filled in
// correctly. Because React Native uses border-box sizing, this border sits
// *inside* the slot's rect rather than around it, so it crops a few px off
// each edge of the piece's image content (a minor trade-off — not worth
// insetting the image to compensate, since the crop is small and the
// border's visual purpose matters more than pixel-perfect image cropping).
const SLOT_BORDER = 3;

function PuzzlePiece({
  imageUri,
  rect,
  containerWidth,
  containerHeight,
  selected,
}: {
  imageUri: string;
  rect: PieceRect;
  containerWidth: number;
  containerHeight: number;
  selected: boolean;
}) {
  // rects are computed over a containerWidth x containerHeight image (see computePieceRects
  // call below, which is now passed the board's real, aspect-ratio-correct width/height
  // instead of assuming a square source photo), so the piece is a crop of the *full-size*
  // image — no extra scaling is needed. The slot View is sized to the piece's rect and clips
  // (overflow: hidden) the full image, shifted so the correct region lands inside the window.
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
          width: containerWidth,
          height: containerHeight,
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
  // This screen is shown with headerShown:true (see RootNavigator), so the
  // native header already consumes the top safe-area inset before this
  // component's flex:1 container gets its share of the window — unlike
  // HomeScreen (headerShown:false), which is the one screen that has to
  // account for insets.top itself. Zero out top here so it isn't double-
  // counted on top of what the header already reserved; bottom/left/right
  // still need to be handled since the header doesn't cover those.
  const [pieceCount, setPieceCount] = useState<4 | 6 | 9 | 12 | null>(null);
  const [pieceCountModalVisible, setPieceCountModalVisible] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  // The board's shape and crop rects depend on the ACTUAL picked photo's real
  // width/height (a portrait photo needs a tall board and tall piece shapes,
  // not a square one) - imageSize is null until Image.getSize resolves.
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [imageSizeFailed, setImageSizeFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setImageSize(null);
    setImageSizeFailed(false);
    Image.getSize(
      imageUri,
      (imgWidth, imgHeight) => {
        if (!cancelled) setImageSize({ width: imgWidth, height: imgHeight });
      },
      () => {
        // Photo dimensions couldn't be read - fall back to treating it as
        // square rather than blocking/crashing the puzzle.
        if (!cancelled) setImageSizeFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [imageUri]);

  // While still loading, assume square (matches old behavior) so the picker
  // screen isn't blocked on the photo's real size; once loaded (or failed),
  // computePuzzleBoardSize/computeGridDimensions use the real proportions.
  const imageWidth = imageSize?.width ?? 1;
  const imageHeight = imageSize?.height ?? 1;
  const isPortrait = imageWidth < imageHeight;
  const board = computePuzzleBoardSize(width, height, imageWidth, imageHeight, { ...insets, top: 0 });
  const isImageSizeReady = imageSize !== null || imageSizeFailed;

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

  if (!isImageSizeReady) {
    return (
      <View style={[styles.screen, styles.loadingContainer]} testID="puzzle-loading">
        <ActivityIndicator size="large" color={colors.mintDark} />
      </View>
    );
  }

  const { rows, cols } = computeGridDimensions(pieceCount, isPortrait);
  const rects = computePieceRects(board.width, board.height, rows, cols);
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: board.width }}>
            {order.map((pieceIndex, slotIndex) => (
              <Pressable
                key={slotIndex}
                testID={`puzzle-slot-${slotIndex}`}
                onPress={() => handleTapSlot(slotIndex)}
              >
                <PuzzlePiece
                  imageUri={imageUri}
                  rect={rects[pieceIndex]}
                  containerWidth={board.width}
                  containerHeight={board.height}
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
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
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
