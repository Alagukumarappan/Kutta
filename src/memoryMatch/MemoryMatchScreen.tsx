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
import { moduleForItemId, resolvableItemIds, preloadItemImages, displayNameForItemId } from './memoryMatchContent';
import type { MemoryMatchMode } from './MemoryMatchSetupScreen';
import { playCorrectSound, playWrongSound } from '../audio/soundEffects';
import {
  colors,
  radii,
  spacing,
  typography,
  clamp,
  getActivityPalette,
  CelebrationOverlay,
  GradientScreenBackground,
  LoadingPanel,
} from '../design-system';

const PALETTE = getActivityPalette('memoryMatch');

// Races `preloadItemImages` against a timeout so the "memorize the board"
// preview is GUARANTEED to start eventually, even if a single photo's
// `downloadAsync()` never settles at all (neither resolves nor rejects --
// realistically possible in dev/Expo Go over a stalled Metro connection,
// though very unlikely in a release build where these are local bundled
// assets). Same technique as RootNavigator's own `withTimeout` (used there
// to bound `resolveSubfolderUris`), adapted here to always RESOLVE rather
// than reject on timeout: preloading is best-effort, not a critical
// operation, so timing out should just mean "proceed to the preview
// anyway, slightly less warm than ideal" -- never surface an error, never
// block the game. (`preloadItemImages` itself never rejects -- it's built
// on `Promise.allSettled` -- but resolving on both branches here is
// defense in depth, not reliance on that.)
function withPreloadTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      }
    );
  });
}

// How long the whole deck is shown face-up right after Start, before it
// flips back down and reshuffles -- see the design spec's "reveal-then-
// shuffle" round intro.
const PREVIEW_DURATION_MS = 2000;

// How long a genuinely mismatched pair stays visible before flipping back
// down -- long enough for a child to actually register what the two cards
// were, short enough not to feel sluggish.
const MISMATCH_FLIP_BACK_DELAY_MS = 900;

// Best-effort budget for `preloadItemImages` before the preview starts
// anyway -- see the preload effect below and `withPreloadTimeout`'s own
// comment. Generous enough to cover a normal cold-start decode of a
// handful of bundled photos, but short enough that a child never
// perceives the wait as "the game is broken" even in the worst case
// (a hung `downloadAsync()` -- see that function's own doc comment in
// memoryMatchContent.ts for why that's realistic in Expo Go/dev but not
// in a release build).
const PRELOAD_TIMEOUT_MS = 2500;

// How many columns the grid uses per difficulty -- chosen so every level
// divides evenly (no incomplete final row) and stays wide/short, matching
// this app's landscape lock.
const GRID_COLUMNS_BY_PAIR_COUNT: Record<PairCount, number> = {
  6: 4, // 12 cards -> 4x3
  10: 5, // 20 cards -> 5x4
  14: 7, // 28 cards -> 7x4
  18: 9, // 36 cards -> 9x4
};

