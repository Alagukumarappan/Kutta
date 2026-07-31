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
  Modal,
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

// Completion overlay — mirrors the quiz's feedback Modal (QuestionRenderer's
// `hasAnswered && <Modal visible transparent animationType="fade">...`
// backdrop + centered feedbackCard pattern) instead of the old inline
// completion banner: a dark, non-interactive backdrop behind a centered
// white card carrying the message and a Retry/Next button row. Conditionally
// MOUNTING the Modal only while `isSolved` is true (see the
// `{isSolved && <CompletionModal ... />}` call site below) is what keeps it
// out of the query tree entirely before the puzzle is solved — same
// convention as the quiz's `hasAnswered &&` guard.
//
// The card keeps the exact pop-in recipe the old CompletionBanner already
// had (and the quiz's own feedback card uses): starts slightly
// shrunk/invisible (0.85/0) and springs to rest (1/1), speed 20/bounciness 6
// for the scale, a 220ms timing for the opacity. This component only exists
// in the tree while solved, so a plain mount-effect is enough to replay the
// pop-in every time it (re)appears — no separate show/hide toggle needed.
function CompletionModal({
  text,
  onRetry,
  onNext,
}: {
  text: string;
  onRetry: () => void;
  onNext: () => void;
}) {
  const { t } = useLanguage();
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
    <Modal visible transparent animationType="fade">
      <View style={styles.completeBackdrop}>
        <Animated.View
          testID="puzzle-complete"
          style={[styles.completeCard, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
        >
          <View style={styles.completeMessageRow}>
            <Text style={styles.completeEmoji}>🎉</Text>
            <Text style={styles.completeText}>{text}</Text>
            <Text style={styles.completeEmoji}>🎉</Text>
          </View>

          {/* Retry (reshuffles this same puzzle) + Next (goes back to the
              gallery to pick a different picture) side by side — mirrors the
              quiz's feedbackButtonGroup/tryAgainButton/nextButtonSmall split. */}
          <View style={styles.completeButtonGroup}>
            <Pressable
              testID="puzzle-retry"
              onPress={onRetry}
              style={styles.tryAgainButton}
              accessibilityRole="button"
              accessibilityLabel={t('retry')}
            >
              <Text style={styles.tryAgainButtonText}>{t('retry')}</Text>
            </Pressable>
            <Pressable
              testID="puzzle-next"
              onPress={onNext}
              style={styles.nextButtonSmall}
              accessibilityRole="button"
              accessibilityLabel={t('quizNext')}
            >
              <Text style={styles.nextButtonText}>{t('quizNext')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function PuzzleScreen({
  imageUri,
  onNext = () => {},
}: {
  imageUri: string;
  // Optional so existing call sites/tests that don't need to go back to the
  // gallery (e.g. ones that never reach the solved state) don't have to pass
  // one. RootNavigator always wires a real `() => navigation.goBack()` in
  // the running app (see AppStack's puzzle-detail Stack.Screen). Defaults to
  // a no-op so a stray Next press can never crash instead of navigating.
  onNext?: () => void;
}) {
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

  // The puzzle reads as solved the moment `order` is the identity
  // permutation — computed here (rather than down near the render return,
  // where it used to live) so the double-fire guard reset effect right below
  // can depend on it without breaking the rule that every hook in this
  // component runs unconditionally on every render, ahead of the early
  // (piece-count-picker / loading) returns further down.
  const isSolved = order.length > 0 && order.every((pieceIndex, slotIndex) => pieceIndex === slotIndex);

  // Double-fire guards for the completion modal's two buttons — same idiom
  // as QuizScreen's playAgainFiredRef/hasNavigatedHomeRef: a ref survives
  // across renders and is shared by every closure of this component
  // instance, so even a second press captured from a stale (pre-close)
  // render can't slip past it. Both re-arm whenever the puzzle is freshly
  // (re)solved, so Retry/Next still work the next time the modal appears.
  const retryFiredRef = useRef(false);
  const nextFiredRef = useRef(false);

  useEffect(() => {
    if (isSolved) {
      retryFiredRef.current = false;
      nextFiredRef.current = false;
    }
  }, [isSolved]);

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

  function handleRetryPuzzle() {
    if (retryFiredRef.current) return;
    retryFiredRef.current = true;
    // Reshuffles the SAME puzzle (same pieceCount) using the exact
    // startPuzzle path that set up the board in the first place — not a new
    // shuffling approach — which also clears selectedSlot and the
    // correctness baseline, so the completion modal closes immediately since
    // shufflePieceOrder guarantees a non-identity (unsolved) order.
    if (pieceCount) startPuzzle(pieceCount);
  }

  function handleNextPuzzle() {
    if (nextFiredRef.current) return;
    nextFiredRef.current = true;
    onNext();
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

      {isSolved && (
        <CompletionModal text={t('puzzleComplete')} onRetry={handleRetryPuzzle} onNext={handleNextPuzzle} />
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
  // Dark, non-interactive backdrop (no onPress — a child must use Retry or
  // Next, not a tap-outside dismiss) behind the centered completion card —
  // mirrors QuestionRenderer's feedbackBackdrop exactly.
  completeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  // Kept the same sun-toned card the old inline banner used (rather than
  // switching to the quiz's white/mint-or-coral card) since there's no
  // correct/incorrect result to color-code here — just one warm "you did
  // it" card. Still mirrors the quiz's feedbackCard shape: rounded, bordered,
  // shadowed, capped width so it doesn't stretch edge-to-edge in landscape.
  completeCard: {
    backgroundColor: colors.sun,
    borderRadius: radii.xl,
    borderWidth: 4,
    borderColor: colors.sunDark,
    maxWidth: 420,
    width: '100%',
    padding: spacing.lg,
    alignItems: 'center',
    ...shadow,
    elevation: 8,
  },
  completeMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  completeEmoji: {
    fontSize: 28,
  },
  completeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.ink,
  },
  // Retry + Next side by side — mirrors the quiz's feedbackButtonGroup.
  completeButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.sm,
  },
  // Reuses the quiz's exact tryAgainButton/nextButtonSmall/nextButtonText
  // visual recipe (this codebase duplicates small style objects per screen
  // rather than sharing a UI-kit module).
  tryAgainButton: {
    backgroundColor: colors.white,
    borderColor: colors.sunDark,
    borderWidth: 2,
    borderRadius: radii.xl,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    ...shadow,
    elevation: 4,
  },
  tryAgainButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.ink,
  },
  nextButtonSmall: {
    backgroundColor: colors.coral,
    borderColor: colors.coralDark,
    borderWidth: 2,
    borderRadius: radii.xl,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    ...shadow,
    elevation: 4,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
  },
});
