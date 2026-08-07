import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import type { PuzzleDifficulty } from '../storage/puzzleDifficultyStore';
import { recordPuzzleCompleted } from '../storage/activityLog';
import {
  colors,
  radii,
  spacing,
  elevation,
  typography,
  getActivityPalette,
  CelebrationOverlay,
  LoadingPanel,
  useReducedMotion,
  GradientScreenBackground,
} from '../design-system';
import {
  computeGridDimensions,
  computePieceRects,
  computePuzzleBoardSize,
  shufflePieceOrder,
  groupPiecesIntoRows,
  PieceRect,
  PUZZLE_PREVIEW_WIDTH_FRACTION,
} from './puzzleGrid';

// Puzzle's recognizable per-activity accent (see REDESIGN_PROGRESS.md /
// getActivityPalette) — used throughout this screen's board chrome instead
// of the old theme's flat mint/sun pairing, so the board reads as
// unmistakably "the puzzle activity" even before a child can read the title.
const PUZZLE_PALETTE = getActivityPalette('puzzle');

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
//
// Bumped from 3 -> 4px for the redesign: the brief calls for "strong piece
// separation" on the new, more dimensional board, and a slightly thicker
// border reads more clearly as "these are separate physical tiles" without
// eating meaningfully more into the crop.
const SLOT_BORDER = 4;

