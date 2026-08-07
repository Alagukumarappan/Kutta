# Bug Hunt Loop — Progress Log

Started per `/loop keep on looping and find and fix bugs...think like a child
and also parent and keep on improving until i say stop. you are a senior
architect and senior bug finder. make a clean way. max iterations of 40`.

**Process per iteration:**
1. Pick one focused area of the app (not touched too recently, or newest/least
   battle-tested code first).
2. Hunt for real bugs from two lenses: **the child** (confusing interactions,
   too-small touch targets, unclear feedback, scary error states, anything a
   2-8 year old would get stuck on) and **the parent** (data safety, privacy,
   correctness, crashes, settings behaving as documented, nothing that would
   embarrass a "senior architect" review).
3. Fix only GENUINE issues found — no manufactured busywork just to log an
   iteration. If a pass turns up nothing real, say so honestly.
4. Verify: full test suite + `npx tsc --noEmit`, both clean, before committing.
5. Commit, log the iteration below, push.
6. Stop conditions: user says stop, 40 iterations reached, or 3 consecutive
   iterations find nothing substantive (diminishing returns — logged clearly
   rather than padded).

**Iteration count: 8 / 40**

---

## Iteration 1 — the newest code: gradient rollout, Paper TextInput migration, sample-content legal fix

Six genuine bugs found and fixed; all 49 suites / 664 tests green and
`npx tsc --noEmit` clean.

**Gradient rollout (sky/skyDark) — contrast the earlier passes missed.** The
earlier fixes only covered the text each screen already knew about; a full
audit of everything painted directly on the gradient found four more:

