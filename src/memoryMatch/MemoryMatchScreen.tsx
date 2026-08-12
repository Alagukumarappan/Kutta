import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import {
  buildDeck,
  reshuffle,
  checkMatch,
  isDeckComplete,
  type MemoryCard,
  type PairCount,
} from './memoryMatchEngine';
import { moduleForItemId, resolvableItemIds } from './memoryMatchContent';
import type { MemoryMatchMode } from './MemoryMatchSetupScreen';
import {
  colors,
  radii,
  spacing,
  typography,
  clamp,
  getActivityPalette,
  CelebrationOverlay,
  GradientScreenBackground,
} from '../design-system';

const PALETTE = getActivityPalette('memoryMatch');

// How long the whole deck is shown face-up right after Start, before it
// flips back down and reshuffles -- see the design spec's "reveal-then-
// shuffle" round intro.
const PREVIEW_DURATION_MS = 2000;

// How long a genuinely mismatched pair stays visible before flipping back
// down -- long enough for a child to actually register what the two cards
// were, short enough not to feel sluggish.
const MISMATCH_FLIP_BACK_DELAY_MS = 900;

// How many columns the grid uses per difficulty -- chosen so every level
// divides evenly (no incomplete final row) and stays wide/short, matching
// this app's landscape lock.
const GRID_COLUMNS_BY_PAIR_COUNT: Record<PairCount, number> = {
  6: 4, // 12 cards -> 4x3
  10: 5, // 20 cards -> 5x4
  14: 7, // 28 cards -> 7x4
  18: 9, // 36 cards -> 9x4
};

