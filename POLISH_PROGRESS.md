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

### Iteration 7 — Give the video player a completion celebration
**Screen:** Video (VideoPlayerScreen).
**Problem:** Child-delight audit across all 5 activities' completion
moments. Quiz, Puzzle, and Tic-Tac-Toe all celebrate finishing via the
shared `CelebrationOverlay` — Video was the one exception: a video just
ended and sat on its last frame with native controls, with literally zero
feedback that anything had happened. (Coloring has no natural "finish
line" to detect cheaply and was left alone; Video, by contrast, has a
crisp, already-available completion signal.)
**Fix:** Listens for expo-video's own `playToEnd` event (fires once when
playback reaches the end without looping) to show the same
`CelebrationOverlay` every other activity uses — new `videoFinished`
("Nice watching! 🎬") title and a "Watch Again" action reusing the
existing retry-replay logic (which now also resets the new `finished`
flag, not just `error`). No new dependencies, no new animation
infrastructure — pure reuse of what already exists.
**Tests:** Two new regression tests (celebration appears on `playToEnd`
with the right wording/action; "Watch Again" replays the video and
dismisses the celebration) — 511 total tests passing, up from 509.

### Iteration 8 — Don't celebrate a Tic-Tac-Toe loss as a triumph
**Screen:** Tic-Tac-Toe.
**Problem:** The win `CelebrationOverlay` always used `tone: 'success'` +
confetti emoji for ANY win, including the computer beating the child in
computer mode — the exact same festive styling for "you won!" and
"you lost to the computer." A loss shouldn't be styled as a triumph;
that's a real emotional-feedback mismatch for a young child.
**Fix:** Distinguishes a genuine human loss (`mode === 'computer' &&
winner === COMPUTER_PLAYER`) from every other win case (a friend-mode win
by either player, or the child beating the computer), which all still get
the full success/confetti treatment. Only the human-loss case gets a
calmer neutral tone, no confetti, and a new encouraging message
("Good try! Want to play again?") instead.
**Verified as a real bug, not a hypothetical:** confirmed the new
regression test genuinely fails without the fix before committing.
**Tests:** New regression test scripts a guaranteed computer win (via a
mocked `getComputerMove` that defaults to the real minimax for every other
test in the file) and asserts neutral tone + the encouraging message (512
total tests passing, up from 511).

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
- Tic-Tac-Toe celebrated a computer win against the child with the same
  confetti/success styling as a real win — fixed in iteration 8.

### Iteration 9 — getItemLayout for the Puzzle gallery's fixed-tile grid
**Screen:** Puzzle gallery.
**Problem:** Performance audit across all three galleries' FlatLists (none
had `getItemLayout`). Puzzle's is the clean candidate: every tile is a
fixed 128px square (`TILE_SIZE`) in a fixed 4-column grid (`GRID_COLUMNS`)
— both compile-time constants, never dependent on async-loaded content —
so FlatList had no reason to fall back to measuring each row's real layout
as it renders/scrolls. That measurement cost is a real, well-known RN
FlatList tax, and it scales directly with folder size (the project brief's
own "1000 images" bug-hunt scenario).
**Fix:** Added `getItemLayout` with a precomputed `ROW_HEIGHT = TILE_SIZE +
spacing.sm` (140px). **Caught and fixed a self-introduced bug during
review**: the first pass wrote `offset: ROW_HEIGHT * Math.floor(index /
GRID_COLUMNS)`, which double-divides — React Native, once `numColumns > 1`,
already treats FlatList's internal item count as the ROW count and calls
`getItemLayout` with that same row-scale index directly, not the flat
index into the image array (verified against the installed
`react-native`/`@react-native/virtualized-lists` source, not just
assumed). The extra division would have collapsed every row to offset 0,
breaking `scrollToIndex`/`initialScrollIndex`. Fixed to `offset:
ROW_HEIGHT * index` and re-reviewed independently to confirm.
**Tests:** New regression test reads `getItemLayout` directly off the
FlatList (via a new `puzzle-gallery-list` testID) and asserts the correct
row-scale offsets (513 total tests passing, up from 512).

### Iteration 10 — Fix a real WCAG contrast failure on 3 of 5 Home cards
**Screen:** Home.
**Problem:** Contrast audit of the app's most common text/background
pairings. Every activity card used white label/tagline text on its own
accent fill, but accent hues span a huge luminance range — computed real
WCAG contrast ratios: white-on-bubblegum 3.04:1 and white-on-violet 4.38:1
both cleared the 3:1 minimum for large/bold label text, but
white-on-jade (~2.1:1), white-on-marigold (~1.8:1), and white-on-sky
(~2.0:1) all failed it badly — the Puzzle, Video, and Tic-Tac-Toe cards'
text was genuinely hard to read, not just a style nitpick.
**Fix:** Added a new `onAccentText` field to `ActivityPalette` — white for
the two accents that already pass (coloring/bubblegum, quiz/violet),
`colors.ink` for the three that don't (puzzle/jade, video/marigold,
tictactoe/sky; `colors.ink` clears 7.6-8.9:1 against all three, comfortably
above even the stricter 4.5:1 bar). HomeScreen's card label/tagline now
read this per-activity color instead of a hardcoded white.
**Tests:** New test computes the actual WCAG relative-luminance/contrast-
ratio (a small hand-rolled implementation, not just pinning today's color
choices) for every activity and asserts >=3:1 — this stays meaningful if
individual accent hues change later, and would have caught the original
bug directly (514 total tests passing, up from 513).

