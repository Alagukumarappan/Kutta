import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Image, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
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
  childName: string;
  friendName?: string;
  onMenu: () => void;
}) {
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [deck, setDeck] = useState<MemoryCard[]>(() => buildDeck(pairCount, resolvableItemIds()));
  const [revealPhase, setRevealPhase] = useState<'previewing' | 'playing'>('previewing');
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  // Friend-mode only -- unused (and never shown) in solo mode. The child
  // always goes first (matching every other 2-player activity in this
  // app defaulting to a fixed, predictable starting player when there's
  // no coin-flip requirement in the design), and a match keeps the
  // current player's turn while a mismatch passes it.
  const [currentPlayerIsChild, setCurrentPlayerIsChild] = useState(true);
  const [childScore, setChildScore] = useState(0);
  const [friendScore, setFriendScore] = useState(0);
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
  // starts 'previewing'), wait, then reshuffle to a freshly shuffled
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
      if (mode === 'friend') setCurrentPlayerIsChild((isChild) => !isChild);
    }, MISMATCH_FLIP_BACK_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [flippedIndices, mode]);

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
          if (mode === 'friend') {
            if (currentPlayerIsChild) setChildScore((score) => score + 1);
            else setFriendScore((score) => score + 1);
          }
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
    setCurrentPlayerIsChild(true);
    setChildScore(0);
    setFriendScore(0);
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

  function opponentDisplayName(): string {
    return friendName ?? t('tictactoeOpponentFriend');
  }

  function completionTitle(): string {
    if (mode === 'solo') return t('memoryMatchSoloComplete');
    if (childScore === friendScore) return t('memoryMatchDraw');
    const winnerName = childScore > friendScore ? childName : opponentDisplayName();
    return tFormat('memoryMatchPlayerWinsNamed', language, { name: winnerName });
  }

  function turnText(): string {
    const name = currentPlayerIsChild ? childName : opponentDisplayName();
    return tFormat('memoryMatchPlayerTurnNamed', language, { name });
  }

  const columns = GRID_COLUMNS_BY_PAIR_COUNT[pairCount];
  const rows = Math.ceil(deck.length / columns);
  const availableWidth = width - insets.left - insets.right - spacing.md * 2;
  const availableHeight = height - insets.top - insets.bottom - spacing.md * 2;
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
      {mode === 'friend' && (
        <View style={styles.scoreRow}>
          <View style={styles.scoreChip}>
            <Text testID="memory-match-score-child" style={styles.scoreChipText}>
              {tFormat('memoryMatchScoreLabel', language, { name: childName, score: childScore })}
            </Text>
          </View>
          <View style={styles.scoreChip}>
            <Text testID="memory-match-score-friend" style={styles.scoreChipText}>
              {tFormat('memoryMatchScoreLabel', language, { name: opponentDisplayName(), score: friendScore })}
            </Text>
          </View>
        </View>
      )}
      {mode === 'friend' && revealPhase === 'playing' && (
        <Text testID="memory-match-turn" style={styles.turnText}>
          {turnText()}
        </Text>
      )}
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
                  accessibilityLabel={
                    faceUp
                      ? tFormat('memoryMatchCardRevealedLabel', language, { item: card.itemId })
                      : t('memoryMatchCardHiddenLabel')
                  }
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
  scoreRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  scoreChip: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
  scoreChipText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '800',
    color: colors.ink,
  },
  turnText: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
    color: colors.ink,
    marginBottom: spacing.xs,
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
