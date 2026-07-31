# Premium Polish — Progress Log

Branch: `premium-polish` (local only, never pushed/merged per instructions).

Goal: no redesign, no architecture changes, no new dependencies — just
find and fix the next single thing that would make this app feel more
premium, delightful for a 2-8 year old, or more robust, one small reviewed
commit at a time.

## Completed improvements

### Iteration 1 — Loading spinners instead of blank screens (galleries)
**Screens:** Coloring, Puzzle, Video galleries.
**Problem:** All three galleries rendered a completely blank `<View />`
(no spinner, no color, no text) while their folder listing loaded from
storage. On a slow device, a large folder, or a cold SAF permission
re-check, a child would stare at an empty white rectangle with zero
feedback that anything was happening — the single worst kind of "is this
broken?" moment for this audience.
**Fix:** New shared `src/design-system/LoadingPanel.tsx` (ActivityIndicator
+ optional short message, tinted with that screen's own activity accent
color, matching the existing `EmptyStatePanel` component's conventions).
Wired into all three galleries with a new friendly `galleryLoading` i18n
string ("Getting things ready..." / "Wird vorbereitet..."). Also
incidentally fixed a small pre-existing bug in `VideoGallery.tsx`'s loading
branch, which was missing `flex: 1` on its wrapper.
**Tests:** One new regression test per gallery confirming a real loading
message renders instead of a blank screen (502 total tests passing, up
from 499).

### Iteration 2 — Deduplicate PuzzleScreen's loading state, unify on shared LoadingPanel
**Screen:** Puzzle (the board screen, not the gallery).
**Problem:** `PuzzleScreen.tsx` had two separate early-return branches
(`order.length === 0` and `!isImageSizeReady`) with byte-for-byte identical
markup — a leftover from an earlier refactor that duplicated the block
instead of merging the conditions. It also hand-rolled its own
`<ActivityIndicator>` block instead of using the new shared `LoadingPanel`
component from iteration 1, so the same "puzzle is getting ready" moment
looked subtly different in code (though visually similar) from every
gallery's loading state.
**Fix:** Merged both conditions into one `if (order.length === 0 ||
!isImageSizeReady)` branch, rendering the shared `LoadingPanel` (tinted
with `PUZZLE_PALETTE.accentDark`, same as before). Removed the now-dead
`ActivityIndicator` import and `loadingContainer` style.
**Why this matters:** consistency is a real premium signal — every loading
moment in the app now goes through the exact same component, so any future
loading-state improvement (e.g. a subtle fade-in) benefits every screen at
once instead of needing to be re-applied by hand in N places.
**Tests:** No behavior change — all 23 existing PuzzleScreen tests still
pass unmodified (502 total tests passing).

### Iteration 3 — Accessibility label for image-only quiz answer options
**Screen:** Quiz (QuestionRenderer).
**Problem:** An answer option with an image but no text (a structurally
supported shape — the quiz explicitly supports image-only options
elsewhere, e.g. the correct-answer reveal path) rendered
`accessibilityLabel={undefined}` on its Pressable. A screen-reader/TalkBack
user got an unlabeled "Button" announced for the option — for a
picture-matching question, that could mean all four answers are
indistinguishable and effectively unusable without sight.
**Fix:** Added a positional fallback label ("Answer option 1", "Answer
option 2", ...) via a new `quizAnswerOptionLabel` i18n key, used only when
`option.text` is absent; text options are completely unaffected (still get
their own text as the label).
**Tests:** New regression test verifying all 4 image-only options get
distinct, correctly-numbered labels (503 total tests passing, up from 502).

### Iteration 4 — Accessibility label + state for puzzle piece slots
**Screen:** Puzzle (the board screen).
**Problem:** Each puzzle-piece slot Pressable had NO `accessibilityRole` or
`accessibilityLabel` at all — every slot is a pure cropped-image fragment
with no text of its own, so a screen-reader user got a completely
unlabeled, unroled element for every one of the puzzle's pieces. Since
tapping pieces to swap them IS the entire puzzle interaction, this was a
total screen-reader dead end for the whole activity.
**Fix:** Added `accessibilityRole="button"`, a positional
`accessibilityLabel` ("Puzzle piece, position N") via a new
`puzzlePieceSlotLabel` i18n key, and `accessibilityState={{ selected:
selectedSlot === slotIndex }}` so a screen reader can also tell which
piece (if any) is currently "picked up" awaiting a swap — mirroring the
sighted selected-border cue `PuzzlePiece` already draws.
**Tests:** Two new regression tests: every slot gets the right role +
distinct label, and pressing a slot marks only that slot selected (505
total tests passing, up from 503).

### Iteration 5 — Accessibility role/label/state for Tic-Tac-Toe board cells
**Screen:** Tic-Tac-Toe (the board screen).
**Problem:** Board cell Pressables had no `accessibilityRole` or
`accessibilityLabel` at all. Empty cells were a total screen-reader dead
end (a screen-reader user couldn't tell which of the 9 squares they were
about to tap); filled cells were only semi-usable via RN's implicit
Text-child naming ("X"/"O") with no row/column context.
**Fix:** Same fix shape as iteration 4's puzzle-slot fix. Added
`accessibilityRole="button"`, a row/column positional label ("Row 2,
column 2, empty" / "Row 2, column 2, X") via two new i18n keys
(`tictactoeCellEmptyLabel`, `tictactoeCellFilledLabel`), and
`accessibilityState={{ disabled: ... }}` mirroring the exact same
conditions `handleCellPress` already uses to silently ignore a tap (game
over, cell already filled, or the computer is "thinking") — so what's
announced as disabled can never drift from what's actually un-tappable.
**Tests:** Three new regression tests covering empty-cell labels, a
filled cell's updated label + disabled state, and every cell becoming
disabled once the game ends (508 total tests passing, up from 505).

### Iteration 6 — Fix a real double-navigation bug on Settings' Save button
**Screen:** Settings.
**Problem:** Bug-hunt pass (rapid-tap audit across every action button in
the app). `handleSave`'s only re-entrancy guard was `if (!profile ||
migrating) return;` — but `migrating` only ever becomes `true` during a
folder-migration sub-path. The common case (a parent editing name/age/
language with no folder change) had ZERO protection: a rapid double-tap on
Save — trivial for a child, or just an impatient parent — re-entered
`handleSave` a second time while the first call was still awaiting
`saveProfile()`. Each call independently scheduled its own `goHomeTimeoutRef`
timer (the first one silently orphaned rather than cancelled), and both
eventually fired `onGoHome?.()` — navigating to Home twice in quick
succession.
**Fix:** Added a `saveInFlightRef` boolean guard (same idiom as
PuzzleScreen's `retryFiredRef`), set synchronously before the function's
first `await` (so a double-tap during the migration-confirmation Alert is
also blocked, not just during the final save), reset in a `finally` on
every exit path. Also defensively clears any pre-existing
`goHomeTimeoutRef.current` before scheduling a new one.
**Verified as a real bug, not a hypothetical:** confirmed the new
regression test genuinely fails without the fix (2 `saveProfile` calls
instead of 1) before committing.
**Tests:** New regression test double-tapping Save before its mocked
`saveProfile` promise resolves, asserting exactly one save and one
navigate-home (509 total tests passing, up from 508).

## Bugs fixed
- `VideoGallery.tsx`'s loading state was missing `flex: 1`, so the (now
  visible) loading indicator wouldn't have centered correctly — fixed as
  part of iteration 1.
- `PuzzleScreen.tsx` had two byte-for-byte duplicated loading-state
  branches (dead code smell, not a user-visible bug) — fixed in iteration 2.
- Image-only quiz answer options had no accessibility label at all — fixed
  in iteration 3.
- Puzzle-piece slots had no accessibility role/label/state at all — fixed
  in iteration 4.
- Tic-Tac-Toe board cells had no accessibility role/label/state at all —
  fixed in iteration 5.
- Settings' Save button had no rapid-double-tap protection in the common
  (no-folder-change) case, causing a double navigation to Home — fixed in
  iteration 6.

## Performance improvements
_(none yet)_

## Screens improved
- Coloring gallery (loading state)
- Puzzle gallery (loading state)
- Video gallery (loading state)
- Puzzle board screen (loading state deduplicated + unified; piece slots
  now accessible)
- Quiz (accessibility label for image-only options)
- Tic-Tac-Toe board screen (cells now accessible)
- Settings (Save button double-tap protection)

## Remaining polish opportunities (not yet done)
- Rapid-tap audit (iteration 6) also found two harmless-but-inconsistent
  spots, not real bugs (every underlying operation is idempotent, so a
  double-fire causes no corruption or visible glitch) — low priority, but
  noted for a future consistency pass: `VideoPlayerScreen.tsx`'s Retry
  button has no guard ref (unlike every other Retry-style action in the
  app), and the destructive confirm button inside `Alert.alert` for both
  Settings' "Reset everything" and every gallery's "Remove selected" isn't
  guarded against a double-tap on the Alert itself (RN never disables
  Alert buttons) — currently safe only because the underlying delete calls
  are all idempotent.
- OnboardingScreen's "saving" overlay is a full-screen dark scrim + spinner
  + text — visually distinct from the new lighter gallery `LoadingPanel`;
  worth a future pass to decide if that's intentional (blocking modal
  overlay vs. in-place content loading) or should be unified.
- Home carousel: no "peek further" affordance beyond partial card
  visibility at the edge — could add a subtle fade/gradient hint.
- Empty states already have a nice bounce (`EmptyStatePanel`) — check
  every gallery/empty-state screen actually uses it consistently.
- Quiz/Puzzle/Video celebration overlays: audit wording for warmth and
  consistency across all three.
- Double-tap / rapid-tap guards: verified present on Home cards, Puzzle
  Retry/Next, Quiz Play Again — worth auditing Tic-Tac-Toe's Retry/Menu the
  same way (already has the same idiom, guard verified during
  implementation) and other action buttons app-wide for the same pattern.
- Accessibility: check color-contrast and font-scaling behavior on the new
  design-system components under Android's large-font accessibility
  setting.

## Visual review notes
- The candy/aurora activity-accent system already gives every screen a
  strong, recognizable identity — the new LoadingPanel deliberately reuses
  each screen's own accent color rather than a neutral gray spinner, so
  the loading moment doesn't feel like a jarring drop out of that identity.