### Iteration 11 — Fix a real double-tap bug that silently skips a quiz question
**Screen:** Quiz.
**Problem:** Bug-hunt pass across every screen's completion/advance actions.
`handleNext` had NO re-entrancy guard, unlike every other completion action
in the same file (`playAgainFiredRef`, `hasNavigatedHomeRef`) and unlike
Settings' Save (iteration 6). Two rapid taps on "Next" — trivial for a
child — fired `handleNext` twice with the same stale `selectedOptionId`
closure before the first `setState` ever re-rendered. React applied both
`answerCurrentQuestion()` updates back-to-back: the second one scored the
*next* question (never shown to the child) using the *previous* question's
answer, silently skipping a question and corrupting the score for the rest
of the session.
**Fix:** Added a `nextFiredRef` guard (same idiom as the file's existing
refs), set at the top of `handleNext` and reset via a `useEffect` keyed on
`state?.currentIndex` so a genuinely new question re-arms it. `handleRetry`
is unaffected since it never touches this ref.
**Verified as a real bug, not a hypothetical:** confirmed the new
regression test genuinely fails (jumps straight to the finished screen,
skipping question 2) without the fix before committing.
**Tests:** New regression test double-tapping "Next" before the first
answer's state update commits, asserting the second question still shows
and the session isn't prematurely finished (515 total tests passing, up
from 514).

### Iteration 12 — Accessibility semantics for AgePicker (Onboarding + Settings)
**Screens:** Onboarding, Settings.
**Problem:** Accessibility audit continuing the same sweep as iterations
3-5. `AgePicker` — a shared component used by both the mandatory first-run
Onboarding screen and Settings — had zero accessibility semantics anywhere:
the closed trigger field, the modal-dismiss backdrop, and all 7 age-option
rows had no `accessibilityRole`, `accessibilityLabel`, or
`accessibilityState`. A screen-reader user couldn't tell what the field
showed, what each option represented, or which age was currently selected
— on a control that's mandatory to complete first-run setup.
**Fix:** Added `accessibilityRole="button"` to the trigger, the backdrop,
and every option; a value-or-placeholder label on the trigger and a
templated "{age} years old" label (new `ageOptionLabel` i18n key) on each
option; `accessibilityState={{selected}}` on the current age; and a real
label (new `ageModalCloseLabel` i18n key) plus a `testID` on the previously
unlabeled modal-dismiss backdrop.
**Tests:** Five new regression tests covering the trigger's two label
states, every option's role/label/selected-state, the backdrop's label,
and German translations (520 total tests passing, up from 515).

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
- Tic-Tac-Toe celebrated a computer win against the child with the same
  confetti/success styling as a real win — fixed in iteration 8.
- White text on 3 of 5 Home activity cards (jade/marigold/sky) failed
  WCAG AA contrast badly (as low as 1.8:1 against a 3:1 minimum) — fixed
  in iteration 10.
- Quiz's "Next" button had no rapid-double-tap protection, letting a
  double-tap silently skip a question and mis-score it — fixed in
  iteration 11.
- `AgePicker` (Onboarding + Settings) had zero accessibility semantics on
  its trigger, backdrop, and all 7 options — fixed in iteration 12.

## Performance improvements
- Puzzle gallery's FlatList now has a correct `getItemLayout` for its
  fixed 128px/4-column tile grid, skipping per-row layout measurement as
  the list renders/scrolls (iteration 9) — Coloring/Video galleries still
  lack this (Coloring's tiles are flex/aspectRatio-sized rather than fixed
  px, making the math messier; Video's row height is only a `minHeight`),
  noted below as a follow-up.

## Screens improved
- Coloring gallery (loading state)
- Puzzle gallery (loading state; FlatList getItemLayout)
- Video gallery (loading state)
- Puzzle board screen (loading state deduplicated + unified; piece slots
  now accessible)
- Quiz (accessibility label for image-only options)
- Tic-Tac-Toe board screen (cells now accessible; win/loss tone corrected)
- Settings (Save button double-tap protection)
- Video player (completion celebration added)
- Home screen (card text contrast fixed for 3 of 5 activities)
- Quiz (Next button double-tap/skip bug fixed)
- AgePicker / Onboarding + Settings (accessibility semantics added)

## Remaining polish opportunities (not yet done)
- White-on-bubblegum (Coloring card) is 3.04:1 — technically passes the
  3:1 large/bold-text minimum but with almost zero margin (0.04 above the
  line). Not touched this iteration since it does pass, but worth a look
  if the bubblegum hue itself ever shifts even slightly darker/lighter.
- Coloring and Video galleries still lack `getItemLayout` (see iteration
  9's Performance note) — feasible for both, just messier math than
  Puzzle's clean fixed-px/fixed-column case.
- Coloring has no completion celebration at all, unlike the other four
  activities — but genuinely has no natural "finished" signal to detect
  (fills/strokes are open-ended and re-doable indefinitely), so this needs
  real design thought (e.g. a manual "I'm done!" button) rather than a
  cheap reuse of existing infrastructure — out of scope for a quick single
  iteration.
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
- `PieceCountPicker` (puzzle difficulty picker, same shared-component shape
  as `AgePicker` but a separate implementation) has the exact same
  accessibility gap `AgePicker` had before iteration 12 — trigger, backdrop,
  and all 4 options are unlabeled. Good next candidate, same fix shape.
- No screen calls `AccessibilityInfo.isReduceMotionEnabled` — every
  spring/timing animation (celebration bubbles, score-card pop-in, progress
  dots, tilt-press) ignores the OS reduced-motion setting entirely. Real
  vestibular-safety gap, but touching it properly means auditing every
  `Animated` call site across ~8 files — too broad for a single iteration;
  flagged here rather than done partially.

## Visual review notes
- The candy/aurora activity-accent system already gives every screen a
  strong, recognizable identity — the new LoadingPanel deliberately reuses
  each screen's own accent color rather than a neutral gray spinner, so
  the loading moment doesn't feel like a jarring drop out of that identity.