export function MemoryMatchScreen({
  mode,
  pairCount,
  childName,
  friendName,
  onMenu,
}: {
  mode: MemoryMatchMode;
  pairCount: PairCount;
  // Accepted now so Task 8's friend-mode addition doesn't need to change
  // this component's props -- unused by solo mode.
  childName: string;
  friendName?: string;
  onMenu: () => void;
}) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [deck, setDeck] = useState<MemoryCard[]>(() => buildDeck(pairCount, resolvableItemIds()));
  const [revealPhase, setRevealPhase] = useState<'previewing' | 'playing'>('previewing');
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  // Bumped on Retry to re-trigger the preview effect below (which only
  // otherwise runs once per mount) -- see handleRetry.
  const [roundKey, setRoundKey] = useState(0);

  const retryFiredRef = useRef(false);
  const menuFiredRef = useRef(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);

  const isComplete = isDeckComplete(deck);

  useEffect(() => {
    if (isComplete) {
      retryFiredRef.current = false;
      menuFiredRef.current = false;
      setOverlayDismissed(false);
    }
  }, [isComplete]);

  // The reveal-then-shuffle round intro: deal face-up (the initial
  // buildDeck() call above already shows every card, since revealPhase
  // starts 'previewing'), wait, then reshuffle to a genuinely different
  // arrangement and flip face-down for real play. Depends on `roundKey`
  // (not `[]`) so handleRetry can re-trigger this exact sequence for a
  // fresh round without needing a new component instance.
  useEffect(() => {
    setRevealPhase('previewing');
    const timeoutId = setTimeout(() => {
      setDeck((prev) => reshuffle(prev));
      setRevealPhase('playing');
    }, PREVIEW_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [roundKey]);

  // Any time exactly 2 cards are flipped, they must be a MISMATCH: a match
  // is resolved synchronously (see handleCardPress below) and immediately
  // clears flippedIndices back to 0 in the same update, so the only way
  // this effect ever observes a length of 2 is a genuine mismatch waiting
  // to be flipped back.
  useEffect(() => {
    if (flippedIndices.length !== 2) return;
    const timeoutId = setTimeout(() => {
      setFlippedIndices([]);
    }, MISMATCH_FLIP_BACK_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [flippedIndices]);

  function handleCardPress(index: number) {
    if (revealPhase !== 'playing' || flippedIndices.length === 2) return;
    if (deck[index].matched) return;

    // Re-derives "is this a genuinely new second flip" from the LATEST
    // flippedIndices via the functional updater, not the outer closure's
    // possibly-stale snapshot -- same reasoning as TicTacToeScreen's own
    // documented fix for two taps delivered in a single React batch.
    setFlippedIndices((prevFlipped) => {
      if (prevFlipped.includes(index) || prevFlipped.length >= 2) return prevFlipped;
      const nextFlipped = [...prevFlipped, index];
      if (nextFlipped.length === 2) {
        const [first, second] = nextFlipped;
        if (checkMatch(deck, first, second)) {
          setDeck((prevDeck) => prevDeck.map((card, i) => (i === first || i === second ? { ...card, matched: true } : card)));
          return [];
        }
      }
      return nextFlipped;
    });
  }

  function handleRetry() {
    if (retryFiredRef.current) return;
    retryFiredRef.current = true;
    setDeck(buildDeck(pairCount, resolvableItemIds()));
    setFlippedIndices([]);
    setRoundKey((key) => key + 1);
  }

  function handleMenu() {
    if (menuFiredRef.current) return;
    menuFiredRef.current = true;
    onMenu();
  }

  function isCardFaceUp(card: MemoryCard, index: number): boolean {
    return revealPhase === 'previewing' || card.matched || flippedIndices.includes(index);
  }

  function completionTitle(): string {
    return t('memoryMatchSoloComplete');
  }

  const columns = GRID_COLUMNS_BY_PAIR_COUNT[pairCount];
  const rows = Math.ceil(deck.length / columns);
  const availableWidth = width - insets.left - insets.right - spacing.lg * 2;
  const availableHeight = height - insets.top - insets.bottom - spacing.lg * 2;
  const cellSize = clamp(Math.min(availableWidth / columns, availableHeight / rows) - spacing.xs, 36, 96);

  return (
    <GradientScreenBackground
      style={[
        styles.screen,
        {
          paddingTop: spacing.md + insets.top,
          paddingBottom: spacing.md + insets.bottom,
          paddingLeft: spacing.md + insets.left,
          paddingRight: spacing.md + insets.right,
        },
      ]}
    >
      <View style={styles.grid}>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <View key={rowIndex} testID={`memory-match-row-${rowIndex}`} style={styles.gridRow}>
            {Array.from({ length: columns }, (_, colIndex) => {
              const index = rowIndex * columns + colIndex;
              if (index >= deck.length) {
                return <View key={colIndex} style={[styles.cell, { width: cellSize, height: cellSize }]} />;
              }
              const card = deck[index];
              const faceUp = isCardFaceUp(card, index);
              const imageModule = moduleForItemId(card.itemId);
              return (
                <Pressable
                  key={colIndex}
                  testID={`memory-match-card-${index}`}
                  onPress={() => handleCardPress(index)}
                  accessibilityRole="button"
                  accessibilityLabel={faceUp ? card.itemId : t('memoryMatchCardHiddenLabel')}
                  accessibilityState={{ disabled: card.matched || revealPhase !== 'playing' }}
                  style={[styles.cell, { width: cellSize, height: cellSize }, card.matched && styles.cellMatched]}
                >
                  {faceUp && imageModule !== undefined ? (
                    <Image
                      testID={`memory-match-card-${index}-image`}
                      source={imageModule}
                      style={styles.cardImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View testID={`memory-match-card-${index}-back`} style={styles.cardBack} />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <CelebrationOverlay
        visible={isComplete && !overlayDismissed}
        tone="success"
        emoji="🎉"
        title={completionTitle()}
        testID="memory-match-complete"
        onRequestClose={handleMenu}
        onClose={() => setOverlayDismissed(true)}
        closeLabel={t('close')}
        actions={[
          { label: t('tictactoePlayAgain'), onPress: handleRetry, testID: 'memory-match-retry' },
          { label: t('tictactoeChangeSetup'), onPress: handleMenu, variant: 'secondary', testID: 'memory-match-menu' },
        ]}
      />
    </GradientScreenBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'column',
  },
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    margin: spacing.xxs / 2,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cellMatched: {
    opacity: 0.35,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardBack: {
    width: '100%',
    height: '100%',
    backgroundColor: PALETTE.accent,
    borderWidth: 2,
    borderColor: PALETTE.accentDark,
  },
});
