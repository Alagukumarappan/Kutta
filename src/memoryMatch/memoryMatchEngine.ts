// Core Memory Match rules — a classic pairs-matching game. Framework-
// agnostic (no React/RN imports), same separation `ticTacToeEngine.ts`
// already establishes, so it's testable independently of any screen and
// reusable from both MemoryMatchSetupScreen (PAIR_COUNTS) and
// MemoryMatchScreen (everything else).

export type PairCount = 6 | 10 | 14 | 18;

export const PAIR_COUNTS: readonly PairCount[] = [6, 10, 14, 18];

export interface MemoryCard {
  // Unique per card INSTANCE within one deck (e.g. "lion-a"/"lion-b") --
  // used as the stable identity for the card's position tracking and
  // (via a testID) for interacting with a specific card in tests.
  id: string;
  // Which real-world item this card depicts. Two cards sharing the same
  // itemId form a pair; checkMatch below compares this field.
  itemId: string;
  matched: boolean;
}

// Fisher-Yates shuffle -- unbiased, O(n), used by both buildDeck (to
// shuffle the freshly dealt cards) and reshuffle (the post-preview
// re-shuffle). `random` defaults to Math.random but is always overridable
// so every consumer (including this file's own tests) gets a
// deterministic, reproducible order when needed.
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Picks `pairCount` random distinct ids out of `availableItemIds`, turns
// each into a pair of cards, and returns them in shuffled order. Callers
// must ensure `availableItemIds.length >= pairCount` -- the bundled
// content module (memoryMatchContent.ts) always provides 20 items and the
// hardest difficulty only ever asks for 18, so this is a real invariant
// of how this function is actually called in this app, not something that
// needs its own runtime guard.
export function buildDeck(
  pairCount: PairCount,
  availableItemIds: readonly string[],
  random: () => number = Math.random
): MemoryCard[] {
  const chosenIds = shuffle(availableItemIds, random).slice(0, pairCount);
  const cards: MemoryCard[] = [];
  chosenIds.forEach((itemId) => {
    cards.push({ id: `${itemId}-a`, itemId, matched: false });
    cards.push({ id: `${itemId}-b`, itemId, matched: false });
  });
  return shuffle(cards, random);
}

// Re-shuffles an EXISTING deck's card positions -- used for the
// reveal-then-shuffle round intro (see MemoryMatchScreen), where the same
// dealt cards need a genuinely different arrangement than the one just
// shown during the preview, without re-picking which items are in play.
export function reshuffle(deck: readonly MemoryCard[], random: () => number = Math.random): MemoryCard[] {
  return shuffle(deck, random);
}

export function checkMatch(deck: readonly MemoryCard[], firstIndex: number, secondIndex: number): boolean {
  if (firstIndex === secondIndex) return false;
  return deck[firstIndex].itemId === deck[secondIndex].itemId;
}

export function isDeckComplete(deck: readonly MemoryCard[]): boolean {
  return deck.every((card) => card.matched);
}