1. `AddFilesButton` — the "+" control in all three galleries was still on the
   OLD theme's `sky` (#3EC1D3), ~1.07:1 against the new gradient's own sky
   (#3AC7F0). The only way a parent can add their own pictures/videos was
   effectively invisible. Now a white pill with a dark ink outline and glyph;
   its disabled state dims the glyph too (it used to be white on light grey).
2. `QuestionRenderer` progress dots — each dot's ring matched its own fill, so
   a completed jade dot was ~1.06:1 on the gradient and an unanswered one
   ~1.6:1: a child could not see how far through the quiz they were. All
   states now share one ink ring, fills still distinguish them.
3. `LoadingPanel` spinners — tinted with each activity's accent, which on the
   gradient means jade ~1.06:1 and marigold ~1.09:1, i.e. an invisible spinner
   in exactly the blank-screen moment this panel exists to fill. The spinner
   now sits on an opaque white disc (a no-op on the white surfaces it is also
   used on). `ColoringScreen` was also the only caller never passing
   `messageColor`, leaving its text at ~2.9:1.
4. `PuzzleGallery`'s "Retry" label was hard-coded white on its jade card
   (~2.1:1), contradicting tokens.ts, which already picks ink as jade's
   `onAccentText`. Both galleries now read the color from the palette.

**Paper TextInput migration — keyboard handling.** The migration itself is
sound (no Paper character counter, no label/background clash, the
`maxLength` + `slice()` belt-and-braces still correct), but nothing on any of
the three screens handled the keyboard, and this app is LANDSCAPE-locked
where the keyboard eats over half the window:

5. `TicTacToeSetupScreen` was a plain centered View with no scroll, so once a
   child tapped the friend-name field, Start (and often the field itself) was
   clipped away with no gesture able to reach it. Now centered inside a
   ScrollView that only scrolls when the window actually shrinks. All three
   keyboard screens also got `keyboardShouldPersistTaps="handled"`, so the
   first tap on Save/Start counts instead of being swallowed to dismiss the
   keyboard.

**Sample-content legal fix.** The seeding flow itself is correct end-to-end
and no stale `spiderman.png`/`barbie.png`/`coloring/car.png` references
survive anywhere (the only mentions are the deliberate "do not reintroduce"
note in ATTRIBUTION.md). But:

6. Two of the replacement files are not coloring pages: `car-icon.png` was a
   72x72 emoji icon (a pixelated blob once stretched across the canvas) and
   `princess.png` is gradient-shaded, so the flood fill (tolerance 10) fills
   only a small speckle of the tapped shade rather than a region — which
   reads to a child as the color tool being broken. Both dropped; the three
   that genuinely work are still seeded, and ATTRIBUTION.md now records the
   quality bar for anything added later.

**Checked and found fine:** every other text/graphic on the gradient
(resolved token-by-token, including `withAlpha` fades); Settings' staged-save,
migration, and reset flows; the re-entrancy guards on all three screens; the
`maxLength` caps; the Splash orientation comment (accurate — splash really
does run under the PORTRAIT_UP lock).

---

## Iteration 2 — the individually-added file reference feature

Four genuine bugs found and fixed; 49 suites / 682 tests green and
`npx tsc --noEmit` clean.

1. **Added pictures silently vanished.** The picker hands images back as a
   copy in the app's CACHE directory, and that copy was the only one kept.
   Android reclaims cache under storage pressure and "Clear cache" wipes it
   outright, so a coloring page added weeks earlier could just be gone.
   Picked images are now copied into `documentDirectory/kutta-added/` first
   (falling back to the old behaviour if the copy fails). Because those
   copies then have no other owner, removing such an item now deletes the
   bytes too instead of leaking them into storage the parent cannot see;
   files still belonging to the parent are left strictly alone. Videos stay
   referenced in place — copying a multi-gigabyte file would be worse.
2. **A failed check permanently destroyed references.**
   `pruneMissingFileReferences` treated a `getInfoAsync` REJECTION as "the
   file does not exist" and wrote the shortened list back. But an unmounted
   SD card, an unreachable cloud provider, or a grant not re-established
   after a restart all throw — so one bad moment irreversibly wiped every
   file the parent had added. Only a resolved `exists:false` prunes now; a
   failed check hides the item for that load and keeps the reference.
3. **A broken content folder hid the added files too.** Both sources loaded
   through one `Promise.all`, so a revoked SAF grant replaced the whole
   gallery with an error screen — hiding perfectly reachable added pictures
   AND the "+" button, which only exists in the normal header. Mirror case
   equally bad: a failed AsyncStorage read blanked a healthy folder. Settled
   independently now; the error screen appears only when nothing is showable.
4. **"Reset everything" left the pictures on disk.** It cleared the
   AsyncStorage keys only. With copies now living in app storage that meant
   the previous child's photos persisted indefinitely after an explicit
   reset. The copies are deleted too, best-effort.

**Checked and found fine:** `clearAllFileReferences` really is wired into
Settings' reset (alongside `clearProfile`/`clearActivityLog`/difficulty);
content types are properly independent; malformed-JSON and malformed-entry
handling; the multi-select removal path's reference-vs-real-file split; the
`inFlightRef` double-tap guard; deliberately NOT applying the gallery's
extension filter to references (picked videos have no extension in their
`content://` uri, so filtering would hide them all).

**Known limitation, not fixable here:** individually-picked VIDEOS keep a
`content://` uri whose read grant is not persistable — `expo-document-picker`
exposes no `takePersistableUriPermission` equivalent, and adding one would
mean a new native dependency. After a reboot such a video may become
unreadable; thanks to fix 2 the reference now survives rather than being
destroyed, but the item will be hidden until access returns.

---

## Iteration 3 — the Tic-Tac-Toe activity end to end

One genuine bug found and fixed; 49 suites / 686 tests green and
`npx tsc --noEmit` clean.

1. **A second tap could erase the child's first move.** Whose turn it was
   lived in its own `currentPlayer` state, hand-updated next to every
   `setBoard`, and each tap built the next board from the `board` of the
   render its handler was created in. React Native hands JS a BATCH of
   queued touch events at once, so two taps landing close together — a 2-8
   year old drumming on the board, or a stray second finger — both ran
   against that same pre-update render, and the second rebuilt the board
   from the stale copy. The first tap's mark vanished completely: the child
   tapped two squares and only the second one appeared, with the turn
   indicator advancing as if only one move had happened. Whose turn it is
   is not independent information (X always moves first and the players
   strictly alternate), so it is now DERIVED from the board via a new pure
   `playerToMove` in the engine, and both move paths apply inside a
   functional `setBoard` updater that re-checks occupancy, game-over and
   turn ownership against the very latest board. In computer mode that
   ownership check also stops a batched second tap placing the COMPUTER's
   mark for it (which would have let the child play both sides). Both cases
   have regression tests that reproduce the batch inside a single `act()`
   and were confirmed to fail without the fix.

**Checked and found fine** (a real pass, not a shrug):

- **Win/draw detection.** All 8 lines (3 rows, 3 columns, 2 diagonals) are
  present and hand-verified in `WINNING_COMBINATIONS`; `checkWinner` /
  `getWinningLine` use `some`+`every` over the full list, so no off-by-one
  or missing line is possible. A full board with no line reports `draw` and
  the overlay appears — no freeze, no crash.
- **Computer AI.** `getComputerMove` can only ever return an index from
  `getEmptyIndices`, so it can never target an occupied cell; it returns
  `null` only on a full board (already game-over, so unreachable from the
  turn effect). The three difficulties are genuinely different code paths
  (random / 50-50 / full minimax), not cosmetic. The computer cannot move
  twice or move after a win: its effect is gated on `!isGameOver` and on
  the derived turn, and the pending timeout is cancelled on cleanup.
  Timing: a worst-case first move on an empty board is ~550k minimax nodes,
  which is milliseconds — not a UI freeze.
- **Turn management.** `Math.random() < 0.5` is a genuine unseeded coin
  flip, re-rolled on every Retry, and the chosen starter really does make
  the first move — including the computer auto-opening the SECOND game
  after Play Again (verified by driving it), which was the most plausible
  "the game just sits there" stall.
- **Friend mode names.** Both names are attributed through the single
  `childMark` derivation, so they cannot swap mid-game or fall back to the
  placeholder; the friend name is guaranteed non-empty and trimmed by the
  setup screen, and the child name non-empty by onboarding.
- **Navigation double-taps.** Start (`navLockRef` + re-arm), Play Again
  (`retryFiredRef`) and Menu (`menuFiredRef`) are each guarded, and the
  overlay unmounts synchronously on Retry so there is no fade-out window in
  which a stray Menu tap could still fire.
- **Board rendering.** Already uses the explicit 3-row pattern, not
  `flexWrap` — immune to the column-count class of bug fixed in Puzzle and
  Quiz, with a test asserting exactly 3 cells in each of 3 row containers.

**Noted, not fixed (out of this iteration's scope):** the shared
`CelebrationOverlay` renders a `Modal` with no `onRequestClose`, so the
Android hardware back button does nothing while any activity's completion
panel is up. Nobody is trapped (every use of it offers a Menu/exit action),
but back silently doing nothing is inconsistent with the rest of the app.
It affects Puzzle and Quiz identically, so it belongs to a design-system
pass rather than a Tic-Tac-Toe one.

---

## Iteration 4 — the Skia coloring canvas

Four genuine bugs found and fixed; 49 suites / 694 tests green and
`npx tsc --noEmit` clean.

1. **A second fill tap erased the first one.** `handleCanvasTap` reads the
   pixel buffer out of `pixelsRef`, which — like every ref on this screen —
   is only refreshed from state during render. A flood fill on a real photo
   takes long enough that a second tap lands while the first is still being
   processed, and React Native then hands JS BOTH release events in one
   batch, before any re-render. The second tap therefore flooded the
   pre-first-fill buffer and its result replaced the first fill outright:
   the child taps two shapes and only the second one comes out colored —
   the exact stale-snapshot shape as iteration 3's Tic-Tac-Toe bug. Both
   refs now advance synchronously alongside the state, and `handleUndoFill`
   does the same for the mirror case (a fill batched behind an undo). The
   commit is also atomic now: if `Skia.Image.MakeImage` returns null there
   is nothing new to show, and adopting the updated buffer anyway left the
   pixel data permanently one fill ahead of the picture on screen, so every
   later tap flooded a region the child could not see. Regression test
   reproduces the batch in a single `act()` and was confirmed to fail
   without the fix.
2. **A repeat tap threw the undo point away.** Tapping a region that is
   already exactly the selected color cannot change a pixel — `floodFill`
   has an early exit for it — but the screen ran the whole pipeline anyway,
   including replacing its single undo snapshot with the post-fill state.
   A 2-8 year old taps the same shape over and over, so the common sequence
   was: fill the wrong shape, tap it again (nothing visibly happens), press
   Undo, get nothing back. `handleCanvasTap` now recognises the no-op up
   front via a new exported `pixelMatchesColorExactly` (literally the same
   condition `floodFill`'s early exit uses, so they cannot drift apart),
   which also saves a full-buffer copy plus a whole new SkImage per repeat
   tap — tens of megabytes of churn for zero visible change.
3. **A camera-sized parent photo could OOM-kill the app.** Coloring is the
   one activity a parent can point at their own pictures, and a phone shot
   is routinely 4000x3000. Nothing here worked on the encoded file:
   `readPixels` expanded whatever was decoded into a raw RGBA array (48 MB
   at that size) and every fill then allocated three more that size
   (floodFill's `slice()`, the `Skia.Data` copy, the resulting SkImage)
   while the undo snapshot deliberately held the previous pair alive — a
   quarter of a gigabyte of churn per tap on exactly the cheap low-RAM
   Android tablet a child gets handed, plus 12 million pixels to walk per
   fill, freezing the UI for seconds with no feedback. A decoded image whose
   longest side exceeds 1600 is now scaled down first (aspect ratio kept).
   1600 is comfortably above `CANVAS_MAX_SIZE` (900), so no displayable
   detail is lost even at maximum zoom, and it brings that photo to a
   ~7.7 MB buffer. Linear filtering, not the default nearest sampling —
   point-sampling a line drawing drops whole outline pixels and the fill
   would leak straight through the gaps. Every failure path falls back to
   the full-size image; a slow picture still beats an error screen.
4. **Turning the tablet around made the child paint in the wrong place.**
   Touches are read as pageX/pageY minus the touch area's measured window
   origin, refreshed only from that view's own `onLayout` — which fires on a
   frame change RELATIVE TO ITS PARENT. This screen is locked to LANDSCAPE
   in BOTH directions, so a 180-degree flip moves the notch to the other
   side: `insets.left`/`insets.right` swap, the background's padding swaps
   with them, the whole centered stack slides sideways by the cutout's
   width — but the touch area's inset SUM is unchanged, so its size and its
   offset within its centered parent are identical and no layout callback
   reaches it. The origin then stayed wrong for the rest of the session,
   every touch reading tens of pixels off. Re-measurement is now a shared
   callback, additionally driven by the centered container's `onLayout` (its
   frame genuinely does move) and by an effect keyed on window size and each
   inset, via rAF so the native layout pass lands first.

**Checked and found fine** (a real pass, not a shrug):

- **Flood fill.** Explicit stack, not recursion, so no stack-overflow risk
  regardless of region size; `visited` is a full-size `Uint8Array` so no
  pixel is filled twice; the bounds check happens on pop, before any buffer
  access, so no coordinate can read or write outside the array; an
  out-of-range seed reads `undefined`, matches nothing and fills nothing;
  the `<=` tolerance boundary is inclusive and tested; alpha is compared
  like any other channel; a uniform image filling entirely is correct
  behaviour, not a bug. The caller floors both coordinates and range-checks
  them before calling, so a fractional seed (which would silently fill
  nothing) can't reach it.
- **Palette.** Minimum max-channel distance between any two of the 17
  swatches is 32 — more than three times the flood fill's tolerance of 10 —
  so no two colors can be confused by the matcher or by a child's eye.
- **Multi-touch.** A second finger joining mid-stroke abandons the
  in-progress path rather than leaving a stray line, and re-baselines the
  pinch instead of applying pinch math against a stale one; a two-finger
  gesture ending never triggers a fill; per-frame (not per-gesture) pinch
  baselines mean error can't compound. The stroke-finishing null-path race
  fixed earlier is still correctly handled by the captured `finished` local.
- **Zoom/pan math.** `canvasTransform.ts`'s model, its clamp, and the
  top-left `transformOrigin` in the render still agree exactly; the
  screen-to-canvas inversion is guarded against a zero/non-finite scale.
- **base64 decoder.** Padding handling and the byte-length math are correct
  for well-formed input, and unknown characters can't push writes past the
  allocated buffer.

**Noted, not fixed (feature, not a bug):** there is no save/export at all —
a colored picture only lives in component state, so leaving the screen
discards it. Adding persistence is a feature with its own storage/privacy
design (where the copy goes, whether it's written back into the parent's
SAF folder), not something to bolt on inside a bug-hunt pass.

---

## Iteration 5 — the Photo Puzzle feature

Three genuine bugs found and fixed; 49 suites / 700 tests green and
`npx tsc --noEmit` clean.

1. **Two quick taps lost the child's move — the same stale-snapshot bug for
   the third time.** The puzzle is tap-to-swap (there is no drag), and
   `handleTapSlot` read BOTH `selectedSlot` and `order` out of the render its
   closure was created in. React Native delivers queued touch events in a
   BATCH, so a 2-8 year old tapping two pieces in quick succession ran both
   handlers against the same pre-update snapshot, in two distinct ways:
   (a) a pick-then-drop pair with nothing selected yet did NOTHING AT ALL —
   the second tap still saw `selectedSlot === null` and just moved the
   selection, so the child tapped two pieces and the board did not change;
   (b) a swap batched behind another swap rebuilt the board from the stale
   `order`, so the earlier swap was silently discarded and a piece the child
   had just moved jumped back. Selection now advances through a ref
   synchronously alongside the state, and the swap applies inside a
   functional `setOrder` updater that re-reads the latest board (with a
   bounds check, so a tap batched behind a Retry can't index off the end of a
   fresh order). `startPuzzle` clears the ref too. Both cases have regression
   tests reproducing the batch in a single `act()`, confirmed to fail before
   the fix. Exactly the shape of iteration 3's Tic-Tac-Toe and iteration 4's
   Coloring bugs — worth checking any remaining tap handler in the app for
   the same pattern.
2. **A corrupt photo produced a NaN layout value.** `Image.getSize` reports
   SUCCESS with degenerate dimensions (0x0, or a non-finite value) for a
   truncated/corrupt file, and the screen's `imageSize?.width ?? 1` guard did
   not catch it — `??` only replaces null/undefined, never `0`. The preview's
   `aspectRatio: imageWidth / imageHeight` then became `NaN`/`Infinity`,
   which is not a layout value RN can use, and `isPortrait` was decided on
   nonsense. `computePuzzleBoardSize` already guarded its own copy of this,
   so only two of the three consumers were protected; such a size now routes
   through the SAME square fallback the unreadable-photo path already uses.
3. **A failed difficulty read left an unhandled rejection.**
   `PuzzleGallery`'s load-on-mount `getPuzzleDifficulty()` had no `.catch`,
   unlike the matching fire-and-forget write right below it, so an
   AsyncStorage failure surfaced a dev warning/redbox over a gallery that
   would otherwise carry on perfectly well with the default difficulty.

**Checked and found fine** (a real pass, not a shrug):

- **Win detection across every difficulty.** All four offered piece counts
  are genuinely wired: `computeGridDimensions` covers 4/6/9/12 in both
  orientations, `rows * cols` always equals the piece count, and the existing
  suite already drives all eight (count, orientation) combinations through
  the real rendered tree. Completion is `order.every((p, i) => p === i)` on
  integer piece indices — no geometry, no floating point, and no "near a
  slot" tolerance anywhere — so the visual state and the win check cannot
  disagree in either direction. There is no drop-target/snap math to be
  off-by-one about: `slotIndex = rowIndex * cols + colIndex` is the only
  position arithmetic, and it is exact for non-square grids too.
- **Multi-touch.** Each slot is a plain `Pressable`; RN's responder system
  gives the touch to exactly one of them, so a second finger cannot start a
  parallel "drag" — the two-fingers case reduces to the batched-tap case
  fixed above. No piece can be duplicated or stuck mid-move because a piece's
  position is purely the `order` array, never a transient gesture state.
- **Retry/reshuffle.** `handleRetryPuzzle` goes through the exact same
  `startPuzzle` path as the initial setup, so it re-runs `shufflePieceOrder`
  (guaranteed non-identity, verified by the existing Math.random call-count
  test), clears the selection, and clears the correctness baseline so the new
  layout can't fire a stray celebratory pop. Nothing survives a retry: the
  per-slot `Animated.Value`s are keyed by slot and always settle at 1.
- **Difficulty wiring.** The chosen difficulty is passed as a navigation
  param at the moment the tile is tapped and is a required prop on
  `PuzzleScreen`, which shuffles once on mount — there is no async store read
  on the puzzle screen at all, so no race can hand it a stale value.
- **Extreme aspect ratios.** `computePuzzleBoardSize` never produces a
  negative or zero board (both axes are floored at `PUZZLE_MIN_SIZE` before
  the aspect fit, and the make-up scale is clamped to the space actually
  available), so a panorama or a very tall portrait lays out without error.

**Noted, not fixed (needs a design decision, not a bug fix):** an extreme
panorama (say 4000x200) legitimately produces a very short board, and at 12
pieces each piece can end up only ~10px tall — technically correct, but far
under a usable touch target for a small child. Capping the board's aspect
ratio (letterboxing the source photo) would fix it but changes what the
puzzle shows, which is a product decision rather than a correctness one.

---

## Iteration 6 — the Quiz feature

Three genuine bugs found and fixed; 49 suites / 710 tests green and
`npx tsc --noEmit` clean.

1. **One broken picture poisoned every later question's image.**
   `ImageWithFallback` remembered its failure in a plain boolean that nothing
   ever reset, and every one of its instances in `QuestionRenderer` survives a
   question change: the question image sits at a fixed position in the tree,
   and the option cards are keyed by `option.id` — which the real
   `questions.json` reuses as `'a'/'b'/'c'/'d'` on EVERY single question, so
   React reconciles them as the same component. The first unresolvable image
   therefore locked that slot into the grey 🖼️ placeholder for the rest of
   the session, and `resolveQuestionImages` deliberately leaves an
   unresolvable path in place for exactly this fallback to catch — so one
   missing file in the parent's `quiz/images/` folder was enough. On an
   image-category question (all of ages 2-4) that leaves a pre-reader being
   asked to choose between pictures they cannot see. The flag now records
   WHICH uri failed and is compared against the current one, so it clears
   itself the moment the source changes — no effect, no extra render pass.
   Two regression tests (question image and a repeated option id), both
   confirmed failing before the fix.
2. **An 8 year old — the app's own maximum age — got no quiz at all.**
   `AgePicker` offers 2-8, but every band in the shipped sample content was
   generated as a single year (`minAge === maxAge`, 2..7), and
   `filterQuestionsByAge` is inclusive on both ends. So a parent who picked
   the top age the app itself offers opened the Quiz tile and got the "no quiz
   questions yet" empty state, permanently, with nothing on screen explaining
   why — indistinguishable from missing content. The generator now leaves the
   topmost authored band open to the supported ceiling. Notably the per-minAge
   tally `validate-sample-quiz-content.js` printed looked perfectly healthy
   the entire time this was broken, so it now also checks eligibility across
   every SELECTABLE age using the real inclusive rule, and a test asserts the
   same against `AGE_OPTIONS` — newly exported so the range has one source of
   truth instead of two that can drift apart again.
3. **The Android back button did nothing while the answer overlay was up.**
   The feedback `Modal` was the only Modal in the app with no
   `onRequestClose`. RN's Modal always registers a back-press callback
   natively and dispatches the event to JS, so without the prop the press was
   captured by the modal's window and silently dropped — and since every
   activity screen is `headerShown: false`, back is the child's ONLY way out
   of the quiz. It now routes to the non-destructive retry (never `onNext`),
   which only clears the local selection on the same question and so can
   neither score nor skip it; the overlay closes and a second back press
   leaves the quiz normally.

**Checked and found fine** (a real pass, not a shrug):

- **The batched-tap stale-closure class** that iterations 3, 4 and 5 each hit
  independently is genuinely already closed here, in both places it could
  land: `QuestionRenderer`'s `answerLockRef` (reset during RENDER, not in an
  effect, so it can't swallow a legitimate first tap on a new question) covers
  a double-tap on two different options, and `QuizScreen`'s `nextFiredRef`
  plus a functional `setState(prev => answerCurrentQuestion(prev, ...))`
  covers Next. Both have existing regression tests driving the batch inside
  one `act()`.
- **Score/progress correctness.** Advancing is only ever possible through
  `handleNext`, which requires a non-null selection, so total-answered always
  equals questions-passed; `answerCurrentQuestion` is a pure function that
  scores exactly the question at `currentIndex` and no-ops once finished.
  "Try Again" never scores — it only clears the local selection — so a child
  replaying a question any number of times cannot inflate or deflate the score.
- **Auto-advance timing.** There is no timer-driven advance at all: the child
  must press Next. The celebration bubble and card/badge pop-ins are purely
  decorative, each bounded and cleaned up on unmount, and none of them gate or
  trigger navigation, so there is no window in which a tap can double-advance
  or answer a not-yet-rendered question.
- **Shuffle.** `shuffle.ts` is a genuine Fisher-Yates (descending `i`, `j`
  uniform in `[0, i]`), not a sort-with-random-comparator, so it is unbiased
  and cannot duplicate or drop an element; `buildSession` shuffles then slices,
  so a session can never repeat a question, and the shipped content has no
  duplicate question ids.
- **End-of-quiz state.** The empty-session case is checked BEFORE
  `isFinished`, so a zero-question session shows the empty state rather than a
  0/0 score card, and `hasRecordedThisFinishRef` excludes it from the activity
  log. Play Again calls a fresh `buildSession` (new shuffle and reselect from
  the retained pool) through `initialSessionState`, clears the selection, and
  re-arms its own double-press guard, so nothing survives into the new run.

**Noted, not fixed:** `QuizScreen`'s load effect resets `state` and
`errorKind` but not `selectedOptionId`. In principle a quiz folder or age
change mid-question would carry a stale selection into the first question of
the newly-loaded session; in practice both of those only change from Settings,
which is reachable only by popping the quiz screen off the stack (it unmounts),
so there is no path to it today.

---

## Iteration 7 — Settings, RootNavigator, Onboarding

Three genuine bugs found and fixed; 49 suites / 716 tests green and
`npx tsc --noEmit` clean.

1. **A declined folder move silently threw away every other edit.**
   Cancelling the "Move content?" confirmation `return`ed out of the whole
   of `handleSave`, so a name/age/language/picture change staged in the same
   visit was discarded with no toast, no error and no other sign that Save
   had done nothing — the exact "partial mix" this screen's staged-save
   design exists to avoid. Worse, `pendingFolderUri` was left set, so the
   folder card kept showing the newly-picked folder with a green tick as
   though the change HAD gone through: a parent who deliberately backed out
   of the move was told the opposite. Declining the move now declines only
   the move (pending pick cleared, card back in sync) and the rest of the
   save continues against the unchanged root. The migration-FAILURE path
   deliberately keeps its early return — finishing the save there would start
   the 1.2s saved-toast timer and navigate away from the error banner before
   a parent could read it.
2. **A double-tap on "Reset everything" queued a second wipe dialog over
   onboarding.** `handleReset`'s only guard was the `resetting` STATE, which
   does not engage until the next render and is not even set until the
   confirmation has been accepted — so two taps delivered in one touch batch
   (the same batched-tap shape iterations 3-6 kept finding, here reaching a
   destructive action) both got through and opened TWO confirmation dialogs.
   Confirming the first wipes the profile and unmounts Settings, leaving the
   second, still-live "Reset everything?" dialog sitting on top of the
   freshly-shown Onboarding screen, its destructive button still bound to the
   unmounted screen's `performReset`. A synchronous ref now allows at most one
   dialog (released again on cancel/dismiss so Reset stays usable), plus a
   second ref guarding the wipe itself against re-entrant clears.
3. **A blank screen between the splash and Home.** RootNavigator rendered
   `null` for the whole window between the profile resolving and the SAF
   subfolders resolving. That window is not instant on a device:
   `resolveSubfolderUris` runs `ensureContentStructure` (a dozen sequential
   SAF directory reads/creates plus first-run sample seeding) and then four
   more listings. So every cold start showed splash -> BLANK -> Home, which
   is exactly the flash `MINIMUM_SPLASH_DELAY_MS` exists to prevent, and
   saving a folder change from Settings blanked the entire app the same way
   mid-save. The same splash is now held up instead. Fixing that branch also
   closed a dead end sitting next to it: a saved profile whose
   `rootFolderUri` is null (the type allows it — "null until onboarding
   completes") satisfied the `profile ?` branch, resolved no folders and
   raised no error either, showing nothing at all forever with no way back
   short of a reinstall; it now lands on FolderErrorScreen, whose "Choose a
   different folder" writes a real root onto the existing profile.

**Checked and found fine** (a real pass, not a shrug):

- **Reset completeness.** The confirm dialog really is required (nothing
  destructive happens on the first tap), and the wipe covers the SAF
  `Kutta-games` folder, the profile, the activity log, the individually-added
  file references INCLUDING the app's own copies on disk (iteration 2's
  `clearAllFileReferences` deletes `documentDirectory/kutta-added/` too), and
  the remembered puzzle difficulty. Every folder step is best-effort so a
  revoked grant or an already-deleted folder can't strand a parent
  mid-reset.
- **Save double-tap.** `saveInFlightRef` is checked-and-set synchronously
  before any await, so a batched second tap cannot start a second save,
  duplicate a write, or orphan a second go-home timer; the freshest
  name/age/language/picture are re-read from refs immediately before
  persisting, so an edit made during a slow migration is not overwritten by
  the pre-Save snapshot.
- **Onboarding validation.** A blank or whitespace-only name is genuinely
  enforced, not cosmetic: `name.trim().length > 0` gates both the disabled
  Save button and `handleSave`'s own re-check, and age and folder are gated
  the same way. Save and the folder picker each have a synchronous
  re-entrancy ref. There is no back navigation out of onboarding (it renders
  outside the stack), and a failure part-way through leaves nothing saved —
  `ensureContentStructure` is idempotent, so retrying is clean.
- **The onboarding gate.** A fresh install (no profile) shows Onboarding, a
  returning profile skips it, a `getProfile()` REJECTION falls through to
  Onboarding rather than hanging on the splash, and a folder-resolution
  failure/rejection lands on the recoverable error screen rather than an
  unhandled rejection.
- **Migration safety.** `migrateContent` still copies, then verifies every
  entry of all four subfolders (plus `quiz/images` and `questions.json`), and
  only then deletes the old content; a concurrent second trigger is
  impossible (the Save button is disabled while migrating AND guarded by the
  in-flight ref), and an interrupted run leaves the old content fully intact
  since the delete never happens without a passing verification.

---

## Iteration 8 — the shared design system: CelebrationOverlay, Home, and a whole-tree back-button audit

Two genuine bugs found and fixed (one of them the item iteration 3 logged and
deliberately left); 49 suites / 723 tests green and `npx tsc --noEmit` clean.

1. **Android back did nothing on every activity's completion panel — and on
   Video it was a genuine dead end.** The shared `CelebrationOverlay`'s
   `Modal` had no `onRequestClose`. RN's Modal always registers a back-press
   callback natively and dispatches it to JS, so without the prop the press
   is captured by the modal's own window and silently dropped — the same
   mechanism iteration 6 fixed on Quiz's separate feedback modal. Every
   activity screen is `headerShown: false` (see RootNavigator), so back is
   the child's ONLY way out. Puzzle and Tic-Tac-Toe at least offered a
   visible exit button, so this was "inconsistent"; **Video was not**. Its
   panel's only action is "Watch Again", and `VideoPlayerScreen` has no
   `onMenu`/`onBack` prop at all — so a finished video trapped the child:
   watch again, finish, panel returns, forever, with the OS home button the
   only escape. That is the case iteration 3's "nobody is trapped" note
   missed, because Video adopted the overlay afterwards. Back now routes to
   each panel's own non-destructive exit — Puzzle to `onNext` (the gallery;
   deliberately NOT Retry, which would reshuffle the puzzle the child just
   solved), Tic-Tac-Toe to `onMenu` (exactly where "Change setup" goes), and
   Video to a plain dismiss so the panel closes and a second back leaves the
   player normally, matching the convention iteration 6 set. The prop is
   REQUIRED rather than optional, so a future host has to make that decision
   deliberately instead of inheriting a broken back button by omission —
   enforced by tsc, not by a comment.
2. **Two fingers could fire two DIFFERENT exits from one completion panel.**
   Adding back as a third exit made this obvious, but it predates it: each
   host's double-fire guards are per-BUTTON (Puzzle's `retryFiredRef` vs
   `nextFiredRef`, Tic-Tac-Toe's `retryFiredRef` vs `menuFiredRef`), so
   nothing stopped both from running. RN's responder system gives each
   concurrent touch its own view and delivers the queued events in ONE JS
   batch, so a 2-8 year old with a finger on "Play Again" and another on
   "Change setup" ran both against the same pre-update render: the board
   reset AND the screen popped back to setup, i.e. fresh state written into
   a screen already on its way out. (Iteration 3 checked those two refs and
   found them individually sound — which they are; the gap is that there are
   two of them.) One shared latch now lives in `CelebrationOverlay` itself,
   covering every action AND `onRequestClose`, so a presentation fires
   exactly one exit; it re-arms during RENDER whenever the panel is hidden
   (not in an effect, which would land a frame too late). Every host hides
   the panel in response to its actions, so it can't strand a live panel
   with dead buttons — covered by its own regression test. Same batched-tap
   class as iterations 3, 4, 5, 6 and 7, this time at the design-system
   layer rather than inside one activity.

**Global back-button audit.** Every `<Modal` in `src/` was checked: the six
are `CelebrationOverlay` (fixed above), `QuestionRenderer`'s feedback modal
(iteration 6), `PuzzleGallery`'s difficulty dropdown, `ProfilePicturePicker`,
`LanguageSelector` and `AgePicker`. All six now wire `onRequestClose`
sensibly; there are no deliberate exceptions left and no other Modal-like
surface (no `Portal`/`Dialog`, no `BackHandler` usage anywhere).

**Checked and found fine** (a real pass, not a shrug):

- **HomeScreen's navigation guards.** `navLockRef` is keyed per card plus a
  distinct `'settings-icon'` key, checked-and-set synchronously before
  `onNavigate`, re-armed by a timer that is itself tracked and cleared on
  unmount — so no stray timer outlives the instance that scheduled it.
- **HomeScreen's scroll-linked focus animation.** There is no "focused card"
  STATE at all — the scale/opacity are pure `scrollX.interpolate()` outputs
  on the native driver, so nothing can disagree with which card a tap hits:
  each card's `onPress` closes over its own `CardSpec`, never over an index
  derived from the scroll position. The interpolation peaks exactly at the
  `snapToInterval` snap points (both derive from the same
  `CARD_WIDTH + CARD_GAP` step), and the transform is applied to a wrapper
  whose hit box RN maps touches through correctly, so a tap during a fling
  navigates to the card actually under the finger.
- **Dropdown/picker races.** Two option rows tapped in one batch on
  `AgePicker`/`LanguageSelector`/the puzzle difficulty dropdown run both
  `onChange`es, but each is a plain staged `setState` and the last one wins,
  so the value shown always matches the option the parent touched last —
  no corruption and nothing to reconcile. `ProfilePicturePicker` already
  guards selection (`selectingRef`) and "Browse anywhere" (`browsingRef`,
  which also refuses to open while a selection is in flight), and
  `AddFilesButton`'s `inFlightRef` still blocks a second native picker.
- **Gallery tile double-taps.** Not the same risk as Home's cards: the
  galleries navigate via `navigation.navigate` (not `push`) to a detail
  route, so a repeat dispatch for a route already on top updates its params
  rather than stacking a second copy of the screen.
- **The rest of the shared design system.** `AnimatedPressable`/`RaisedCard`
  keep the outer-Pressable/inner-Animated.View split, so a tilt transform
  can never distort a hit box; `useTiltPress` stops its in-flight spring on
  unmount and resets defensively when a control becomes disabled;
  `GradientScreenBackground`'s decorative blobs are all `pointerEvents="none"`
  so they can't intercept a tap.
