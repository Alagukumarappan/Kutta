import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Animated,
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
  groupPiecesIntoRows,
  PieceRect,
} from './puzzleGrid';

// Thin border drawn around every piece slot so young children can see the
// grid structure (where each piece belongs) even before it's filled in
// correctly. Because React Native uses border-box sizing, this border sits
// *inside* the slot's rect rather than around it. Since the piece's <Image>
// is anchored to the slot's top-left corner (marginLeft: -rect.x, marginTop:
// -rect.y puts the crop's own top-left exactly at the content box's origin),
// the border only eats into the visible crop on the RIGHT and BOTTOM edges
// (the far edges of the content box, which is `SLOT_BORDER` px narrower/
// shorter than the outer rect on each of those sides) - the top and left
// edges of the crop are left untouched. Not worth insetting the image to
// compensate, since the crop is small and the border's visual purpose
// matters more than pixel-perfect image cropping.
const SLOT_BORDER = 3;

function PuzzlePiece({
  imageUri,
  rect,
  containerWidth,
  containerHeight,
  selected,
  scale,
}: {
  imageUri: string;
  rect: PieceRect;
  containerWidth: number;
  containerHeight: number;
  selected: boolean;
  scale: Animated.Value;
}) {
  // rects are computed over a containerWidth x containerHeight image (see computePieceRects
  // call below, which is now passed the board's real, aspect-ratio-correct width/height
  // instead of assuming a square source photo), so the piece is a crop of the *full-size*
  // image — no extra scaling is needed. The slot View is sized to the piece's rect and clips
  // (overflow: hidden) the full image, shifted so the correct region lands inside the window.
  // The outer View is Animated so a piece can pop briefly (scale only — never width/height)
  // the moment it snaps into its correct slot, without affecting layout/siblings.
  return (
    <Animated.View
      style={[
        {
          width: rect.width,
          height: rect.height,
          overflow: 'hidden',
          borderWidth: SLOT_BORDER,
          borderColor: selected ? colors.sunDark : colors.mintDark,
          backgroundColor: colors.white,
          transform: [{ scale }],
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
    </Animated.View>
  );
}

// Pop-in entrance for the puzzle-COMPLETE banner — the exact recipe already
// established for the quiz's feedback card (QuestionRenderer.tsx's
// cardScaleAnim/cardOpacityAnim): starts slightly shrunk/invisible (0.85/0)
// and springs to rest (1/1), speed 20 / bounciness 6 for the scale, a 220ms
// timing for the opacity. This component only exists in the tree while
// `isSolved` is true (see the `{isSolved && <CompletionBanner ... />}` call
// site below), so a plain mount-effect is enough to replay the pop-in every
// time the banner (re)appears — no separate show/hide toggle needed.
function CompletionBanner({ text }: { text: string }) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [scaleAnim, opacityAnim]);

  return (
    <Animated.View
      testID="puzzle-complete"
      style={[styles.completeBanner, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
    >
      <Text style={styles.completeEmoji}>🎉</Text>
      <Text style={styles.completeText}>{text}</Text>
      <Text style={styles.completeEmoji}>🎉</Text>
    </Animated.View>
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

  // One lazily-created, cached Animated.Value per SLOT (not per piece id) —
  // the piece currently sitting in a given slot is what visually pops, and a
  // slot's occupant only ever changes via handleTapSlot's swap, so keying by
  // slot position (rather than piece index) is what stays stable across a
  // swap and lets the SAME Animated.Value keep animating for that slot.
  const pieceScalesRef = useRef<Map<number, Animated.Value>>(new Map());
  function getPieceScale(slotIndex: number): Animated.Value {
    let value = pieceScalesRef.current.get(slotIndex);
    if (!value) {
      value = new Animated.Value(1);
      pieceScalesRef.current.set(slotIndex, value);
    }
    return value;
  }

  // Tracks, per slot, whether it held its correctly-placed piece as of the
  // last render — null means "no baseline yet" (fresh mount, or a puzzle
  // just (re)started via startPuzzle), which deliberately suppresses
  // animating any slot that happens to already be correct: only a real
  // false -> true transition (a piece actually snapping into place) should
  // trigger the celebratory pop, never the shuffle's own starting layout.
  const prevCorrectRef = useRef<boolean[] | null>(null);

  useEffect(() => {
    if (order.length === 0) {
      prevCorrectRef.current = null;
      return;
    }
    const currentCorrect = order.map((pieceIndex, slotIndex) => pieceIndex === slotIndex);
    const prev = prevCorrectRef.current;
    if (prev) {
      currentCorrect.forEach((correct, slotIndex) => {
        if (correct && !prev[slotIndex]) {
          const scale = getPieceScale(slotIndex);
          // Brief celebratory pop — scale 1 -> 1.15 -> 1 — instead of the
          // instant snap that just happened to the piece's position.
          Animated.sequence([
            Animated.spring(scale, { toValue: 1.15, useNativeDriver: true, speed: 30, bounciness: 8 }),
            Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
          ]).start();
        }
      });
    }
    prevCorrectRef.current = currentCorrect;
  }, [order]);

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
    // Fresh puzzle: clear the correctness baseline so the new shuffle's
    // starting layout (even if a slot happens to land correctly by chance)
    // never triggers the piece-snap pop — only real swaps made from here on
    // should be able to.
    prevCorrectRef.current = null;
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
            isPortrait={isPortrait}
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
          {/* Explicit row-by-row rendering instead of a single flexWrap:'wrap'
              container: relying on Yoga to "naturally" break a line after
              exactly `cols` pieces depends on cols*pieceWidth landing on the
              exact right side of Yoga's strict `>` float comparison against
              the container's width - real device widths are routinely
              fractional and this comparison isn't reliable (it was observed
              to wrap one piece early for 3-column layouts). Grouping the
              `order` array into rows of exactly `cols` items up front makes
              the column count exact and deterministic regardless of any
              floating-point width. */}
          <View style={{ width: board.width }}>
            {groupPiecesIntoRows(order, cols).map((rowPieceIndices, rowIndex) => (
              <View key={rowIndex} style={{ flexDirection: 'row' }}>
                {rowPieceIndices.map((pieceIndex, colIndex) => {
                  const slotIndex = rowIndex * cols + colIndex;
                  return (
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
                        scale={getPieceScale(slotIndex)}
                      />
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>

      {isSolved && <CompletionBanner text={t('puzzleComplete')} />}
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
    // Kept deliberately compact (modest marginTop/paddingVertical, smaller
    // emoji than a first pass had) so this one-time celebration banner is
    // less likely to push the board past the available vertical space and
    // trigger a short scroll right at the moment the child solves it.
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.sun,
    borderRadius: radii.xl,
    borderWidth: 4,
    borderColor: colors.sunDark,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    ...shadow,
    elevation: 5,
  },
  completeEmoji: {
    fontSize: 28,
  },
  completeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.ink,
  },
});
