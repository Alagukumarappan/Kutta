import {
  buildDeck,
  reshuffle,
  checkMatch,
  isDeckComplete,
  PAIR_COUNTS,
  type MemoryCard,
} from '../../src/memoryMatch/memoryMatchEngine';

const ITEM_IDS = [
  'lion', 'elephant', 'giraffe', 'zebra', 'panda', 'koala', 'kangaroo',
  'penguin', 'owl', 'dolphin', 'tiger', 'monkey', 'horse', 'rabbit',
  'sedan', 'suv', 'pickup-truck', 'sports-car', 'taxi', 'race-car',
];

// A deterministic stand-in for Math.random -- always returns values from
// this fixed sequence, cycling, so every test's shuffle/pick outcome is
// reproducible instead of flaky.
function sequenceRandom(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

describe('memoryMatchEngine', () => {
  describe('PAIR_COUNTS', () => {
    it('is exactly 6, 10, 14, 18 in that order', () => {
      expect(PAIR_COUNTS).toEqual([6, 10, 14, 18]);
    });
  });

  describe('buildDeck', () => {
    it('returns exactly 2 cards per requested pair (6 pairs -> 12 cards)', () => {
      const deck = buildDeck(6, ITEM_IDS);
      expect(deck).toHaveLength(12);
    });

    it('returns exactly 2 cards per requested pair (18 pairs -> 36 cards)', () => {
      const deck = buildDeck(18, ITEM_IDS);
      expect(deck).toHaveLength(36);
    });

    it('gives every itemId in the deck exactly 2 cards (a real pair, not 1 or 3)', () => {
      const deck = buildDeck(10, ITEM_IDS);
      const counts = new Map<string, number>();
      deck.forEach((card) => counts.set(card.itemId, (counts.get(card.itemId) ?? 0) + 1));
      expect(counts.size).toBe(10);
      for (const count of counts.values()) {
        expect(count).toBe(2);
      }
    });

    it('gives every card a unique id, even the two cards sharing the same itemId', () => {
      const deck = buildDeck(6, ITEM_IDS);
      const ids = deck.map((card) => card.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('starts every card unmatched', () => {
      const deck = buildDeck(6, ITEM_IDS);
      expect(deck.every((card) => card.matched === false)).toBe(true);
    });

    it('picks a different random subset of itemIds when given a different random source', () => {
      const deckA = buildDeck(6, ITEM_IDS, sequenceRandom([0.01, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]));
      const deckB = buildDeck(6, ITEM_IDS, sequenceRandom([0.99, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]));
      const itemsA = new Set(deckA.map((c) => c.itemId));
      const itemsB = new Set(deckB.map((c) => c.itemId));
      expect(itemsA).not.toEqual(itemsB);
    });
  });

  describe('reshuffle', () => {
    it('returns the exact same cards (same ids/itemIds/matched flags), never adding or dropping any', () => {
      const deck = buildDeck(6, ITEM_IDS);
      const reshuffled = reshuffle(deck);
      expect(reshuffled).toHaveLength(deck.length);
      expect(new Set(reshuffled.map((c) => c.id))).toEqual(new Set(deck.map((c) => c.id)));
    });

    it('produces a different order than the input, with a real (non-identity) random source', () => {
      const deck = buildDeck(18, ITEM_IDS);
      const reshuffled = reshuffle(deck, sequenceRandom([0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.6, 0.4, 0.5]));
      const originalOrder = deck.map((c) => c.id).join(',');
      const newOrder = reshuffled.map((c) => c.id).join(',');
      expect(newOrder).not.toBe(originalOrder);
    });

    it('preserves a matched flag that was already true on a card', () => {
      const deck = buildDeck(6, ITEM_IDS);
      const matchedDeck = deck.map((card, i) => (i === 0 ? { ...card, matched: true } : card));
      const reshuffled = reshuffle(matchedDeck);
      const stillMatched = reshuffled.find((c) => c.id === matchedDeck[0].id);
      expect(stillMatched?.matched).toBe(true);
    });
  });

  describe('checkMatch', () => {
    it('returns true when the two indices share the same itemId', () => {
      const deck: MemoryCard[] = [
        { id: 'lion-a', itemId: 'lion', matched: false },
        { id: 'zebra-a', itemId: 'zebra', matched: false },
        { id: 'lion-b', itemId: 'lion', matched: false },
      ];
      expect(checkMatch(deck, 0, 2)).toBe(true);
    });

    it('returns false when the two indices have different itemIds', () => {
      const deck: MemoryCard[] = [
        { id: 'lion-a', itemId: 'lion', matched: false },
        { id: 'zebra-a', itemId: 'zebra', matched: false },
      ];
      expect(checkMatch(deck, 0, 1)).toBe(false);
    });

    it('returns false when both indices are the same position (a card can never match itself)', () => {
      const deck: MemoryCard[] = [{ id: 'lion-a', itemId: 'lion', matched: false }];
      expect(checkMatch(deck, 0, 0)).toBe(false);
    });
  });

  describe('isDeckComplete', () => {
    it('is false when any card is unmatched', () => {
      const deck: MemoryCard[] = [
        { id: 'a', itemId: 'lion', matched: true },
        { id: 'b', itemId: 'lion', matched: false },
      ];
      expect(isDeckComplete(deck)).toBe(false);
    });

    it('is true when every card is matched', () => {
      const deck: MemoryCard[] = [
        { id: 'a', itemId: 'lion', matched: true },
        { id: 'b', itemId: 'lion', matched: true },
      ];
      expect(isDeckComplete(deck)).toBe(true);
    });

    it('is true for an empty deck (vacuously complete)', () => {
      expect(isDeckComplete([])).toBe(true);
    });
  });
});
