# Memory Match card

## Goal

A new Home card: a classic pairs-matching game. A grid of face-down cards,
all bundled real animal/car photos (not the parent's own content). Solo play
(no pressure, flip at your own pace) or take-turns-with-a-friend play (score
tracked per player, turn indicator), the same mode split `TicTacToeScreen`
already has for computer/friend.

## Content

A brand-new bundled set of ~20 real (not illustrated/icon) animal and car
photos — NOT the existing `pictures` folder (parent's own photos, unsuitable
for a fixed matching-game deck) and NOT the existing Quiz icon set (too
simple/cartoonish per explicit feedback). No superhero/named-character
images — those are copyrighted, and were dropped from scope for that reason
during design.

- Sourced the same way the existing `sample-content/pictures/farm.jpg` and
  `sample-content/pictures/sports-car.jpg` were: free-license (CC0/public
  domain) stock photos, verified individually before bundling.
- Needs at least 18 distinct photos total (the hardest difficulty needs 18
  pairs, i.e. 18 distinct images) — target ~20 to have a small buffer and a
  reasonable animal/car split (e.g. 14 animals + 6 cars).
- New folder: `sample-content/memory-match/` (mirrors `sample-content/quiz/`,
  `sample-content/coloring/`, etc.), each entry with a `category: 'animal' |
  'car'` tag in a new `src/memoryMatch/memoryMatchContent.ts` (same shape as
  `sampleContent.ts`'s `SampleAsset[]` arrays, `require()`'d statically so
  Metro bundles them as real assets). The category tag isn't used for
  anything in v1 (every game mixes both categories) but costs nothing to add
  now and avoids a rework if a theme picker (all-animals / all-cars) is ever
  requested later.

## Difficulty

Four fixed pair counts, picked on the setup screen: **6 / 10 / 14 / 18
pairs** (12 / 20 / 28 / 36 cards). Every game draws a random subset of that
size from the full bundled set (animals + cars mixed together, never a
themed subset) and shuffles it.

## Game modes

Picked on the setup screen, same pill-row convention as every other
mode/difficulty choice in the app (not a native dropdown control — see
mockup):

- **Solo**: no score card, no turn indicator. The child flips cards until
  every pair is found, then sees a completion celebration
  (`CelebrationOverlay`, same as every other activity).
- **Friend**: asks for a friend's name first (reusing
  `TicTacToeSetupScreen`'s exact friend-name-prompt copy/pattern). During
  play, a score row (one chip per player, e.g. "Sam: 2" / "Alex: 1") is
  ALWAYS visible, and a turn indicator ("Alex's turn") sits above the board.
  Turns alternate on a MISS (a non-matching pair flips back and play passes
  to the other player); a player who finds a match keeps their turn (the
  standard rule for this game, and better suited to short attention spans
  than always-alternating). Whoever has the most pairs when the board clears
  wins; a tie is possible and gets its own message, same pattern as
  `TicTacToeScreen`'s draw case.

No computer/AI opponent mode — explicitly out of scope, unlike Tic-Tac-Toe.

## Round intro sequence (Start → reveal → shuffle)

1. Tapping "Start Game" deals the shuffled deck face-UP immediately — every
   card visible for a fixed ~2 second preview.
2. All cards flip face-down and the deck re-shuffles positions (a second,
   different shuffle from the initial deal — otherwise a child who memorized
   position-to-image during the preview would have an unintended advantage
   matching the ORIGINAL layout, when the point of the shuffle is to make
   memorization meaningfully harder).
3. The turn indicator + score row (friend mode only) appear and real play
   begins.

## Architecture (mirrors `tictactoe/`)

- `src/memoryMatch/memoryMatchEngine.ts` — pure, dependency-free game logic,
  unit-testable with no React involved (same separation as
  `ticTacToeEngine.ts`):
  - `buildDeck(pairCount, allContent)` — picks `pairCount` random distinct
    photos from the bundled content list, duplicates each into a pair, and
    returns a shuffled card list (id, imageRef, matched: boolean).
  - `reshuffle(deck)` — returns a new shuffled arrangement of the same cards
    (used for the post-preview shuffle), never regenerating which images
    were chosen.
  - `checkMatch(deck, firstIndex, secondIndex)` — returns whether the two
    flipped cards match.
  - `isGameComplete(deck)` — true once every card is matched.
- `src/memoryMatch/memoryMatchContent.ts` — the bundled photo list described
  above.
- `src/memoryMatch/MemoryMatchSetupScreen.tsx` — mode pill row, conditional
  friend-name input, difficulty pill row, Start button. Modeled directly on
  `TicTacToeSetupScreen.tsx`'s structure and validation shape (Start disabled
  until every required field is chosen).
- `src/memoryMatch/MemoryMatchScreen.tsx` — owns the deck state, current
  turn/scores (friend mode), flip/match/mismatch logic (a brief delay before
  flipping a non-matching pair back, so the child actually sees both
  images — same "flash the result, then continue" pacing
  `QuestionRenderer`'s feedback modal already uses elsewhere), the
  reveal-then-shuffle intro sequence, and the completion
  `CelebrationOverlay` (win/draw text depending on mode).
- `RootNavigator.tsx`: new `memoryMatchSetup` / `memoryMatch-game` routes,
  same shape as the existing `tictactoe` / `tictactoe-game` pair.
- `HomeScreen.tsx`: new card (`home-card-memory-match`), a new
  `ActivityId`/`getActivityPalette()` entry, new i18n strings — same pattern
  as every prior card addition (Camera being the most recent example).

## Error handling

The bundled content is a static, always-present asset list (like Quiz's
`questions.json`) — there's no folder/permission/network failure mode to
handle here, unlike every other gallery-backed card. The only realistic
failure is a single bundled image failing to resolve via
`Image.resolveAssetSource`/`Asset.fromURI` (the same asset-resolution
approach `sampleContent.ts` already uses and has already worked around one
real release-build bug for) — `buildDeck` should exclude any photo that
fails to resolve when the deck is constructed and draw a replacement from
the remaining pool, rather than surfacing a broken image mid-game.

## Testing

- `memoryMatchEngine.test.ts`: deck building (correct pair count, no
  duplicate images within one deck, draws from the combined animal+car pool
  with no per-category minimum guaranteed — "mixed together" means not
  separated by theme, not a forced quota each game), reshuffle (same cards,
  different arrangement — statistically, not just "not literally identical"
  every single run), match/mismatch detection, completion detection.
- `MemoryMatchSetupScreen.test.tsx`: mode selection, conditional friend-name
  field, Start disabled/enabled states — same shape as
  `TicTacToeSetupScreen.test.tsx`.
- `MemoryMatchScreen.test.tsx`: flip sequence, match keeps turn / mismatch
  passes turn (friend mode), score updates, win/draw detection, solo mode
  never shows a score row or turn indicator, the reveal-then-shuffle intro
  timing.
- `HomeScreen.test.tsx`: new card renders, navigates, has a distinct accent
  color — same additions as every prior card.

## Out of scope (this iteration)

- Theme picker (all-animals / all-cars) — the `category` tag exists for
  this, but no UI is built for it now.
- Computer/AI opponent mode.
- Any content beyond the bundled animal/car set (no parent-added photos, no
  custom decks).
