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

### Iteration 13 — Accessibility semantics for the Puzzle gallery's difficulty modal
**Screen:** Puzzle gallery.
**Problem:** Continuing the accessibility sweep from iteration 12. While
looking for the next candidate, discovered `src/components/PieceCountPicker.tsx`
(a difficulty-picker component) is dead code — never imported anywhere in
the app (confirmed by grepping the whole `src/` tree). The REAL, live
difficulty picker is inline inside `PuzzleGallery.tsx`: a "Difficulty: N"
pill that opens a Modal with 4 piece-count options. The trigger pill
already had accessibility props, but the modal's dismiss backdrop and all 4
options had none at all — the same gap AgePicker had before iteration 12,
on the live component this time.
**Fix:** Added `accessibilityRole="button"` + a real label (new
`puzzleDifficultyModalCloseLabel` i18n key) + a `testID` to the previously
untagged backdrop; `accessibilityRole="button"`, a templated "{count}
pieces" label (new `puzzleDifficultyOptionLabel` i18n key), and
`accessibilityState={{selected}}` to each of the 4 options.
**Tests:** Three new regression tests covering every option's role/label/
selected-state, the backdrop's label, and German translations (523 total
tests passing, up from 520).

### Iteration 14 — Respect the OS reduce-motion setting in CelebrationOverlay
**Component:** `CelebrationOverlay` (shared by Quiz, Puzzle, Tic-Tac-Toe,
and Video's completion moments).
**Problem:** Accessibility audit into a previously-flagged, deliberately
broad gap: no screen anywhere checked the OS "reduce motion" accessibility
setting. Scoped down to one concrete piece rather than an all-8-files
sweep: `CelebrationOverlay`'s card entrance and celebration bubble always
played a bouncy `Animated.spring`, regardless of that setting — a real
vestibular-safety concern (large overshooting scale transforms can cause
discomfort for users who've enabled it), not a style nitpick, and this one
component backs every activity's finish moment.
**Fix:** New `src/design-system/useReducedMotion.ts` hook reads
`AccessibilityInfo.isReduceMotionEnabled()` and stays live via the
`reduceMotionChanged` event. When enabled, `CelebrationOverlay` jumps the
card/bubble scale straight to their resting value (no spring) and animates
opacity only — still visibly "appears," just without the bounce. Unchanged
when the setting is off. Documented one accepted edge case: if a screen
mounts with `visible` already `true` (rather than becoming true later),
the async check's brief default-`false` window can let one bounce start
before immediately stopping and restarting fade-only — a harmless one-time
flash, not a bug, given every real usage in this app mounts the component
well before `visible` ever flips true.
**Tests:** Two new regression tests (spring is/isn't called depending on a
mocked reduce-motion setting) plus all 5 pre-existing CelebrationOverlay
tests still pass unmodified (525 total tests passing, up from 523).

### Iteration 15 — Consistency: guard VideoPlayerScreen's Retry against a double-tap
**Screen:** Video player.
**Problem:** Consistency audit following up on an earlier bug-hunt note.
`handleRetry` (shared by the error-state Retry button and the completion
celebration's "Watch Again" action) was the one Retry/Next/Play-Again-style
action left in the app with no double-fire guard ref — every sibling
already has one (PuzzleScreen's `retryFiredRef`, QuizScreen's
`playAgainFiredRef`/`nextFiredRef`, Settings' `saveInFlightRef`). Not
destructive on its own (`player.replace`/`player.play` are idempotent), but
a real inconsistency: a rapid double-tap here behaved differently from
identical-looking buttons elsewhere in the app.
**Fix:** Added a `retryFiredRef`, set at the top of `handleRetry` (return
early if already fired), re-armed via a `useEffect` keyed on `[error,
finished]` that resets it whenever either legitimately becomes true again
(i.e., whenever the button reappears).
**Verified as a real (if low-severity) bug, not a hypothetical:** confirmed
the new regression test genuinely fails (`replace` called twice) without
the fix before committing.
**Tests:** New regression test double-tapping Retry, asserting the video
source is only replaced once (526 total tests passing, up from 525).

### Iteration 16 — Extend reduce-motion support to Quiz's score-card pop-in
**Screen:** Quiz.
**Problem:** Direct follow-up to iteration 14. `QuestionRenderer`'s
completion screen has its OWN hand-rolled score-card pop-in (a
`scoreCardScaleAnim`/`scoreCardOpacityAnim` pair in `QuizScreen.tsx`) —
NOT routed through the shared `CelebrationOverlay` component that iteration
14 already fixed — using the exact same bouncy-spring-plus-fade recipe, so
it still ignored the OS reduce-motion setting.
**Fix:** Same treatment as iteration 14: when `useReducedMotion()` returns
true, jump the scale straight to its resting value and animate opacity only
via `Animated.timing`; unchanged spring+timing parallel otherwise.
**Tests:** New regression test isolates the score-card's own spring calls
from `QuestionRenderer`'s unrelated `useTiltPress` press/lift springs by
asserting a delta (spring call count unchanged, timing call count
increased) around the completion transition, rather than a naive "spring
never called" check that unrelated tilt-press animations would contaminate
(527 total tests passing, up from 526).

### Iteration 17 — Accessibility parity: LanguageSelector matches AgePicker
**Screens:** Onboarding, Settings.
**Problem:** Fresh-eyes audit of areas no prior iteration had touched.
`LanguageSelector` mirrors `AgePicker`'s exact shared-modal shape (same
directory, same doc-comment explicitly claiming to follow that pattern,
same Onboarding/Settings usage) but never received AgePicker's own
iteration-12 accessibility fix. The trigger field already had
`accessibilityRole`/`accessibilityLabel`, but the modal-dismiss backdrop
and both language options (English/Deutsch) had none at all — the same
screen-reader dead end iteration 12 fixed elsewhere, left unfixed here by
oversight.
**Fix:** Added `accessibilityRole="button"` + a real label (new
`languageModalCloseLabel` i18n key) + a `testID` to the previously
untagged backdrop; `accessibilityRole="button"`, `accessibilityLabel`, and
`accessibilityState={{selected}}` to each option. Deliberately did NOT
route the option labels ("English"/"Deutsch") through `t()` — those are
each language's own name for itself (an autonym), not translatable UI
copy, and must stay invariant regardless of the app's current display
language (unlike the AgePicker/puzzle-difficulty fixes, where the label
content itself needed translating).
**Tests:** Three new regression tests covering both options'
role/label/selected-state, the backdrop's label, and confirming the
backdrop label translates to German while the option labels correctly do
not (530 total tests passing, up from 527).

### Iteration 18 — Accessibility state for Coloring's Fill/Pen tool buttons
**Screen:** Coloring.
**Problem:** Fill/Pen tool-mode toggle buttons already had
`accessibilityRole`/`accessibilityLabel`, but no `accessibilityState` — a
screen-reader user had no way to tell which tool was currently active.
This screen's own palette-swatch buttons already avoid this exact gap
(`accessibilityState={{selected}}` on each color), so the tool buttons were
the one inconsistent spot within the same file.
**Fix:** Added `accessibilityState={{ selected: toolMode === 'fill' }}` /
`{ selected: toolMode === 'pen' }}` to the two buttons — trivial, low-risk,
purely additive (no existing test reads these Pressables' exact prop set).
**Tests:** Two new regression tests covering the default state and the
flip after pressing Pen (532 total tests passing, up from 530).

### Iteration 19 — Fix a real double-tap bug on Onboarding's first-run Save
**Screen:** Onboarding.
**Problem:** Bug-hunt pass across every screen's Save/submit actions,
following the same category as iterations 6, 11, and 15.
`OnboardingScreen.tsx`'s `handleSave` — the very first screen a parent or
child interacts with — had no re-entrancy guard beyond
`!isValid || !folderUri || age === null`; it never checked `saving`
itself. The UI-level `saveDisabled` prop only takes effect on the NEXT
render, so a rapid double-tap on Save (trivial for a child) could re-enter
`handleSave` while the first call was still awaiting
`ensureContentStructure`/`saveProfile` — risking two concurrent sample-
content copies into the newly-granted folder and `onComplete()` firing
twice into the navigator.
**Fix:** Added a `savingRef` guard (same idiom as SettingsScreen's
`saveInFlightRef` from iteration 6), checked synchronously at the top of
`handleSave` and reset in the existing `finally` block (so a failed save's
Alert-and-retry path still works correctly afterward).
**Verified as a real bug, not a hypothetical:** confirmed the new
regression test genuinely fails (`ensureContentStructure` called twice)
without the fix before committing.
**Tests:** New regression test double-tapping Save before the mocked
`ensureContentStructure` promise resolves, asserting exactly one call each
to `ensureContentStructure`/`saveProfile`/`onComplete` (533 total tests
passing, up from 532).

### Iteration 20 — Guard Tic-Tac-Toe's Start button against a rapid double-tap
**Screen:** Tic-Tac-Toe setup.
**Problem:** Direct follow-up to iteration 19's bug-hunt category.
`TicTacToeSetupScreen.tsx`'s `handleStart` had no double-fire guard before
calling `onStart`, which `RootNavigator.tsx` wires straight to
`navigation.navigate('tictactoe-game', ...)`. Since React Navigation's
default stack keeps a screen mounted underneath whatever gets pushed on
top of it, a rapid double-tap on Start — before the push visually takes
over — could fire `onStart`/navigate twice, pushing the game screen onto
the stack twice.
**Fix:** Added a time-based `navLockRef` guard mirroring an EXISTING
precedent in this same codebase — `HomeScreen.tsx`'s own `navLockRef`
(same 800ms re-arm window, same unmount cleanup via a tracked timeout
ref) — rather than a permanent one-shot guard, since this setup screen
persists in the stack and a permanent lock would incorrectly leave Start
disabled forever if the parent backs out and legitimately wants to start
again.
**Verified as a real bug, not a hypothetical:** confirmed the new
regression test genuinely fails (`onStart` called twice) without the fix
before committing.
**Tests:** New regression test double-tapping Start (asserting a single
call), then using fake timers to confirm the guard re-arms after 800ms for
a later legitimate start (534 total tests passing, up from 533).

### Iteration 21 — Style the app's one bare/unstyled error screen
**Screen:** Global (FolderErrorScreen, in RootNavigator.tsx).
**Problem:** Fresh-eyes visual-consistency audit. `FolderErrorScreen` —
shown whenever the SAF content folders can't be resolved (a revoked
permission, a deleted folder, an unmounted SD card; a real, reachable path,
not a hypothetical edge case) — had NO styling at all: a bare `<Text>` and
an unstyled `<Pressable>`, no design-system tokens, no `StyleSheet`. Every
other error state in the app (VideoPlayerScreen, ColoringGallery,
PuzzleGallery, VideoGallery) had already converged on the same
`RaisedCard`+`RaisedPrimaryButton` shape — this was the one screen left
behind, and likely the single most visually "un-premium" moment reachable
in the app (raw black-on-white default RN text, no minimum touch target).
**Fix:** Restyled to match the established error-card pattern, using the
calmer `colors.parent.*` palette (the same one SettingsScreen uses) since
this is a parent-facing global recovery screen, not tied to any single
child activity, plus `useSafeAreaInsets()` padding matching other screens'
convention.
**Tests:** New regression test confirming the screen now has a real
background color instead of the old bare, unstyled container (535 total
tests passing, up from 534).

### Iteration 22 — Restyle Quiz's error state onto the design-system
**Screen:** Quiz.
**Problem:** Direct follow-up to iteration 21's visual-consistency angle.
`QuizScreen.tsx`'s error state (a real, reachable path when `loadQuestions`
rejects — a revoked SAF grant or deleted folder) had been left on the OLD
`theme/tokens.ts` styling (a bare `Pressable`+`Text` retry button) — the
file's own header comment explicitly flagged this as an intentional-but-
deferred gap, since the completion screen and every other gallery/player's
error state (VideoPlayerScreen, ColoringGallery, PuzzleGallery,
VideoGallery) had already converged on `RaisedCard`+`RaisedPrimaryButton`.
**Fix:** Restyled just the error state (loading/empty states deliberately
untouched, staying in scope) onto that same pattern, using `quizPalette`
for the card border/button accent. Removed the now-dead `retryButton`/
`retryButtonText` styles and their now-unused imports.
**Caught during self-review and fixed before committing:** the initial
version set `textColor` to a hardcoded `dsColors.ink`, copied from
VideoPlayerScreen's own error card — but that only happens to be correct
there because video's activity palette (marigold) needs ink text per
iteration 10's WCAG contrast fix; quiz's palette (violet) needs WHITE text.
Fixed to read `quizPalette.onAccentText` instead of hardcoding a color, so
this can never drift out of sync with the per-activity contrast rule again.
**Tests:** New regression test confirming the retry button now renders as
the shared `RaisedPrimaryButton` (Paper's structurally distinct style
shape) rather than the old flat-styled `Pressable`; confirmed via
`git stash` that it genuinely fails without the fix (536 total tests
passing, up from 535).

### Iteration 23 — Fix empty-state tone/hierarchy mismatch (Puzzle + Video galleries)
**Screens:** Puzzle gallery, Video gallery.
**Problem:** Investigated a suspected async-race candidate first (Settings'
"Reset everything" possibly causing an unmounted-component state update,
since `onReset` synchronously unmounts this screen in the real app) —
could NOT reliably reproduce it in a realistic test simulation (a wrapper
component conditionally unmounting SettingsScreen, mirroring RootNavigator's
actual shape), so it was abandoned rather than committed unverified.
Pivoted to a confirmed, concrete visual-consistency finding instead:
`ColoringGallery.tsx`'s empty state already splits its `EmptyStatePanel`
into a warm short bold `title` ("No pictures yet") plus a softer muted
`message` (the fuller instructional sentence) — but `PuzzleGallery.tsx` and
`VideoGallery.tsx`'s empty states instead passed their WHOLE instructional
sentence as a single bold `title` with no `message`, a real tone/hierarchy
mismatch against Coloring's pairing.
**Fix:** Added `emptyPicturesTitle`/`emptyVideosTitle` i18n keys and
updated both galleries to split title+message the same way Coloring does,
reusing the existing `emptyPictures`/`emptyVideos` keys unchanged as the
`message` (not renamed, so nothing else depending on them verbatim broke).
**Tests:** Extended both galleries' existing empty-state tests to assert
the new title text renders alongside the existing message text; confirmed
via `git stash` that both genuinely fail without the fix (536 total tests
passing — same count as iteration 22, since these are new assertions
inside existing tests, not new test cases).

### Iteration 24 — Extend reduce-motion support to useTiltPress (app-wide)
**Component:** `useTiltPress` (shared press-feedback hook used by
`RaisedButtonBase` and `AnimatedPressable` — which in turn backs
`RaisedCard`, `HomeScreen`'s cards, `QuestionRenderer`'s quiz/puzzle
options, and every raised button in the app).
**Problem:** Investigated 5 different bug-hunt angles first (puzzle-swap
races, tic-tac-toe's computer-thinking window, coloring's flood-fill,
profileStore/folderAccess read-then-write atomicity, stale-avatar on
profile-picture change) — all five investigated thoroughly and confirmed
CLEAN, no real issue found; reported honestly rather than fabricating a
speculative finding. Pivoted to a previously-deferred, already-flagged real
gap instead: `useTiltPress`'s press-in/press-out "tilt + lift + scale"
feedback always used a bouncy `Animated.spring`, ignoring the OS
reduce-motion setting — the same parallax-like motion category
`CelebrationOverlay` (iteration 14) and Quiz's score card (iteration 16)
were already fixed for, but flagged as deferred since this hook is shared
much more widely and needed extra care.
**Fix:** Applied `useReducedMotion()` CENTRALLY in the one shared hook
(not at each of its many call sites) — when enabled, `animateTo()` stops
any in-flight spring and jumps the driver value straight to the target via
`setValue`, instead of animating. This one change reaches every consumer
app-wide at once.
**Extra diligence given the wider blast radius:** self-review specifically
audited every call site (only 2: `Buttons.tsx`, `AnimatedPressable.tsx`)
for any assumption of gradual (vs. instant) value changes — confirmed
neither reads the returned `driver` value directly, so nothing depends on
it interpolating gradually. Also confirmed the `activeAnimationRef.current
?.stop()` call in the new branch isn't dead code: it's reachable if the OS
setting flips ON mid-press (a spring already in flight from before the
toggle), since `useReducedMotion` subscribes live to that change.
**Tests:** New regression test exercising the fix through
`RaisedPrimaryButton` as a representative consumer; confirmed via
`git stash` that it genuinely fails without the fix. Full suite (537
tests, up from 536) run and passing, deliberately including every
consumer's own test file given the shared hook's wide reach.

### Iteration 25 — Extend reduce-motion support to Quiz's progress dots
**Screen:** Quiz.
**Problem:** Completes the reduce-motion sweep started in iterations 14
(CelebrationOverlay), 16 (score card), and 24 (useTiltPress, app-wide).
`QuestionRenderer.tsx`'s progress-dots row has a small "pop" animation:
whenever the current question advances, the newly-current dot springs
from a smaller ratio up to scale 1, and the just-finished dot springs from
a larger ratio down to scale 1 — via `Animated.spring`, ignoring the OS
reduce-motion setting, and reachable up to 20 times in a single session
(the real maximum question count).
**Fix:** Added `useReducedMotion()`; when enabled, the `pop()` helper
jumps straight to `scale.setValue(1)` and returns, skipping the
`setValue(fromRatio)` + spring that follows — landing on the resting scale
immediately, with the dot's width/height style swap (done/current) still
conveying progress on its own.
**Verified as a real bug, not a hypothetical:** confirmed the new
regression test genuinely fails (reads `0.778`, still mid-spring) without
the fix. Self-review specifically traced the effect's dependency array
(now includes `reducedMotion`) for a toggle-mid-quiz edge case — confirmed
harmless, since the early-return guard (`prevIndex === currentIndex`)
still fires correctly when only `reducedMotion` changes.
**Tests:** New regression test reading the dots' actual `Animated.Value`
transform (same idiom as the pre-existing "animates the newly-current
dot..." test just above it) with reduce-motion mocked on, asserting both
dots land directly on scale 1 (538 total tests passing, up from 537).

### Iteration 26 — Extend reduce-motion support to EmptyStatePanel's looping bounce
**Component:** `EmptyStatePanel` (shared by Coloring/Puzzle/Video
galleries' empty states).
**Problem:** Final confirmation pass grepping every remaining
`Animated.spring`/`Animated.timing` call site in the app for un-audited
reduce-motion gaps. Found one genuinely different, arguably
higher-priority category than every prior fix: `EmptyStatePanel`'s emoji
bounce is a CONTINUOUS/infinite `Animated.loop` that keeps running for as
long as the empty state stays on screen — unlike the one-shot pop-ins
already fixed (which finish in under a second), persistent looping motion
is exactly what OS reduce-motion settings exist to suppress. (Also
confirmed the old, pre-redesign `src/components/EmptyState.tsx` — which
has an identical bounce loop — is dead code, never imported anywhere; not
a fix target.)
**Fix:** Added `useReducedMotion()`; the effect now checks it before
starting the loop, resting the emoji at `bounce.setValue(0)` instead when
enabled.
**Test engineering note:** this component starts its animation
UNCONDITIONALLY on mount (unlike `CelebrationOverlay`, which only starts
on a `visible` prop flip, letting tests defer past the async reduce-motion
check's resolution). Discovered empirically that the check's promise can
resolve and the effect's cleanup can fire SYNCHRONOUSLY within the same
`render()` call — a spy attached to the loop's `stop` method AFTER
`render()` returns silently observed zero calls even though `stop` had
genuinely already fired. Fixed by wrapping `stop` inside `Animated.loop`'s
own mock implementation, at the exact moment the real
`CompositeAnimation` is created, eliminating the race entirely (verified
by an independent review pass, which also confirmed this couldn't have
been a coincidental pass — the wrap happens before the object is ever
returned to the effect that later closes over it).
**Verified as a real bug, not a hypothetical:** confirmed the new test
genuinely fails (`stop` never called, since the un-fixed effect has no
`reducedMotion` dependency to re-run on) without the fix.
**Tests:** New regression test (539 total tests passing, up from 538).
Also independently re-confirmed the file's existing test-order fragility
(the "stops its bounce animation on unmount" test corrupts the RNTL
renderer for whatever runs after it — unrelated to this fix, a pre-existing
issue) by placing the new test after it and reproducing the failure, then
restoring the correct (before) placement.

### Iteration 27 — Expose accessibilityState.selected on gallery multi-select tiles
**Components:** `AnimatedPressable`, `RaisedCard` (shared design-system
components); Video/Coloring/Puzzle galleries' tiles.
**Problem:** Fresh-eyes sweep. Long-press multi-select mode in all three
galleries already checks a tile visually (a checkmark badge + border color
change), but the underlying `RaisedCard`/`AnimatedPressable` had no way to
expose a "selected" accessibility state at all — a screen-reader user
long-pressing into this mode got no indication of which tiles were
checked, despite this being an established convention elsewhere in the
app (AgePicker, LanguageSelector, PuzzleGallery's own difficulty options
all already use `accessibilityState={{selected}}`).
**Fix:** Added an optional `selected?: boolean` prop to both shared
components, combined into `accessibilityState` alongside `disabled`
(omitted entirely, not `false`, when unset — so every other consumer's
`accessibilityState` stays byte-identical to before). Wired
`selected={selectionMode ? isSelected : undefined}` into all three
galleries' tile `RaisedCard`s.
**Extra diligence given the wide blast radius:** self-review specifically
grepped every other consumer of these two widely-shared components
(HomeScreen, QuestionRenderer, QuizScreen, VideoPlayerScreen,
OnboardingScreen, TicTacToeSetupScreen, RootNavigator) and confirmed none
pass `selected` today, so the change is purely additive elsewhere;
verified in isolation that spreading `null` for the omitted case never
leaves a stray `selected: undefined` key on a control that's merely
`disabled`.
**Verified as a real bug, not a hypothetical:** confirmed via `git stash`
that all 5 new regression tests genuinely fail without the fix.
**Tests:** New tests in `AnimatedPressable.test.tsx` (selected exposed,
selected omitted vs. false, combined with disabled) and one in each
gallery's test file confirming the selected tile reports `{selected:
true}` and an unselected tile reports `{selected: false}` once multi-select
mode is active (545 total tests passing, up from 539).

### Iteration 28 — Expose accessibilityState.busy on AddFilesButton during in-flight picks
**Component:** `AddFilesButton` (shared "+ Add files" control used by the
Coloring/Video galleries to add individual files from anywhere on the
device).
**Problem:** Flagged in iteration 27's Remaining opportunities as
"missing `accessibilityState.disabled`/`busy`." Before implementing,
checked the claim against RN's own `Pressable` source
(`node_modules/react-native/Libraries/Components/Pressable/Pressable.js`,
~lines 227-236): the `disabled` prop is ALREADY unconditionally merged
into `accessibilityState.disabled` by `Pressable` itself, regardless of
what's passed to `accessibilityState` — confirmed empirically too, via a
scratch test showing `{disabled: false}` with zero extra code. So half of
the original finding was a false positive; the genuinely missing piece was
only `busy`, which RN never derives automatically. A screen reader
pressing this button during an in-flight picker/write only heard that the
button was "dimmed," not that something was actively happening.
**Fix:** Added `accessibilityState={{ busy }}` alongside the existing
`disabled={busy}` prop — additive only, doesn't touch or duplicate the
already-automatic `disabled` merge.
**Verified as a real bug, not a hypothetical:** confirmed via `git stash`
that the new test genuinely fails without the fix (`busy: undefined`
instead of the correct false/true/false transition).
**Test engineering note:** the new test needed `waitFor()` rather than a
manual `act(async () => { await Promise.resolve(); })` to reliably observe
the busy→settled transition (the latter left stale state intermittently).
Also hit the same cross-test RNTL-renderer-corruption pattern iteration 26
documented in `EmptyStatePanel.test.tsx`: this file's pre-existing "ignores
a rapid second tap..." test (an unawaited double-`fireEvent.press` +
manual `act()`) corrupts the renderer for whatever test runs after it in
the same file. Fixed the same way — placed the new test BEFORE it, not
after.
**Extra diligence:** dispatched a review agent that independently
re-derived the RN Pressable source claim, re-ran all 9 tests in file
order, reproduced the reordering fragility by testing both orderings, and
independently re-confirmed the git-stash fail/pass behavior — no issues
found.
**Tests:** New regression test covering the busy→settled transition (546
total tests passing, up from 545).

### Iteration 29 — Extend reduce-motion support to ColoringScreen's palette-swatch pop
**Screen:** Coloring.
**Problem:** Continues the reduce-motion sweep (iterations 14, 16, 24, 25,
26). ColoringScreen's palette-swatch selection has its own "pop" — the
newly-picked swatch springs up to scale 1.12 and the previously-picked one
springs back down to 1 — via `Animated.spring`, the exact same bouncy
pattern already fixed for the quiz's progress dots (iteration 25), but
never itself audited since it lives in a different file.
**Fix:** Added `useReducedMotion()`; the effect's `pop()` helper now checks
it right after stopping any in-flight animation for that swatch — when
enabled, jumps straight to `scale.setValue(toValue)` and returns instead of
starting the spring. The border/shadow swap between selected and
unselected swatches still conveys the selection change on its own.
**Verified as a real bug, not a hypothetical:** confirmed via `git stash`
that the new test genuinely fails without the fix (`blueScale` reads 1
instead of 1.12).
**Extra diligence:** self-review specifically confirmed the effect's
early-return guard (`prevColor === selectedDisplayColor`) still runs before
any reference to `reducedMotion`, so toggling the OS setting alone (with no
real color change) can't incorrectly re-fire the pop; also confirmed the
file's OTHER animation system (`animateToolbarButton`, the Fill/Pen/Undo/
Clear button press feedback) is untouched and remains a separate, not-yet
audited candidate. Independently re-verified by a dispatched review agent.
**Tests:** New regression test mocking the OS reduce-motion setting on and
asserting both swatches land directly on their resting scale (547 total
tests passing, up from 546).

### Iteration 30 — Extend reduce-motion support to ColoringScreen's toolbar buttons; fix a real cross-test mock-pollution bug
**Screen:** Coloring; **also affects the test suite's own hygiene** (5
other test files).
**Problem:** Direct follow-up to iteration 29. ColoringScreen's toolbar
button press feedback (`animateToolbarButton`, backing the Fill/Pen/Undo/
Clear buttons) still used an unconditional `Animated.spring` for its
press-in/press-out scale, ignoring the OS reduce-motion setting — the same
category already fixed for this screen's own palette-swatch pop moments
earlier. While writing the regression test, discovered a real, previously
undetected bug in this codebase's OWN test infrastructure: `jest.spyOn(
AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)`
followed later by `jest.restoreAllMocks()` does NOT actually undo the
mock — `isReduceMotionEnabled` is already an auto-mocked `jest.fn()` (a
native module method), so `jest.spyOn` on it just returns that same mock
rather than wrapping a real implementation, leaving no genuine "original"
for `restoreAllMocks()`/`mockRestore()` to revert to. The mocked `true`
value was silently leaking into every LATER test in the same file. This
had been latent (present but invisible) in 4 other files — `QuizScreen.
test.tsx`, `QuestionRenderer.test.tsx`, `EmptyStatePanel.test.tsx`,
`Buttons.test.tsx` — purely by luck, since no test after their respective
reduce-motion mock happened to assert anything that depended on reduce
motion being off. It became a live, reproducible failure here because the
new toolbar test now sits right after iteration 29's own polluting swatch
test, breaking the pre-existing "requests a spring toward the pressed-down
scale..." test.
**Fix:** Applied the same reduce-motion branch to `animateToolbarButton`
as iteration 29's swatch pop (stop any in-flight animation, then either
`setValue` directly or spring as before). Separately, fixed the mock-
pollution bug at its root by adding an explicit `(AccessibilityInfo.
isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);` reset in
all 6 places across the codebase where this mock is set to `true`
(`ColoringScreen.test.tsx` x2, `QuizScreen.test.tsx`, `QuestionRenderer.
test.tsx`, `EmptyStatePanel.test.tsx`, `Buttons.test.tsx`) — restoring the
actual guarantee those tests already claimed to provide. Confirmed
`CelebrationOverlay.test.tsx` needed no change: its very next test in the
same `describe` block already explicitly re-mocks to `false` itself,
sidestepping the bug through a different, already-safe mechanism.
**Verified as a real bug, not a hypothetical:** reproduced the pollution
in complete isolation (mock true → restoreAllMocks → next test's fresh
call still resolves true) before writing any fix; confirmed via `git
stash` that the new toolbar test genuinely fails without the
`ColoringScreen.tsx` source change.
**Extra diligence given the unusually wide diff (6 files) for this loop's
normal one-thing-per-iteration discipline:** dispatched a review agent
specifically briefed to be skeptical of the scope, independently
reproduce the pollution bug itself, and grep for every occurrence of the
mock pattern to confirm none were missed — confirmed all 7 real
occurrences (6 needing the fix, 1 already safe) were accounted for.
**Tests:** New regression test for the toolbar reduce-motion path, plus
the 6 test-file fixes (no new test count from those, since they only
correct existing tests' cleanup) — 548 total tests passing, up from 547.

### Iteration 31 — Extend reduce-motion support to PuzzleScreen's piece-snap pop, completing the sweep
**Screen:** Puzzle.
**Problem:** The last remaining un-audited spot in the app's reduce-motion
sweep. `PuzzleScreen.tsx`'s "piece-snap celebratory pop" — the moment a
piece is swapped into its correct slot, its scale plays an `Animated.
sequence` overshoot (1 -> 1.15 -> 1) — still used this unconditionally,
ignoring the OS reduce-motion setting, the same bouncy-pop category
already fixed everywhere else in the app.
**Fix:** Added `useReducedMotion()`; the `order`-watching effect's per-slot
pop now checks it before starting the sequence — when enabled, jumps
straight to `scale.setValue(1)` for that slot instead. The piece's own
instant position-snap already conveys that a correct placement just
happened, on its own. Also added an optional `testID` prop to the internal
`PuzzlePiece` component, threaded onto its inner `Animated.View` (distinct
from the outer Pressable's own `puzzle-slot-N` testID) — the same "give
the animated wrapper its own testID for testability" convention
ColoringScreen's swatch/toolbar faces already established, needed since
this screen had no existing way to read a piece's settled scale directly.
**Verified as a real bug, not a hypothetical:** confirmed via `git stash`
that the new test genuinely fails without the fix (the new testID doesn't
exist on the un-fixed component).
**Extra diligence:** self-review specifically confirmed the `return`
inside the per-slot `forEach` callback only skips that one slot (not the
whole effect, which would incorrectly leave other newly-correct slots in
the same render un-popped even in normal-motion mode), and that adding
`reducedMotion` to the effect's dependency array can't cause a toggle-only
false-positive pop, since `prevCorrectRef` already matches `order` from
the prior run. Independently re-verified by a dispatched review agent,
including re-tracing the same `forEach`-scoping question.
**Significance:** this completes the app-wide reduce-motion sweep started
in iteration 14 — every bouncy/overshooting animation in the app
(CelebrationOverlay, Quiz's score card + progress dots, useTiltPress's
app-wide press feedback, EmptyStatePanel's looping bounce, Coloring's
swatch pop + toolbar buttons, and now Puzzle's piece-snap pop) now
respects the OS setting. See the note in Remaining polish opportunities
below.
**Tests:** New regression test mocking the OS reduce-motion setting on and
asserting the swapped piece lands directly on its resting scale (549
total tests passing, up from 548).

## Bugs fixed
- White text on 3 of 5 Home activity cards (jade/marigold/sky) failed
  WCAG AA contrast badly (as low as 1.8:1 against a 3:1 minimum) — fixed
  in iteration 10.
- Quiz's "Next" button had no rapid-double-tap protection, letting a
  double-tap silently skip a question and mis-score it — fixed in
  iteration 11.
- `AgePicker` (Onboarding + Settings) had zero accessibility semantics on
  its trigger, backdrop, and all 7 options — fixed in iteration 12.
- Puzzle gallery's difficulty-modal backdrop and its 4 options had no
  accessibility semantics at all — fixed in iteration 13.
- Onboarding's first-run Save button had no rapid-double-tap protection,
  risking two concurrent sample-content copies and `onComplete()` firing
  twice — fixed in iteration 19.
- Tic-Tac-Toe setup's Start button had no rapid-double-tap protection,
  risking pushing the game screen onto the navigation stack twice — fixed
  in iteration 20.
- Video/Coloring/Puzzle galleries' multi-select mode had no
  `accessibilityState.selected` on checked tiles at all — fixed in
  iteration 27.
- `AddFilesButton`'s Pressable never set `accessibilityState.busy` while a
  file-picker operation was in flight — fixed in iteration 28.
- Test-suite bug (not app-facing): `jest.restoreAllMocks()` silently
  failed to reset a mocked `AccessibilityInfo.isReduceMotionEnabled`
  value, leaking a "reduce motion is on" state into later tests in the
  same file — fixed across 6 occurrences in iteration 30.

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
- Puzzle gallery (difficulty modal accessibility semantics added)
- CelebrationOverlay / Quiz + Puzzle + Tic-Tac-Toe + Video completion
  moments (reduce-motion support added)
- Video player (Retry double-tap guard added, for consistency)
- Quiz (score-card pop-in now also respects reduce-motion)
- LanguageSelector / Onboarding + Settings (accessibility semantics added)
- Coloring (tool-mode buttons now expose accessibilityState)
- Onboarding (Save button double-tap protection)
- Tic-Tac-Toe setup (Start button double-tap protection)
- Global FolderErrorScreen (restyled from bare/unstyled to match every
  other error state's design-system pattern)
- Quiz (error state restyled onto RaisedCard+RaisedPrimaryButton)
- Puzzle gallery + Video gallery (empty-state title/message split to match
  Coloring's tone/hierarchy)
- useTiltPress / app-wide (every raised button/card/pressable now respects
  reduce-motion for its press feedback)
- Quiz (progress-dots pop animation now also respects reduce-motion)
- EmptyStatePanel / Coloring + Puzzle + Video galleries (looping bounce
  now respects reduce-motion)
- AnimatedPressable + RaisedCard / Video + Coloring + Puzzle galleries
  (multi-select "selected" state now exposed to accessibility)
- AddFilesButton / Coloring + Video galleries (now exposes
  accessibilityState.busy while a pick is in flight)
- Coloring (palette-swatch selection pop now respects reduce-motion)
- Coloring (toolbar button press feedback now respects reduce-motion)
- Puzzle (piece-snap celebratory pop now respects reduce-motion)

## Remaining polish opportunities (not yet done)
- Reduce-motion sweep: CONFIRMED FULLY COMPLETE as of iteration 31. Every
  bouncy/overshooting animation in the app now respects the OS setting —
  CelebrationOverlay (14), Quiz's score card (16) + progress dots (25),
  useTiltPress's app-wide press feedback (24), EmptyStatePanel's looping
  bounce (26), Coloring's palette-swatch pop (29) + toolbar buttons (30),
  and Puzzle's piece-snap pop (31). No further un-audited springs/loops are
  known to remain in actively-used code.
- `src/components/EmptyState.tsx` (the old, pre-redesign empty-state
  component, superseded by `EmptyStatePanel`) is confirmed dead code —
  never imported anywhere in the app. Same category as `PieceCountPicker`;
  not a fix candidate, only a cleanup candidate if this sweep ever tackles
  dead-code removal.
- Investigated, not confirmed: SettingsScreen's `performReset` calls
  `setResetting(false)` in a `finally` block AFTER `onReset?.()`, and in the
  real app `onReset` is wired to RootNavigator's `setProfile(null)`, which
  conditionally unmounts this screen — in theory a guaranteed "state update
  on an unmounted component" warning. Tried to reproduce with a realistic
  test (a wrapper component conditionally unmounting SettingsScreen on
  reset, mirroring RootNavigator's actual shape) and could NOT trigger the
  warning even with the un-fixed code — React's batching may coalesce both
  updates before any commit, meaning this may not actually be a live bug in
  practice. Worth a deeper look (e.g. testing against the real
  RootNavigator integration, not just SettingsScreen in isolation) before
  committing any fix here, rather than assuming the theoretical race is
  real.
- `QuizScreen.tsx`'s loading/empty states still use the OLD
  `theme/tokens.ts` palette (the error state was fixed in iteration 22) —
  self-documented in the file's own header comment as intentionally out of
  scope for now, since these are lower-traffic moments than the error
  state was.
- `src/components/PieceCountPicker.tsx` is confirmed dead code — never
  imported anywhere in the app. Its i18n key `puzzlePickPieces` is likewise
  unused. Not a fix candidate (nothing to improve on unreachable code); a
  cleanup candidate if this app-wide sweep ever finds and removes other
  dead code, but out of scope for a single-purpose polish iteration on its
  own.
- White-on-bubblegum (Coloring card) is 3.04:1 — technically passes the
  3:1 large/bold-text minimum but with almost zero margin (0.04 above the
  line). Not touched this iteration since it does pass, but worth a look
  if the bubblegum hue itself ever shifts even slightly darker/lighter.
- Coloring and Video galleries still lack `getItemLayout` (see iteration
  9's Performance note). Investigated in iteration 17's planning and
  deliberately NOT done: unlike Puzzle's true fixed-128px tiles, Video's row
  height is only a `minHeight` around single-line text, and Coloring's tiles
  are flex/aspectRatio-sized — under a large system font-scale accessibility
  setting, real rendered height could exceed a hardcoded `getItemLayout`
  value, causing scroll-position glitches. Forcing this "optimization"
  would risk fighting this project's own accessibility goals for an
  unmeasured performance gain on typically much smaller lists (few hundred
  videos/colorings at most, vs. the "1000 images" puzzle scenario). Only
  worth doing if actually measured to matter, and only with a genuinely
  fixed row height.
- Coloring has no completion celebration at all, unlike the other four
  activities — but genuinely has no natural "finished" signal to detect
  (fills/strokes are open-ended and re-doable indefinitely), so this needs
  real design thought (e.g. a manual "I'm done!" button) rather than a
  cheap reuse of existing infrastructure — out of scope for a quick single
  iteration.
- Rapid-tap audit (iteration 6) found one remaining harmless-but-
  inconsistent spot (`VideoPlayerScreen.tsx`'s Retry, fixed in iteration
  15) plus one still open, not a real bug (the underlying delete call is
  idempotent, so a double-fire causes no corruption): the destructive
  confirm button inside `Alert.alert` for both Settings' "Reset everything"
  and every gallery's "Remove selected" isn't guarded against a double-tap
  on the Alert itself (RN never disables Alert buttons) — low priority.
- Resolved (audit, no code change): OnboardingScreen's full-screen dark
  "saving" overlay was flagged as possibly inconsistent with the lighter
  gallery `LoadingPanel`. Investigated in iteration 17's planning —
  intentional, not a bug: it blocks the ENTIRE screen during a critical
  one-time async operation (creating folder structure + copying sample
  content, which can take real seconds), preventing double-submission or
  navigating away mid-write. Galleries load in-place because navigating
  away mid-load there is harmless. Unifying the two would be a regression.
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
- Correction to an earlier note: `PieceCountPicker` was flagged here as a
  next accessibility candidate, but iteration 13 found it's actually dead
  code (never imported anywhere) — the live component fixed instead was
  `PuzzleGallery.tsx`'s inline difficulty modal. See iteration 13's entry.
- Reduce-motion support: see the fuller, up-to-date note earlier in this
  section — CONFIRMED FULLY COMPLETE as of iteration 31 (superseding this
  note's earlier iteration-26 snapshot). `SettingsScreen.tsx`'s
  `FadeInBanner` remains correctly out of scope: a plain opacity fade with
  no scale/translate/rotate, which reduce-motion guidance doesn't
  discourage.

## Visual review notes
- The candy/aurora activity-accent system already gives every screen a
  strong, recognizable identity — the new LoadingPanel deliberately reuses
  each screen's own accent color rather than a neutral gray spinner, so
  the loading moment doesn't feel like a jarring drop out of that identity.
