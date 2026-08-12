import React from 'react';
import { Image } from 'react-native';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import { MemoryMatchScreen } from '../../src/memoryMatch/MemoryMatchScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { buildDeck, reshuffle } from '../../src/memoryMatch/memoryMatchEngine';
import { resolvableItemIds, displayNameForItemId } from '../../src/memoryMatch/memoryMatchContent';

jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({ uri: 'asset:///fake.jpg' } as any);

// Bug 3 (preview-preloading) coverage needs control over when the actual
// asset download "completes" -- the real `expo-asset` module isn't
// deterministic/controllable here the way this mock is (same idiom as
// sampleContent.test.ts's own `expo-asset` mock). Defaults to resolving
// immediately so every OTHER test in this file (none of which care about
// preloading timing) sees the same fast, synchronous-ish preload it always
// has; only the dedicated preloading tests below override this to defer
// resolution and observe the mid-preload state.
const mockDownloadAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-asset', () => ({
  Asset: {
    fromURI: jest.fn(() => ({ downloadAsync: mockDownloadAsync })),
  },
}));

function renderGame(
  props: Partial<React.ComponentProps<typeof MemoryMatchScreen>> = {},
  options: { strictMode?: boolean; language?: 'en' | 'de' } = {}
) {
  const onMenu = props.onMenu ?? jest.fn();
  const tree = (
    <LanguageProvider initialLanguage={options.language ?? 'en'}>
      <MemoryMatchScreen
        mode={props.mode ?? 'solo'}
        pairCount={props.pairCount ?? 6}
        childName={props.childName ?? 'Sam'}
        friendName={props.friendName}
        onMenu={onMenu}
      />
    </LanguageProvider>
  );
  return render(options.strictMode ? <React.StrictMode>{tree}</React.StrictMode> : tree);
}