function PuzzlePiece({
  imageUri,
  rect,
  containerWidth,
  containerHeight,
  selected,
  scale,
  testID,
}: {
  imageUri: string;
  rect: PieceRect;
  containerWidth: number;
  containerHeight: number;
  selected: boolean;
  scale: Animated.Value;
  // Exposes the animated scale wrapper itself (distinct from the outer
  // Pressable's own testID) so tests can read its settled transform value
  // directly — same "give the inner Animated.View its own testID"
  // convention ColoringScreen's swatch/toolbar faces already use.
  testID?: string;
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
      testID={testID}
      style={[
        styles.pieceSlot,
        {
          width: rect.width,
          height: rect.height,
          borderColor: selected ? colors.bubblegum : PUZZLE_PALETTE.accentDark,
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

export function PuzzleScreen({
  imageUri,
  pieceCount,
  onNext = () => {},
}: {
  imageUri: string;
  // Chosen once in PuzzleGallery's header dropdown and remembered as the
  // parent's default (see puzzleDifficultyStore.ts) — this screen no longer
  // asks again per-photo, so it's a required prop rather than something
  // this screen picks itself.
  pieceCount: PuzzleDifficulty;
  // Optional so existing call sites/tests that don't need to go back to the
  // gallery (e.g. ones that never reach the solved state) don't have to pass
  // one. RootNavigator always wires a real `() => navigation.goBack()` in
  // the running app (see AppStack's puzzle-detail Stack.Screen). Defaults to
  // a no-op so a stray Next press can never crash instead of navigating.
  onNext?: () => void;
}) {
  const { t, language } = useLanguage();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // This screen is shown with headerShown:false (see RootNavigator — every
  // activity screen dropped the native header/back-button in favor of the
  // device's own hardware/gesture back), so insets.top now has to be
  // reserved here too, the same way it already is in this screen's own
  // ScrollView contentContainerStyle below — nothing else consumes it.
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

  // Double-fire guards for the completion overlay's two buttons — same idiom
  // as QuizScreen's playAgainFiredRef/hasNavigatedHomeRef: a ref survives
  // across renders and is shared by every closure of this component
  // instance, so even a second press captured from a stale (pre-close)
  // render can't slip past it. Both re-arm whenever the puzzle is freshly
  // (re)solved, so Retry/Next still work the next time the overlay appears.
  const retryFiredRef = useRef(false);
  const nextFiredRef = useRef(false);

  useEffect(() => {
    if (isSolved) {
      retryFiredRef.current = false;
      nextFiredRef.current = false;
    }
  }, [isSolved]);

  // Records one completed puzzle per genuine solve (initial solve, and every
  // Retry's later re-solve) — a rising-edge guard, reset whenever isSolved
  // goes false again (a fresh shuffle via Retry/Next), so a re-render while
  // still solved doesn't record twice.
  const hasRecordedThisSolveRef = useRef(false);
  useEffect(() => {
    if (!isSolved) {
      hasRecordedThisSolveRef.current = false;
      return;
    }
    if (hasRecordedThisSolveRef.current) return;
    hasRecordedThisSolveRef.current = true;
    recordPuzzleCompleted().catch(() => {
      // Best-effort: a purely decorative counter must never block or crash
      // the completion overlay over an AsyncStorage write failure.
    });
  }, [isSolved]);

  const reducedMotion = useReducedMotion();

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
          // Same reduce-motion treatment as this app's other bouncy pop-ins
          // (Coloring's palette swatch/toolbar buttons, Quiz's progress
          // dots): land directly on the resting scale instead of playing
          // the overshoot sequence. The piece's own position-snap already
          // conveys that a correct placement just happened, on its own.
          if (reducedMotion) {
            scale.setValue(1);
            return;
          }
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
  }, [order, reducedMotion]);

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
  const board = computePuzzleBoardSize(width, height, imageWidth, imageHeight, insets);
  const isImageSizeReady = imageSize !== null || imageSizeFailed;

  function startPuzzle(count: PuzzleDifficulty) {
    setOrder(shufflePieceOrder(count));
    setSelectedSlot(null);
    // Fresh puzzle: clear the correctness baseline so the new shuffle's
    // starting layout (even if a slot happens to land correctly by chance)
    // never triggers the piece-snap pop — only real swaps made from here on
    // should be able to.
    prevCorrectRef.current = null;
  }

  // pieceCount is fixed for the lifetime of this screen (chosen once in the
  // gallery, passed in as a prop) — shuffle exactly once per mounted puzzle
  // instance, rather than every time this effect's deps happen to change.
  useEffect(() => {
    startPuzzle(pieceCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // correctness baseline, so the completion overlay closes immediately
    // since shufflePieceOrder guarantees a non-identity (unsolved) order.
    startPuzzle(pieceCount);
  }

  function handleNextPuzzle() {
    if (nextFiredRef.current) return;
    nextFiredRef.current = true;
    onNext();
  }

  // Two independent reasons the board isn't ready yet: `order` is briefly
  // empty between mount and the shuffle effect running, and the photo's
  // real width/height may still be resolving — either way, the same single
  // spinner covers both (previously duplicated as two near-identical
  // branches). Uses the same shared LoadingPanel every gallery's own
  // loading state now uses, so this reads as the same "the app is working
  // on it" moment everywhere rather than a screen-specific one-off.
  if (order.length === 0 || !isImageSizeReady) {
    return (
      <GradientScreenBackground testID="puzzle-loading">
        <LoadingPanel color={PUZZLE_PALETTE.accentDark} />
      </GradientScreenBackground>
    );
  }

  const { rows, cols } = computeGridDimensions(pieceCount, isPortrait);
  const rects = computePieceRects(board.width, board.height, rows, cols);

  return (
    <GradientScreenBackground>
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
        {/* A plain label + the full, uncropped source photo - no card/border
            chrome around it, matching the reference design. Sized to a fixed
            fraction of the window width (see PUZZLE_PREVIEW_WIDTH_FRACTION,
            the exact same fraction computePuzzleBoardSize reserves for it),
            so the board always gets the other ~80% regardless of screen
            size. The image itself uses the photo's REAL aspect ratio (not a
            forced square crop) so it displays in full whether the source
            photo is portrait or landscape - resizeMode:'contain' is a
            second, redundant safety net for the same guarantee. */}
        <View style={[styles.previewColumn, { width: width * PUZZLE_PREVIEW_WIDTH_FRACTION - spacing.md }]}>
          <Text style={styles.previewHint}>{t('puzzleMatchHint')}</Text>
          <Image
            source={{ uri: imageUri }}
            style={[styles.previewImage, { aspectRatio: imageWidth / imageHeight }]}
            resizeMode="contain"
            testID="puzzle-preview"
          />
        </View>

        {/* The board sits inside a deliberately deep "recessed tray" frame
            (surfaceSunk fill, a strong accent border, and a heavier
            elevation than any single piece) so the pieces themselves read as
            physical tiles sitting IN something, rather than floating flat
            on the page. */}
        <View style={[styles.boardFrame, elevation.level4]}>
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
                      // Each slot is a pure cropped-image fragment with no
                      // text of its own — without an explicit label, a
                      // screen-reader user gets an unlabeled, unroled
                      // element for every one of the puzzle's pieces (the
                      // entire game). accessibilityState communicates
                      // whether this slot is the one currently "picked up"
                      // awaiting a swap, mirroring the sighted selected-
                      // border cue below.
                      accessibilityRole="button"
                      accessibilityLabel={tFormat('puzzlePieceSlotLabel', language, { position: slotIndex + 1 })}
                      accessibilityState={{ selected: selectedSlot === slotIndex }}
                    >
                      <PuzzlePiece
                        testID={`puzzle-piece-scale-${slotIndex}`}
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

      {/* CelebrationOverlay (design-system) replaces the old hand-rolled
          completion Modal: it internally renders nothing while
          `visible={isSolved}` is false, so it's kept mounted here at all
          times (unlike the old `{isSolved && <CompletionModal .../>}` guard)
          without ever being present in the query tree before the puzzle is
          solved — same externally-observable behavior, just backed by the
          shared component's own visibility check instead of a conditional
          mount. Retry/Next semantics and their double-fire guards
          (retryFiredRef/nextFiredRef, re-armed by the isSolved effect above)
          are completely unchanged — only which component renders the
          message/buttons has moved. */}
      <CelebrationOverlay
        visible={isSolved}
        tone="success"
        emoji="🎉"
        title={t('puzzleComplete')}
        testID="puzzle-complete"
        actions={[
          { label: t('retry'), onPress: handleRetryPuzzle, variant: 'secondary', testID: 'puzzle-retry' },
          { label: t('quizNext'), onPress: handleNextPuzzle, testID: 'puzzle-next' },
        ]}
      />
    </ScrollView>
    </GradientScreenBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  previewColumn: {
    marginRight: spacing.md,
  },
  previewImage: {
    width: '100%',
    borderRadius: radii.md,
  },
  // Sits directly on the sky gradient background (not a card). `colors.ink`
  // is used rather than `colors.white`: white only clears ~2:1-3.1:1
  // against sky/skyDark, well under the 4.5:1 this text needs, while
  // `colors.ink` clears 5.2:1-8.2:1 across the same range.
  previewHint: {
    marginBottom: spacing.xs,
    fontSize: typography.body.fontSize,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  // The "recessed tray" the board sits in — a sunken fill (darker than the
  // canvas background, lighter than the pieces' own white slots) plus a
  // thick accent border gives the whole board area a soft dimensional depth
  // even before any single piece is considered, per the brief's "game
  // board" feel.
  boardFrame: {
    backgroundColor: colors.surfaceSunk,
    borderRadius: radii.xl,
    borderWidth: 4,
    borderColor: PUZZLE_PALETTE.accentDark,
    padding: spacing.sm,
  },
  pieceSlot: {
    overflow: 'hidden',
    borderWidth: SLOT_BORDER,
    backgroundColor: colors.white,
    // Android-only elevation (no iOS shadow* fields here) so each piece
    // reads as a distinct, slightly raised tile against the sunken tray
    // without the shadow being clipped away by this same View's
    // overflow:'hidden' (required for the image crop) on iOS — mirrors
    // RaisedCard's own documented reasoning for splitting shadow vs. clip
    // across two layers, simplified here since a per-piece shadow doesn't
    // need to survive a press-tilt transform.
    elevation: 3,
  },
  pieceSelected: {
    elevation: 6,
  },
});