// Friend mode renders a score row (~33dp: chip + marginBottom) and a turn
// indicator (~28dp: text + marginBottom) ABOVE the grid — this cell-size
// math predates that (it was written in Task 7 for solo-mode-only, before
// Task 8 added those elements), and never accounted for the space they
// take, which visibly clipped the top and bottom card rows on real phone
// screens in friend mode (~45dp overflow measured by a whole-branch
// review). A little extra buffer (80 total) keeps this safely
// conservative rather than exactly matching the measured styles, which
// would break again the next time either element's padding changes.
const FRIEND_MODE_HEADER_ALLOWANCE = 80;

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
  // Starts in 'preloading' (not 'previewing') -- see the preload effect
  // below: the 2s "memorize the board" preview must not start counting
  // down until the actual photos in THIS deck have been preloaded, or a
  // meaningful chunk of that window can be spent looking at blank/loading
  // cards on a cold start or slow device.
  const [revealPhase, setRevealPhase] = useState<'preloading' | 'previewing' | 'playing'>('preloading');
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

  // Mirrors `flippedIndices` synchronously, alongside every update to that
  // state -- same technique as PuzzleScreen's own selectedSlotRef. React
  // Native delivers a BATCH of queued touch events to JS at once, so two
  // taps landing close together (a child drumming on the board) both run
  // against the same pre-update render; reading this ref instead of the
  // `flippedIndices` closure lets the second tap of a batch see what the
  // first one just did, without needing a setState updater function (whose
  // body React may invoke twice under StrictMode -- unsafe here, since the
  // match branch below also scores a point and marks cards matched, and
  // those side effects must run exactly once per genuine match).
  const flippedIndicesRef = useRef<number[]>([]);
  function updateFlippedIndices(next: number[]) {
    flippedIndicesRef.current = next;
    setFlippedIndices(next);
  }

  // Mirrors `deck` synchronously, exactly like `flippedIndicesRef` above
  // mirrors `flippedIndices` -- and for the identical reason. Without this,
  // `handleCardPress`'s `deck[index].matched` guard (and its `checkMatch`
  // call) would read the possibly-stale closure `deck`, which is only
  // updated by the async `setDeck` call below, not synchronously the way
  // this ref is. A batch of 4 rapid taps on the SAME matching pair (A, B,
  // A, B) landing in one React batch would otherwise let taps 3-4 pass the
  // stale (still-unmatched-in-the-closure) guard and re-score the same
  // pair a second time; a 3-tap (A, B, A) variant would let an
  // already-matched card re-enter `flippedIndices` and wrongly resolve the
  // child's next genuine tap as a mismatch, passing the turn. Kept in sync
  // everywhere `deck` is set: mount (initial value below), retry, and
  // inside `handleCardPress`'s own match branch.
  const deckRef = useRef<MemoryCard[]>(deck);
  function updateDeck(next: MemoryCard[]) {
    deckRef.current = next;
    setDeck(next);
  }

  // Same synchronous-mirror technique, for the same reason, applied to
  // `currentPlayerIsChild`: `handleCardPress` needs to know whose score to
  // increment on a genuine match, and reading the async closure variable
  // here would be exactly as stale-prone as the un-mirrored `deck` read
  // above was -- this is pure defense-in-depth alongside `deckRef`, not a
  // fix for a currently-reachable bug (the friend-mode turn only flips on
  // a mismatch's OWN delayed effect, not inside the same batch a match's
  // side effects run in), but it removes the same class of risk. Kept in
  // sync everywhere `setCurrentPlayerIsChild` is called: mount (initial
  // value below), the mismatch flip-back turn-pass, and retry.
  const currentPlayerIsChildRef = useRef(currentPlayerIsChild);
  function updateCurrentPlayerIsChild(next: boolean) {
    currentPlayerIsChildRef.current = next;
    setCurrentPlayerIsChild(next);
  }

  // Guard against a vacuous "complete" on a degenerate empty deck (e.g. if
  // every bundled photo somehow failed to resolve) -- isDeckComplete([])
  // is trivially true, which would otherwise show a false "you won"
  // celebration over an empty grid instead of just rendering the (empty)
  // grid.
  const isComplete = deck.length > 0 && isDeckComplete(deck);

  useEffect(() => {
    if (isComplete) {
      retryFiredRef.current = false;
      menuFiredRef.current = false;
      setOverlayDismissed(false);
    }
  }, [isComplete]);

  // Preloads the real bundled photos for THIS deck's cards -- and only
  // those (deckRef.current already holds exactly the pairCount*2 cards
  // this round deals, not the full 20-item pool) -- before the "memorize
  // the board" preview is allowed to start counting down. Depends on
  // `roundKey` (not `[]`) so handleRetry re-triggers this exact sequence
  // for a fresh round. `Promise.allSettled` inside `preloadItemImages`
  // only guards against a per-item REJECTION -- it does nothing for a
  // download that never settles at all, which would otherwise leave
  // `revealPhase` stuck at 'preloading' (and `LoadingPanel` on screen)
  // forever. `withPreloadTimeout` above is what actually guarantees this
  // effect's `.then()` always runs, one way or another; the `cancelled`
  // flag alongside it only guards the separate, ordinary concern of not
  // setting state after an unmount/retry.
  useEffect(() => {
    let cancelled = false;
    setRevealPhase('preloading');
    const itemIds = Array.from(new Set(deckRef.current.map((card) => card.itemId)));
    withPreloadTimeout(preloadItemImages(itemIds), PRELOAD_TIMEOUT_MS).then(() => {
      if (cancelled) return;
      setRevealPhase('previewing');
    });
    return () => {
      cancelled = true;
    };
  }, [roundKey]);

  // The reveal-then-shuffle round intro: once preloading has actually
  // finished (revealPhase became 'previewing'), deal face-up (the initial
  // buildDeck() call above already shows every card since isCardFaceUp
  // treats 'previewing' as face-up), wait PREVIEW_DURATION_MS, then
  // reshuffle to a freshly shuffled arrangement and flip face-down for
  // real play.
  useEffect(() => {
    if (revealPhase !== 'previewing') return;
    const timeoutId = setTimeout(() => {
      updateDeck(reshuffle(deckRef.current));
      setRevealPhase('playing');
    }, PREVIEW_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [revealPhase]);

  // Any time exactly 2 cards are flipped, they must be a MISMATCH: a match
  // is resolved synchronously (see handleCardPress below) and immediately
  // clears flippedIndices back to 0 in the same update, so the only way
  // this effect ever observes a length of 2 is a genuine mismatch waiting
  // to be flipped back.
  useEffect(() => {
    if (flippedIndices.length !== 2) return;
    playWrongSound();
    const timeoutId = setTimeout(() => {
      updateFlippedIndices([]);
      if (mode === 'friend') updateCurrentPlayerIsChild(!currentPlayerIsChildRef.current);
    }, MISMATCH_FLIP_BACK_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [flippedIndices, mode]);

  function handleCardPress(index: number) {
    if (revealPhase !== 'playing') return;
    // Reads the ACTUAL latest deck via deckRef (kept in sync by
    // updateDeck), not the outer closure's possibly-stale `deck` snapshot
    // -- see deckRef's own doc comment above for the exploit this guards
    // against (a batched double-tap on an already-matched pair).
    if (deckRef.current[index].matched) return;

    // Reads the ACTUAL latest flipped indices via flippedIndicesRef (kept
    // in sync by updateFlippedIndices), not the outer closure's possibly-
    // stale `flippedIndices` snapshot -- same reasoning as TicTacToeScreen's
    // own documented fix for two taps delivered in a single React batch.
    const prevFlipped = flippedIndicesRef.current;
    if (prevFlipped.includes(index) || prevFlipped.length >= 2) return;

    const nextFlipped = [...prevFlipped, index];
    if (nextFlipped.length === 2) {
      const [first, second] = nextFlipped;
      if (checkMatch(deckRef.current, first, second)) {
        // These side effects (marking cards matched, scoring a point) run
        // exactly once per genuine match: handleCardPress is a plain event
        // handler invoked once per press, unlike a setState updater
        // function's body, which React may invoke twice under StrictMode
        // to surface impurities -- doing this here, outside any updater,
        // is what keeps a single match from ever being double-counted.
        updateFlippedIndices([]);
        updateDeck(deckRef.current.map((card, i) => (i === first || i === second ? { ...card, matched: true } : card)));
        playCorrectSound();
        if (mode === 'friend') {
          if (currentPlayerIsChildRef.current) setChildScore((score) => score + 1);
          else setFriendScore((score) => score + 1);
        }
        return;
      }
    }
    updateFlippedIndices(nextFlipped);
  }

  function handleRetry() {
    if (retryFiredRef.current) return;
    retryFiredRef.current = true;
    updateDeck(buildDeck(pairCount, resolvableItemIds()));
    updateFlippedIndices([]);
    updateCurrentPlayerIsChild(true);
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
  const availableHeight =
    height - insets.top - insets.bottom - spacing.md * 2 - (mode === 'friend' ? FRIEND_MODE_HEADER_ALLOWANCE : 0);
  // Raised from an earlier (36, 96) range after real-device feedback that
  // cards read as too small, especially at the lower pair counts where
  // there's genuine room to grow — the 96 ceiling was the actual binding
  // constraint there, not the available screen space. 48 (not 36) as the
  // floor also brings this in line with design-system's own
  // touchTarget.minimum, since a very small card is both hard to see and
  // hard to tap precisely for a young child. At the highest pair counts
  // (most cards, least room) the real constraint is still availableWidth/
  // availableHeight, so this ceiling change never risks the friend-mode
  // overflow a real-device bug report already caught and fixed once.
  const cellSize = clamp(Math.min(availableWidth / columns, availableHeight / rows) - spacing.xs, 48, 140);

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
      {revealPhase === 'preloading' ? (
        // Preloading the actual photos this deck needs (see the preload
        // effect above) -- shown instead of the grid so a child never sees
        // a board full of blank/loading cards during what's meant to be
        // the "memorize this" preview.
        <LoadingPanel
          testID="memory-match-loading"
          color={PALETTE.accent}
          messageColor={colors.ink}
          message={t('galleryLoading')}
        />
      ) : (
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
                        ? tFormat('memoryMatchCardRevealedLabel', language, {
                            item: displayNameForItemId(card.itemId, language),
                          })
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
      )}

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