describe('MemoryMatchScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deals the deck face-up for the preview, then flips it face-down after the preview delay', async () => {
    const { queryAllByTestId } = await renderGame({ pairCount: 6 });

    // During the preview: every one of the 12 cards is face-up (has an
    // -image child), none show the face-down back.
    expect(queryAllByTestId(/memory-match-card-\d+-image/)).toHaveLength(12);
    expect(queryAllByTestId(/memory-match-card-\d+-back/)).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    // After the preview: every card is face-down.
    expect(queryAllByTestId(/memory-match-card-\d+-image/)).toHaveLength(0);
    expect(queryAllByTestId(/memory-match-card-\d+-back/)).toHaveLength(12);
  });

  it('gives a revealed card a real translated display name as its accessibility label, not the raw itemId', async () => {
    // Pin Math.random for the ENTIRE render (not just a precomputed value
    // read beforehand) so the component's own initial buildDeck() call --
    // made internally with the real Math.random, not something the test
    // can inject -- lands on the exact same deterministic deck this test
    // independently computes card 0's itemId from.
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const computedDeck = buildDeck(6, resolvableItemIds());
    const card0ItemId = computedDeck[0].itemId;

    const { getByTestId } = await renderGame({ pairCount: 6 }, { language: 'en' });
    randomSpy.mockRestore();

    // Bug: this used to be tFormat(..., { item: card.itemId }), which put
    // the raw internal slug (e.g. "pickup-truck") straight into a screen
    // reader announcement. It must instead be the real English word.
    expect(getByTestId('memory-match-card-0').props.accessibilityLabel).toBe(
      displayNameForItemId(card0ItemId, 'en')
    );
    expect(getByTestId('memory-match-card-0').props.accessibilityLabel).not.toBe(card0ItemId);
  });

  it('gives a revealed card its German display name when the app language is German', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const computedDeck = buildDeck(6, resolvableItemIds());
    const card0ItemId = computedDeck[0].itemId;

    const { getByTestId } = await renderGame({ pairCount: 6 }, { language: 'de' });
    randomSpy.mockRestore();

    // Bug: the old passthrough string was IDENTICAL for en/de ('{item}'
    // in both), so a German-language user's screen reader announced the
    // English-only itemId regardless of the app's language setting.
    const expectedGerman = displayNameForItemId(card0ItemId, 'de');
    expect(getByTestId('memory-match-card-0').props.accessibilityLabel).toBe(expectedGerman);
    expect(getByTestId('memory-match-card-0').props.accessibilityLabel).not.toBe(
      displayNameForItemId(card0ItemId, 'en')
    );
  });

  it('does not let a tap flip a card during the preview (before play has actually started)', async () => {
    const { getByTestId, queryByTestId } = await renderGame({ pairCount: 6 });

    await fireEvent.press(getByTestId('memory-match-card-0'));

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    // If the tap during the preview had genuinely flipped card 0, it would
    // be exempt from the post-preview face-down flip and would still show
    // its image here, unlike the rest of the untapped deck. Asserting the
    // opposite -- back showing, no image -- is only true if the tap was
    // actually blocked while mid-preview.
    expect(queryByTestId('memory-match-card-0-back')).toBeTruthy();
    expect(queryByTestId('memory-match-card-0-image')).toBeNull();
  });

  it('flips exactly two tapped cards face-up, then flips a MISMATCHED pair back down after a short delay', async () => {
    const { getByTestId, queryByTestId } = await renderGame({ pairCount: 6 });
    await act(async () => {
      jest.advanceTimersByTime(2000); // past the preview
    });

    // Find two cards that do NOT match (different itemId) by reading the
    // rendered deck: tap an anchor card, then find the first OTHER card
    // whose image differs from the anchor's.
    async function flipAndImage(index: number) {
      await fireEvent.press(getByTestId(`memory-match-card-${index}`));
      return queryByTestId(`memory-match-card-${index}-image`);
    }

    // The anchor can accidentally land on its own real partner (a 1-in-11
    // chance for pairCount:6) -- when that happens, BOTH cards become
    // permanently matched, so continuing to compare further candidates
    // against the now-matched anchor's still-visible (but no longer
    // flip-back-able) image would misreport a bogus "mismatch". Re-anchor
    // on a fresh, still-untried card whenever that happens instead, so
    // the search always keeps looking for a genuine, currently-pending
    // mismatch.
    const untried = Array.from({ length: 11 }, (_, i) => i + 1); // indices 1..11
    let anchorIndex = 0;
    let firstImage = await flipAndImage(anchorIndex);

    let mismatchIndex = -1;
    while (mismatchIndex === -1 && untried.length > 0) {
      const i = untried.shift()!;
      const candidateImage = await flipAndImage(i);
      if (!candidateImage) continue;
      if (candidateImage.props.source !== firstImage!.props.source) {
        mismatchIndex = i;
      } else if (untried.length > 0) {
        // Genuine match with the anchor -- re-anchor on a fresh card.
        anchorIndex = untried.shift()!;
        firstImage = await flipAndImage(anchorIndex);
      }
    }

    expect(mismatchIndex).toBeGreaterThan(-1);
    expect(queryByTestId(`memory-match-card-${mismatchIndex}-image`)).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(900);
    });

    expect(queryByTestId(`memory-match-card-${anchorIndex}-image`)).toBeNull();
    expect(queryByTestId(`memory-match-card-${mismatchIndex}-image`)).toBeNull();
  });

  it('never shows a score row or turn indicator in solo mode', async () => {
    const { queryByTestId } = await renderGame({ mode: 'solo', pairCount: 6 });

    expect(queryByTestId('memory-match-score-child')).toBeNull();
    expect(queryByTestId('memory-match-score-friend')).toBeNull();
    expect(queryByTestId('memory-match-turn')).toBeNull();
  });

  it('shows a solo completion celebration once every pair is found', async () => {
    const { getByTestId, queryByTestId } = await renderGame({ pairCount: 6 });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    // Deterministically win: read the actual dealt itemId of every card
    // via its image source, then tap matching pairs in order. Extract
    // itemId ordering from moduleForItemId isn't directly observable from
    // the rendered <Image>, so instead tap every card twice in a
    // brute-force pairing sweep, using the flip-back delay between
    // mismatches, until the board is cleared -- bounded by pairCount so
    // this cannot loop forever.
    const cardCount = 12;
    const matchedIndices = new Set<number>();
    let guard = 0;
    while (matchedIndices.size < cardCount && guard < 200) {
      guard++;
      const remaining = Array.from({ length: cardCount }, (_, i) => i).filter((i) => !matchedIndices.has(i));
      if (remaining.length < 2) break;
      // `a` is always the lowest still-unmatched index; scan the other
      // still-unmatched indices as candidate partners for it until one
      // actually matches (rather than always retrying the same fixed
      // [a, b] pair, which would loop forever if that particular pair
      // happens not to be a match in the shuffled deck). `a` must be
      // re-pressed on every attempt: a mismatch's flip-back timer clears
      // BOTH flipped cards, not just the candidate, so `a` is face-down
      // again by the time the next candidate is tried.
      const [a, ...candidates] = remaining;
      let foundMatch = false;
      for (const b of candidates) {
        await fireEvent.press(getByTestId(`memory-match-card-${a}`));
        await fireEvent.press(getByTestId(`memory-match-card-${b}`));
        // Advance past the mismatch flip-back delay before checking:
        // immediately after the second press, BOTH a real match (now
        // permanently `matched`) and a genuine mismatch (still transiently
        // flipped, pending its flip-back timeout) render face-up, so the
        // only reliable way to tell them apart is to let the mismatch
        // timer -- if one was scheduled -- actually fire first. Advancing
        // time here is a harmless no-op when this WAS a real match (no
        // timer was ever scheduled for it).
        await act(async () => {
          jest.advanceTimersByTime(900);
        });
        const stillThereA = queryByTestId(`memory-match-card-${a}-image`);
        if (stillThereA) {
          // Matched -- both a and b are now permanently face-up/matched.
          matchedIndices.add(a);
          matchedIndices.add(b);
          foundMatch = true;
          break;
        }
        // Mismatched (and already flipped back down) -- try the next
        // candidate partner for `a`.
      }
      if (!foundMatch) break; // Shouldn't happen: `a` always has exactly one partner left.
    }

    await waitFor(() => expect(getByTestId('memory-match-complete')).toBeTruthy());
    expect(getByTestId('celebration-overlay-card')).toBeTruthy();
  });

  describe('friend mode', () => {
    it('shows a score chip for each player, starting at 0, and a turn indicator naming whoever moves first', async () => {
      const { getByTestId } = await renderGame({ mode: 'friend', pairCount: 6, childName: 'Sam', friendName: 'Alex' });
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(getByTestId('memory-match-score-child').props.children).toContain('Sam');
      expect(getByTestId('memory-match-score-child').props.children).toContain('0');
      expect(getByTestId('memory-match-score-friend').props.children).toContain('Alex');
      expect(getByTestId('memory-match-score-friend').props.children).toContain('0');
      expect(getByTestId('memory-match-turn')).toBeTruthy();
    });

    it('does not show the turn indicator during the preview (play has not started yet)', async () => {
      const { queryByTestId } = await renderGame({ mode: 'friend', pairCount: 6, friendName: 'Alex' });

      expect(queryByTestId('memory-match-turn')).toBeNull();
    });

    it('keeps the same player\'s turn and increments their score after a MATCH', async () => {
      const { getByTestId, queryByTestId } = await renderGame({ mode: 'friend', pairCount: 6, friendName: 'Alex' });
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Cards are face-down post-preview, so a genuine matching pair can
      // only be discovered by actually flipping cards (same anchor/
      // candidate sweep the earlier solo-mode MISMATCH test uses), just
      // looking for two SAME sources instead of two different ones. A
      // mismatch's flip-back must be awaited before the next attempt --
      // both cards involved flip back down together, freeing the board
      // for a new pair of taps.
      async function flipAndImage(index: number) {
        await fireEvent.press(getByTestId(`memory-match-card-${index}`));
        return queryByTestId(`memory-match-card-${index}-image`);
      }

      // Anchor on card 0 and sweep every other card in order until its
      // true partner turns up. Every failed attempt along the way is a
      // genuine MISMATCH, which legitimately passes the turn per spec --
      // so "the turn before the match" must be captured fresh right
      // before each actual attempt, not once at the very start, or an
      // odd number of incidental search mismatches would wrongly make
      // this test think the final MATCH itself changed the turn.
      const untried = Array.from({ length: 11 }, (_, i) => i + 1); // indices 1..11
      let anchorImage = await flipAndImage(0);

      let matchIndex = -1;
      let turnBefore = getByTestId('memory-match-turn').props.children;
      while (matchIndex === -1 && untried.length > 0) {
        const candidate = untried.shift()!;
        turnBefore = getByTestId('memory-match-turn').props.children;
        const candidateImage = await flipAndImage(candidate);
        if (candidateImage && anchorImage && candidateImage.props.source === anchorImage.props.source) {
          matchIndex = candidate;
          break;
        }
        await act(async () => {
          jest.advanceTimersByTime(900);
        });
        anchorImage = await flipAndImage(0);
      }
      expect(matchIndex).toBeGreaterThanOrEqual(0);

      const turnAfter = getByTestId('memory-match-turn').props.children;
      expect(turnAfter).toBe(turnBefore);

      const childScoreText = getByTestId('memory-match-score-child').props.children;
      const friendScoreText = getByTestId('memory-match-score-friend').props.children;
      const oneOfThemScored = childScoreText.includes(': 1') || friendScoreText.includes(': 1');
      expect(oneOfThemScored).toBe(true);
    });

    it('passes the turn to the other player after a MISMATCH', async () => {
      const { getByTestId, queryByTestId } = await renderGame({ mode: 'friend', pairCount: 6, friendName: 'Alex' });
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      const turnBefore = getByTestId('memory-match-turn').props.children;

      async function flipAndImage(index: number) {
        await fireEvent.press(getByTestId(`memory-match-card-${index}`));
        return queryByTestId(`memory-match-card-${index}-image`);
      }

      // Anchor on card 0; if an early candidate happens to be its TRUE
      // partner (a genuine match, not the mismatch this test needs), the
      // anchor becomes permanently matched and can no longer be re-
      // flipped, so re-anchor on a fresh, still-untried card instead of
      // getting stuck re-pressing an already-matched card.
      const untried = Array.from({ length: 11 }, (_, i) => i + 1);
      let anchorIndex = 0;
      let anchorImage = await flipAndImage(anchorIndex);

      let mismatchIndex = -1;
      while (mismatchIndex === -1 && untried.length > 0) {
        const i = untried.shift()!;
        const candidateImage = await flipAndImage(i);
        if (!candidateImage) continue;
        if (candidateImage.props.source !== anchorImage!.props.source) {
          mismatchIndex = i;
        } else if (untried.length > 0) {
          anchorIndex = untried.shift()!;
          anchorImage = await flipAndImage(anchorIndex);
        }
      }
      expect(mismatchIndex).toBeGreaterThan(-1);

      await act(async () => {
        jest.advanceTimersByTime(900);
      });

      const turnAfter = getByTestId('memory-match-turn').props.children;
      expect(turnAfter).not.toBe(turnBefore);
    });

    it('shows a completion title matching the actual final scores in friend mode (win or draw)', async () => {
      const { getByTestId, queryByTestId } = await renderGame({
        mode: 'friend',
        pairCount: 6,
        childName: 'Sam',
        friendName: 'Alex',
      });
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Same brute-force full-board pairing sweep the solo completion test
      // uses above -- drive the game all the way to completion so
      // completionTitle()'s real friend-mode branches (draw / child win /
      // friend win) actually run, instead of asserting on a placeholder.
      // Which player ends up ahead is NOT fixed by this sweep (matches keep
      // the turn, mismatches pass it, so who happens to find more pairs
      // during a scripted sweep is incidental) -- so this test reads
      // whichever outcome actually happened from the score chips themselves
      // and asserts the title reflects THAT, rather than assuming a winner.
      const cardCount = 12;
      const matchedIndices = new Set<number>();
      let guard = 0;
      while (matchedIndices.size < cardCount && guard < 200) {
        guard++;
        const remaining = Array.from({ length: cardCount }, (_, i) => i).filter((i) => !matchedIndices.has(i));
        if (remaining.length < 2) break;
        const [a, ...candidates] = remaining;
        let foundMatch = false;
        for (const b of candidates) {
          await fireEvent.press(getByTestId(`memory-match-card-${a}`));
          await fireEvent.press(getByTestId(`memory-match-card-${b}`));
          await act(async () => {
            jest.advanceTimersByTime(900);
          });
          const stillThereA = queryByTestId(`memory-match-card-${a}-image`);
          if (stillThereA) {
            matchedIndices.add(a);
            matchedIndices.add(b);
            foundMatch = true;
            break;
          }
        }
        if (!foundMatch) break;
      }

      await waitFor(() => expect(getByTestId('memory-match-complete')).toBeTruthy());

      // Parse each player's real final score off the score chips (text
      // like "Sam: 4") rather than hardcoding an assumed winner.
      const childScoreText = getByTestId('memory-match-score-child').props.children as string;
      const friendScoreText = getByTestId('memory-match-score-friend').props.children as string;
      const childScore = Number(childScoreText.match(/(\d+)$/)?.[1]);
      const friendScore = Number(friendScoreText.match(/(\d+)$/)?.[1]);
      expect(Number.isNaN(childScore)).toBe(false);
      expect(Number.isNaN(friendScore)).toBe(false);

      const overlay = getByTestId('celebration-overlay-card');
      if (childScore === friendScore) {
        expect(within(overlay).getByText("It's a draw!")).toBeTruthy();
      } else if (childScore > friendScore) {
        expect(within(overlay).getByText('Sam wins! 🎉')).toBeTruthy();
      } else {
        expect(within(overlay).getByText('Alex wins! 🎉')).toBeTruthy();
      }
    });

    // Regression test for the score/deck side effects that used to live
    // INSIDE the setFlippedIndices functional updater: two taps resolving a
    // MATCH, delivered in the same React batch (a child drumming on the
    // board), must still score exactly once -- not be lost, and not be
    // double-applied. Uses the preview phase (every card face-up) to find a
    // real matching pair by reading images directly, without flipping
    // anything, so the board is still pristine for the actual batched press.
    it('a batched match (two taps in one React batch) scores exactly once', async () => {
      // The board reshuffles when the preview ends (see the roundKey
      // effect in MemoryMatchScreen), so a matching pair's positions can't
      // be read from the preview's face-up images -- those positions are
      // gone by the time play starts. Instead, pin Math.random to a
      // constant so buildDeck/reshuffle are deterministic, and replay the
      // exact same two pure calls the component itself makes (mount's
      // buildDeck, then the preview-end effect's reshuffle) to compute the
      // real post-reshuffle arrangement up front.
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const computedDeck = reshuffle(buildDeck(6, resolvableItemIds()));
      let matchA = -1;
      let matchB = -1;
      outer: for (let i = 0; i < computedDeck.length && matchA === -1; i++) {
        for (let j = i + 1; j < computedDeck.length; j++) {
          if (computedDeck[i].itemId === computedDeck[j].itemId) {
            matchA = i;
            matchB = j;
            break outer;
          }
        }
      }
      expect(matchA).toBeGreaterThanOrEqual(0);

      const { getByTestId } = await renderGame({ mode: 'friend', pairCount: 6, friendName: 'Alex' });

      await act(async () => {
        jest.advanceTimersByTime(2000); // past the preview
      });
      randomSpy.mockRestore();

      // React logs "overlapping act() calls" for the deliberately-nested
      // act below -- that nesting IS the batch being reproduced, same
      // spy-and-restore idiom as TicTacToeScreen's own batched-tap test.
      const silenceOverlappingActWarning = jest.spyOn(console, 'error').mockImplementation(() => {});
      await act(async () => {
        fireEvent.press(getByTestId(`memory-match-card-${matchA}`));
        fireEvent.press(getByTestId(`memory-match-card-${matchB}`));
      });
      silenceOverlappingActWarning.mockRestore();

      const childPts = Number(getByTestId('memory-match-score-child').props.children.match(/(\d+)$/)?.[1]);
      const friendPts = Number(getByTestId('memory-match-score-friend').props.children.match(/(\d+)$/)?.[1]);
      expect(childPts + friendPts).toBe(1);
    });

    // Regression test for the stale-`deck`-CLOSURE bug (distinct from the
    // batched-match test above, which covers the `flippedIndices` closure):
    // 4 rapid taps on the SAME matching pair (A, B, A, B) landing in one
    // React batch used to score the pair TWICE. Taps 1-2 resolve the match
    // (score +1, `matched: true` queued via the async `setDeck` call) --
    // but the outer `deck` closure variable itself isn't updated until
    // React actually re-renders, so taps 3-4 (still running against that
    // same pre-update render) saw `deck[index].matched` as still `false`,
    // re-flipped the "same" pair as if fresh, and `checkMatch` (also
    // reading the stale closure `deck`) reported a second genuine match.
    // `deckRef` (kept synchronously in sync, exactly like
    // `flippedIndicesRef` already was) is what makes taps 3-4 correctly see
    // the pair as already matched and bail out via the early-return guard.
    it('4 rapid taps on the same matching pair in one batch (A, B, A, B) score exactly once, not twice', async () => {
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const computedDeck = reshuffle(buildDeck(6, resolvableItemIds()));
      let matchA = -1;
      let matchB = -1;
      outer: for (let i = 0; i < computedDeck.length && matchA === -1; i++) {
        for (let j = i + 1; j < computedDeck.length; j++) {
          if (computedDeck[i].itemId === computedDeck[j].itemId) {
            matchA = i;
            matchB = j;
            break outer;
          }
        }
      }
      expect(matchA).toBeGreaterThanOrEqual(0);

      const { getByTestId } = await renderGame({ mode: 'friend', pairCount: 6, friendName: 'Alex' });

      await act(async () => {
        jest.advanceTimersByTime(2000); // past the preview
      });
      randomSpy.mockRestore();

      // Same deliberately-nested-act idiom as the batched-match test above
      // -- the nesting IS the single batch of 4 taps being reproduced.
      const silenceOverlappingActWarning = jest.spyOn(console, 'error').mockImplementation(() => {});
      await act(async () => {
        fireEvent.press(getByTestId(`memory-match-card-${matchA}`));
        fireEvent.press(getByTestId(`memory-match-card-${matchB}`));
        fireEvent.press(getByTestId(`memory-match-card-${matchA}`));
        fireEvent.press(getByTestId(`memory-match-card-${matchB}`));
      });
      silenceOverlappingActWarning.mockRestore();

      const childPts = Number(getByTestId('memory-match-score-child').props.children.match(/(\d+)$/)?.[1]);
      const friendPts = Number(getByTestId('memory-match-score-friend').props.children.match(/(\d+)$/)?.[1]);
      expect(childPts + friendPts).toBe(1);
    });

    // Regression guard for the same fix: the match/score side effects used
    // to run inside the setFlippedIndices updater function, which React
    // deliberately double-invokes under StrictMode to surface impurities --
    // a real risk here, since a naive re-run would score a match twice.
    // Restructured so those side effects live in the (once-per-press) event
    // handler instead, which StrictMode does not double-invoke.
    it('under React.StrictMode, a genuine match increments a score by exactly 1, not 2', async () => {
      const { getByTestId, queryByTestId } = await renderGame(
        { mode: 'friend', pairCount: 6, friendName: 'Alex' },
        { strictMode: true }
      );
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      async function flipAndImage(index: number) {
        await fireEvent.press(getByTestId(`memory-match-card-${index}`));
        return queryByTestId(`memory-match-card-${index}-image`);
      }

      const untried = Array.from({ length: 11 }, (_, i) => i + 1);
      let anchorIndex = 0;
      let anchorImage = await flipAndImage(anchorIndex);

      let matchIndex = -1;
      while (matchIndex === -1 && untried.length > 0) {
        const candidate = untried.shift()!;
        const candidateImage = await flipAndImage(candidate);
        if (candidateImage && anchorImage && candidateImage.props.source === anchorImage.props.source) {
          matchIndex = candidate;
          break;
        }
        await act(async () => {
          jest.advanceTimersByTime(900);
        });
        anchorImage = await flipAndImage(anchorIndex);
      }
      expect(matchIndex).toBeGreaterThanOrEqual(0);

      const childPts = Number(getByTestId('memory-match-score-child').props.children.match(/(\d+)$/)?.[1]);
      const friendPts = Number(getByTestId('memory-match-score-friend').props.children.match(/(\d+)$/)?.[1]);
      expect(childPts + friendPts).toBe(1);
    });
  });

  // Bug 3: the "memorize the board" preview timer must not start counting
  // down until this deck's actual bundled photos have been preloaded --
  // otherwise a meaningful chunk of the 2s preview can be spent looking at
  // still-loading cards. mockDownloadAsync (declared at the top of this
  // file, mocking `expo-asset`) defaults to resolving immediately for every
  // other test in this file; these tests take direct control of it.
  describe('preview preloading (bug 3)', () => {
    afterEach(() => {
      mockDownloadAsync.mockReset();
      mockDownloadAsync.mockResolvedValue(undefined);
    });

    it('shows a loading panel and does not start the preview timer until preloading actually resolves, but never hangs forever if a download never settles', async () => {
      // A download that NEVER settles (neither resolves nor rejects) --
      // realistically possible in dev/Expo Go over a stalled Metro
      // connection. `Promise.allSettled` inside `preloadItemImages` gives
      // this exactly zero protection (it only guards rejections), so the
      // only thing standing between this and a permanently stuck
      // LoadingPanel is MemoryMatchScreen's `withPreloadTimeout`. This is
      // the test that actually proves that guarantee: the screen must
      // escape 'preloading' once the timeout elapses, never staying stuck.
      const pending = new Promise<void>(() => {
        // Deliberately never resolves or rejects.
      });
      mockDownloadAsync.mockImplementation(() => pending);

      const { queryByTestId, queryAllByTestId } = await renderGame({ pairCount: 6 });

      // Still preloading: the loading panel shows, no cards are rendered
      // yet, and a real preload attempt has genuinely been kicked off.
      expect(queryByTestId('memory-match-loading')).toBeTruthy();
      expect(queryAllByTestId(/memory-match-card-\d+/)).toHaveLength(0);
      expect(mockDownloadAsync).toHaveBeenCalled();

      // Advance past PRELOAD_TIMEOUT_MS (2500ms): even though the
      // download promise above will NEVER settle, the preload timeout
      // must force the preview to start anyway.
      await act(async () => {
        jest.advanceTimersByTime(2500);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(queryByTestId('memory-match-loading')).toBeNull();
      expect(queryAllByTestId(/memory-match-card-\d+-image/)).toHaveLength(12);

      // And the preview proceeds exactly as if preloading had succeeded --
      // after PREVIEW_DURATION_MS it flips face-down into real play, never
      // getting stuck again.
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(queryAllByTestId(/memory-match-card-\d+-back/)).toHaveLength(12);
    });

    it('preloads only the itemIds actually dealt into this deck, not the whole bundled pool', async () => {
      await renderGame({ pairCount: 6 });

      // pairCount 6 means exactly 6 unique itemIds are dealt into this
      // deck (12 cards, 2 per item) -- out of a 20-item bundled pool.
      // Preloading must only ever attempt those 6, never all 20.
      expect(mockDownloadAsync).toHaveBeenCalled();
      expect(mockDownloadAsync.mock.calls.length).toBe(6);
    });

    it('does not get stuck forever if one asset\'s download rejects (best-effort preload)', async () => {
      mockDownloadAsync.mockRejectedValue(new Error('simulated download failure'));

      const { queryByTestId, queryAllByTestId } = await renderGame({ pairCount: 6 });

      // The rejection must not hang the screen -- the preview still starts
      // (proving the round is never permanently stuck on a bad asset).
      expect(queryByTestId('memory-match-loading')).toBeNull();
      expect(queryAllByTestId(/memory-match-card-\d+-image/)).toHaveLength(12);
    });
  });
});
