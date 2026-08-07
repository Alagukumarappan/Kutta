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

**Iteration count: 4 / 40**

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
