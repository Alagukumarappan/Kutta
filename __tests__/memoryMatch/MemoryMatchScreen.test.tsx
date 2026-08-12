import React from 'react';
import { Image } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { MemoryMatchScreen } from '../../src/memoryMatch/MemoryMatchScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';

jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({ uri: 'asset:///fake.jpg' } as any);

function renderGame(props: Partial<React.ComponentProps<typeof MemoryMatchScreen>> = {}) {
  const onMenu = props.onMenu ?? jest.fn();
  return render(
    <LanguageProvider initialLanguage="en">
      <MemoryMatchScreen
        mode={props.mode ?? 'solo'}
        pairCount={props.pairCount ?? 6}
        childName={props.childName ?? 'Sam'}
        friendName={props.friendName}
        onMenu={onMenu}
      />
    </LanguageProvider>
  );
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
});
