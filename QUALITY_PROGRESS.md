# Quality Evolution — Progress Log

Branch: `quality-evolution` (never merged/pushed automatically — for manual review).

Scope is deliberately narrow: every iteration is ONE focused improvement in
exactly one of Gamification, Bug Hunting, Visual Consistency, or
Architecture. No redesigns, no new dependencies, no `app.json`/`android/`/
`ios/` changes. See `REDESIGN_PROGRESS.md` and `POLISH_PROGRESS.md` at the
repo root for the two prior iteration passes this one continues from —
their "remaining opportunities" sections were the starting point for this
loop's research.

## Completed improvements

### Iteration 1 — Bug fix: corrupted `questions.json` was indistinguishable from "no quiz yet"
**Area:** Bug Hunting.

**Problem:** `loadQuestions()` resolved to `[]` both when a quiz folder
genuinely had no `questions.json` at all, AND when `questions.json` existed
but was corrupt (invalid JSON, or valid JSON missing its `questions` array
entirely — e.g. a child edited it, or a parent's export/copy tool crashed
mid-write). Both cases rendered the exact same generic "No quiz questions
for this age yet." text, so a parent had no signal that anything was wrong
with the file itself.

**Fix:** `src/quiz/loadQuestions.ts` now throws a new `QuestionsFileCorruptError`
from `loadQuestions()` specifically for those two corruption cases (a
separate `assertQuestionsFileWellFormed` check, not a change to the
existing pure `parseQuestionsFile` validator — that function's simple
"never throws" contract is directly covered by its own unit tests and used
elsewhere, so its shape was left untouched). `src/quiz/QuizScreen.tsx`
replaced its old plain `error: boolean` state with `errorKind: 'generic' |
'corrupt' | null`, showing a new, more actionable message
(`quizFileCorrupt` in `src/i18n/strings.ts`, EN+DE) only for the corrupt
case, while every existing generic-failure behavior (SAF grant revoked,
folder deleted externally) is unchanged.

**Explicitly NOT treated as "corrupt":** valid JSON with a `questions`
array where every entry fails per-question validation (bad `correctOptionId`,
wrong option count, inverted age range, etc.) — that's ambiguous, ordinary
content that could legitimately yield zero eligible questions (e.g. all
filtered by the child's age), so it still resolves to `[]` and the plain
empty state, exactly as before.

**Tests:** 3 new tests in `__tests__/quiz/loadQuestions.test.ts` (throws on
bad JSON, throws on missing `questions` array, does NOT throw when JSON is
valid but every question is invalid) and 1 new test in
`__tests__/quiz/QuizScreen.test.tsx` (shows the distinct message, not the
generic or empty-state text). All 4 verified to genuinely fail without the
fix via `git stash`. Full suite: 595/595 passing. `npx tsc --noEmit` clean.
Reviewed by an independent agent before commit — no issues found beyond a
noted, accepted tradeoff (the corruption check duplicates two of
`parseQuestionsFile`'s early-return conditions rather than sharing code
with it, to avoid changing that function's contract; flagged for future
maintainers to keep both in sync if the schema ever changes).

### Iteration 3 — Gamification: first local, offline "accomplishments" counter
**Area:** Gamification.

**Problem:** No achievement/reward/progress-persistence mechanism existed
anywhere in the app — confirmed by grepping for achievement/badge/streak/
reward/milestone across `src/`. The only related thing was QuizScreen's
own per-session, non-persisted star emoji, which resets every time the
screen is left. Nothing recognized a child's accumulated effort across
sessions.

**What was added:** `src/storage/activityLog.ts` — a small AsyncStorage-backed
counter (`quizzesCompleted`, `puzzlesCompleted`), mirroring the existing
tiny `profileStore.ts` in shape and error-handling style (corrupt/missing
storage recovers to zero rather than crashing, since this is a purely
decorative feature that must never block core functionality). Wired in
with the smallest possible footprint:
- `QuizScreen.tsx` calls `recordQuizCompleted()` once per genuine quiz
  finish (a rising-edge guard on `state.isFinished`, explicitly excluding
  the "0 eligible questions" empty-state case, which is also technically
  `isFinished` but isn't a real play).
- `PuzzleScreen.tsx` calls `recordPuzzleCompleted()` once per genuine solve
  (same rising-edge guard pattern on `isSolved`).
- `SettingsScreen.tsx` shows a small "Accomplishments" summary line (e.g.
  "3 quizzes completed • 5 puzzles completed") — hidden entirely at zero,
  so a brand-new profile isn't shown a discouraging "0 of everything"
  message. "Reset everything" now also calls `clearActivityLog()`
  alongside the existing `clearProfile()`, so a reset is a genuine fresh
  start for the next profile.

**Explicitly NOT done (deliberately, to keep scope minimal):** Coloring and
Video have no natural "finished" signal to hook (open-ended fills,
re-watchable playback) — consistent with the existing
`POLISH_PROGRESS.md` note on why Coloring has no completion celebration —
so they are not counted here. No streaks, timers, leaderboards, or
push-style nudges — per this loop's own "no manipulative engagement"
mandate, this is a quiet, always-optional summary a parent can glance at,
not a mechanic the child is steered toward.

**Tests:** 6 new tests in `__tests__/storage/activityLog.test.ts`
(increment/read/clear/corrupt-recovery), 3 new tests in
`__tests__/quiz/QuizScreen.test.tsx` (records once on finish, does NOT
record for the empty-state screen, records again after Play Again), 2 new
tests in `__tests__/puzzle/PuzzleScreen.test.tsx` (records once on solve,
records again after Retry+re-solve), 3 new tests in
`__tests__/settings/SettingsScreen.test.tsx` (reset clears the log, summary
hidden at zero, summary shown with correct counts). Also added `removeItem`
to the shared `__mocks__/@react-native-async-storage/async-storage.ts` mock
— a pre-existing gap (`clearProfile` had called the real `removeItem` since
day one but no test had ever exercised it against this shared mock; every
test touching `clearProfile` mocked the whole `profileStore` module
instead). Verified the whole feature is genuinely new (not dead code) via
`git stash`: all 4 new/changed test suites fail to even resolve the
`activityLog` module without these changes. Full suite: 609/609 passing.
`npx tsc --noEmit` clean. Reviewed by an independent agent — no issues
found (checked for double-counting races in both screens' rising-edge
guards, the `increment()` read-then-write pattern's theoretical-but-
unreachable lost-update risk, and gamification tone/no-shaming
compliance).

### Iteration 4 — Architecture: extract `useSelectableGallery`, dedup the 3 galleries
**Area:** Architecture.

**Problem:** `ColoringGallery.tsx`, `PuzzleGallery.tsx`, and `VideoGallery.tsx`
each independently implemented an identical ~90-line state machine: load a
folder's contents (merged with individually-"+"-added file references via
`pruneMissingFileReferences`), a retry token, and a full
long-press-to-multi-select-and-remove flow (toggle/cancel/
remove-with-confirm via `removeGalleryItems`). The only genuine differences
between the three copies were the `FileReferenceContentType` string
('coloring'/'puzzle'/'video') and the file-extension filter predicate. Any
future selection-flow bug would have needed the same fix applied three
times, with an easy chance of the copies drifting.

**Fix:** Extracted `useSelectableGallery(folderUri, contentType,
isValidFile)` into `src/components/useSelectableGallery.ts` — a single
shared hook the three galleries now consume. `PuzzleGallery.tsx` correctly
keeps its own difficulty-picker state (`difficulty`,
`difficultyModalVisible`, the `getPuzzleDifficulty`/`savePuzzleDifficulty`
effect) local, since that part is genuinely puzzle-only, not shared.

**Verified behavior-preserving, not just "should be":** every pre-existing
test in `ColoringGallery.test.tsx`, `PuzzleGallery.test.tsx`, and
`VideoGallery.test.tsx` passed **unmodified** after the refactor — not one
test file needed a single change. That's the strongest possible evidence
this was a pure extraction with zero behavior change, not a rewrite.
Net line count actually dropped despite adding a new, well-commented file:
1435 lines (583+420+432) before → 1296 lines (490+327+339+140) after.

**Tests:** 9 new tests in `__tests__/components/useSelectableGallery.test.ts`
covering the hook in isolation (load+merge+dedup, error/retry, selection
toggle/auto-exit-on-empty, remove-with-confirm threading the right
`contentType` through, remove-failure error message, no-op when nothing
selected). Full suite: 618/618 passing. `npx tsc --noEmit` clean. Reviewed
by an independent agent — no issues found (checked the `isValidFile`
dependency-omission safety, that Puzzle's difficulty state was correctly
NOT extracted, no leftover `setRetryToken`/dead imports, and that the
`renderHook`/`act` async patterns in the new test file are used correctly
— this RTL version's `renderHook` is itself `async`, which caused a real
1000ms timeout during development until every state-changing call was
wrapped in `await act(async () => ...)` instead of a plain sync `act()`).

### Iteration 5 — Bug fix: FolderErrorScreen's Retry was a dead end for a permanently-revoked SAF grant
**Area:** Bug Hunting.

**Problem:** `RootNavigator.tsx`'s `FolderErrorScreen` (the app's one truly
global error screen — reached whenever the SAF content folders can't be
resolved) only offered a "Retry" button, which re-resolves against the
EXACT SAME `profile.rootFolderUri`. If the SAF grant is permanently gone
(the parent revoked storage permission in Android settings, uninstalled a
file manager that held it, the SD card was replaced, etc. — not a transient
failure Retry can self-heal), every retry fails identically forever. There
was no way to reach Settings' own folder-repicker either, since `AppStack`
(which hosts Settings) never mounts while this error screen is showing —
a genuine dead end requiring the parent to fully uninstall/reinstall the
app to recover, silently losing the child's profile in the process.

**Fix:** Added a second action, "Choose a different folder", which calls
`requestFolderAccess()` (the same primitive Settings/Onboarding already
use), then `saveProfile({ ...profile, rootFolderUri: newUri })` — updating
just the folder while preserving every other profile field (name, age,
language, picture) — then triggers a refresh that re-resolves against the
new folder. Cancelling the picker (`requestFolderAccess()` resolves `null`)
is correctly a silent no-op, matching `SettingsScreen`'s own equivalent
handling. Guarded against a rapid double-tap with a synchronous
check-and-set ref (same idiom as `SettingsScreen`'s `saveInFlightRef` /
`PuzzleScreen`'s `retryFiredRef`) — an independent review caught that the
initial version relied only on `disabled={picking}` state, which doesn't
take effect until the next render and so wouldn't have actually blocked a
fast second tap.

**Tests:** 3 new tests in `__tests__/navigation/RootNavigator.test.tsx`:
full recovery to Home with the profile's other fields preserved, cancel
is a no-op (fixed after review to correctly await the async handler's
pending microtask before asserting, rather than checking immediately after
`fireEvent.press` — the earlier version could have passed even if a future
regression called `saveProfile` unconditionally), and the double-tap guard
(confirmed to genuinely fail without the ref fix — temporarily reverted
just the guard, reran, restored). Full suite: 621/621 passing. `npx tsc
--noEmit` clean.

### Iteration 6 — Architecture: remove genuinely dead code found while investigating a Visual Consistency candidate
**Area:** Architecture / Technical debt (started as a Visual Consistency investigation).

**Starting point:** the plan was to migrate `src/components/{AgePicker,LanguageSelector,AddFilesButton,EmptyState,PieceCountPicker}.tsx`
and `src/splash/SplashScreen.tsx` off the OLD `src/theme/tokens.ts` palette
onto `src/design-system/`, per a candidate flagged in an earlier research
pass. Investigating each file's actual color usage first (rather than
mechanically swapping imports) found this is NOT a safe mechanical
refactor: the old palette's `colors.ink` (`#2D3142`) isn't even the same
hex as the new design-system's `colors.ink` (`#241B3A`), and several old
colors used directly (`coral`, `mint`, `pink`, `periwinkle`, `sun`) have NO
equivalent at all in the new palette — closing this gap for real would mean
picking new colors for every one of those usages, which is genuine visual
redesign work on live, high-traffic screens (Onboarding, Settings, all 3
galleries) that this loop's own "do not redesign the UI from scratch" rule
correctly forbids doing autonomously, and that can't be verified without a
real device. **Deferred, not done** — see Remaining opportunities below.

**What the investigation actually found:** two of the six flagged files —
`src/components/EmptyState.tsx` and `src/components/PieceCountPicker.tsx`
— are genuinely dead code. A repo-wide grep confirmed zero imports from any
live screen or component for either; the three galleries that once used
`EmptyState.tsx` had already migrated to a different, still-live component
(`src/design-system/EmptyStatePanel.tsx`) in an earlier redesign pass,
leaving the old one orphaned with a now-stale comment inside
`EmptyStatePanel.tsx` still claiming it "is still used." `PieceCountPicker.tsx`
had already been flagged as dead in `POLISH_PROGRESS.md` (iteration 13 of
a prior loop) but was never actually deleted.

**Fix:** Deleted `src/components/EmptyState.tsx`,
`src/components/PieceCountPicker.tsx`, their now-pointless test file
`__tests__/components/EmptyState.test.tsx`, and the now-orphaned
`puzzlePickPieces` i18n string (was `PieceCountPicker.tsx`'s only caller —
caught by an independent review, not by my own initial pass). Corrected
`EmptyStatePanel.tsx`'s stale comment to describe the current (not
year-old) state.

**Why the removed test doesn't count as "reduced test coverage":** the
code under test no longer exists after this diff — there is nothing left
to cover. The live replacement, `EmptyStatePanel`, already has its own
separate, still-present test file
(`__tests__/design-system/EmptyStatePanel.test.tsx`), unaffected by this
change.

**Tests:** none new (pure deletion). Full suite: 618/618 passing (down
from 621 only because the 3 tests for now-nonexistent code were removed
alongside it — every other test unaffected). `npx tsc --noEmit` clean
(confirms nothing else in the codebase referenced either deleted file).
Reviewed by an independent agent, which re-confirmed the dead-code claim
via its own grep, confirmed no documentation contradicts the deletion, and
caught the orphaned `puzzlePickPieces` string that my own pass missed.

### Iteration 7 — Bug fix: "Reset everything" left cross-profile data behind
**Area:** Bug Hunting.

**Problem:** `src/storage/fileReferenceStore.ts` (individually-"+"-added
file references per gallery — coloring/puzzle/video) and
`src/storage/puzzleDifficultyStore.ts` (remembered puzzle difficulty) are
both keyed globally in AsyncStorage, not scoped to any one child profile
(the app only ever has one profile at a time). Settings' "Reset
everything" flow already cleared `profileStore` and `activityLog`, but
never these two — so a fresh profile created right after a reset would
silently inherit the PREVIOUS child's individually-added files and puzzle
difficulty setting instead of a genuine fresh start. Confirmed via a grep
across every `src/storage/*.ts` file that these were the only two
AsyncStorage-backed stores `performReset()` had missed.

**Fix:** Added `clearAllFileReferences()` (clears all 3 content types in
one call, so a caller can't accidentally clear only one) and
`clearPuzzleDifficulty()`, both called from `performReset()` alongside the
existing `clearProfile()`/`clearActivityLog()` calls.

**Tests:** 2 new tests in `__tests__/storage/fileReferenceStore.test.ts`
(clears every content type, doesn't throw when already empty), 1 new test
in `__tests__/storage/puzzleDifficultyStore.test.ts` (resets to default),
1 new test in `__tests__/settings/SettingsScreen.test.tsx` (both new
functions are actually invoked from the reset flow). All 4 verified to
genuinely fail without the fix via `git stash` ("is not a function" —
confirms these are brand-new exports, not a tautological test). Full
suite: 622/622 passing. `npx tsc --noEmit` clean. Reviewed by an
independent agent — no issues found (checked the unguarded `Promise.all`
in `clearAllFileReferences` against this codebase's existing pattern of
only wrapping genuinely-fallible SAF/filesystem calls in `.catch()`, not
AsyncStorage writes; re-confirmed no other globally-keyed store was
missed; confirmed the sequential `await`s in `performReset` can't race
with `onReset?.()`).

### Iteration 8 — Bug fix: OnboardingScreen's "Choose content folder" had no double-tap guard
**Area:** Bug Hunting.

**Problem:** `handlePickFolder` — the "Choose content folder" button
handler on this app's very first onboarding screen — had NO re-entrancy
guard at all, unlike the neighboring `handleSave` (already guarded with a
`savingRef`, added in an earlier polish pass) and `FolderErrorScreen`'s own
folder-repicker (guarded with `pickingRef` in iteration 5, reusing this
exact same `requestFolderAccess()` primitive). A rapid double-tap — trivial
for a child, and this is the very first screen anyone interacts with —
could fire two concurrent `requestFolderAccess()` calls whose resolved
URIs could land out of order via `setFolderUri`, leaving the wrong folder
selected.

**Fix:** Added a synchronous `pickingFolderRef` check-and-set guard,
mirroring `savingRef`'s exact shape in the same file. Named distinctly
from `RootNavigator.tsx`'s bare `pickingRef` since this file also has a
profile-*picture* picker, where a bare `pickingRef` would be ambiguous.

**Tests:** 1 new test in `__tests__/onboarding/OnboardingScreen.test.tsx`
("guards 'Choose content folder' against a rapid double-tap, only picking
once"), mirroring the existing Save double-tap test's structure. Verified
to genuinely fail without the fix via `git stash` ("Expected number of
calls: 1, Received number of calls: 2"). Full suite: 623/623 passing.
`npx tsc --noEmit` clean. Reviewed by an independent agent — no issues
found (walked every exit path of `handlePickFolder` to confirm the guard
can never get stuck permanently `true`, confirmed no other unguarded async
handler remains in this file, confirmed the new test's cleanup doesn't
leak a pending promise into a later test).

## Architecture improvements
- Iteration 4: `useSelectableGallery` hook, deduping Coloring/Puzzle/Video
  galleries' load+selection logic. See above.
- Iteration 6: removed two genuinely dead components (`EmptyState.tsx`,
  `PieceCountPicker.tsx`) and an orphaned i18n string. See above.

## Gamification improvements
- Iteration 3: local, offline "activities completed" counter (quizzes +
  puzzles) with a small, hideable-at-zero summary in Settings. See above.

## Bugs fixed
- Iteration 1: corrupted `questions.json` silently indistinguishable from an empty quiz folder. See above.
- Iteration 5: `FolderErrorScreen`'s Retry was a dead end for a permanently-revoked SAF grant — no way back to Settings' folder picker. See above.
- Iteration 7: "Reset everything" left individually-added file references and puzzle difficulty behind for the next profile. See above.
- Iteration 8: OnboardingScreen's "Choose content folder" had no double-tap guard, unlike its neighboring Save button. See above.

## Consistency improvements
(none yet this pass)

## Remaining opportunities
(from the initial research pass; two candidates below were investigated in
iteration 2's planning and found NOT to be real issues — see "Review notes";
the gallery-hook Architecture candidate was completed in iteration 4)
- **Gamification (S, follow-up to iteration 3 — DONE, see above):** the
  activity-log counter now exists (quiz+puzzle only). A natural next step,
  once there's a sense the current summary is useful, would be a manual
  "I'm done!" button for Coloring, giving it a genuine completion signal
  without guessing at one — needs real design thought (see
  `POLISH_PROGRESS.md`'s existing note on the same topic), not a quick
  reuse of the puzzle/quiz pattern.
- ~~**Visual Consistency**: hardcoded radius literals~~ — investigated in
  iteration 2 planning and ruled out (every literal checked was a genuine
  circle radius = exactly half its element's diameter, not token drift).
  See "Review notes" below.
- **Visual Consistency (M, DEFERRED — needs a human/visual pass, not an
  autonomous iteration):** `src/components/{AgePicker,LanguageSelector,
  AddFilesButton}.tsx` and `src/splash/SplashScreen.tsx` still import from
  the OLD `src/theme/tokens.ts` palette instead of `src/design-system/`.
  (The other two files originally flagged here — `EmptyState.tsx`,
  `PieceCountPicker.tsx` — turned out to be dead code and were removed in
  iteration 6 instead; see above.) This is a REAL gap, but migrating it
  properly requires picking new colors for several values with no
  equivalent in the new palette (`coral`, `mint`, `pink`, `periwinkle`,
  `sun`) and verifying the result on a real device/screenshot — genuine
  visual redesign work, not a mechanical import swap, and out of scope for
  an autonomous "no redesign" iteration.
- **Visual Consistency (S, from iteration 7's research pass, not yet
  done):** `ColoringScreen.tsx`'s `imageLoadFailed` error state renders a
  bare `View`+`Text` (no `RaisedCard` wrapper) — the one visibly
  inconsistent error screen left, now that `FolderErrorScreen`, `QuizScreen`,
  the 3 galleries, and `VideoPlayerScreen` have all converged on the
  RaisedCard+RaisedPrimaryButton pattern.
- **Architecture (S, from iteration 7's research pass, lower priority —
  only 2 copies exist):** `HomeScreen.tsx` and `TicTacToeSetupScreen.tsx`
  each hand-roll a near-identical "debounce rapid navigation taps"
  ref+`setTimeout` pattern (`navLockRef`/`rearmTimeoutRef` —
  `TicTacToeSetupScreen`'s own comment cross-references `HomeScreen`'s
  version). Worth a small `useNavLock()` hook if a third copy ever appears;
  marginal value for just 2.

## Technical debt removed
- Iteration 6: `src/components/EmptyState.tsx` (superseded by
  `src/design-system/EmptyStatePanel.tsx`, orphaned since all 3 galleries
  migrated away from it in an earlier redesign pass) and
  `src/components/PieceCountPicker.tsx` (dead since a prior loop,
  flagged then but never removed), plus the `puzzlePickPieces` i18n string
  that was `PieceCountPicker.tsx`'s only caller.

## Review notes
- Iteration 1's review agent confirmed the fix is real (regression tests
  fail without it), the new `errorKind` state resets correctly on every
  retry/reload, and the automocked-class `instanceof` test pattern used in
  `QuizScreen.test.tsx` is sound (both the test and the screen import the
  same automocked module reference, so `instanceof` holds by construction).
- **Investigated, no code change (iteration 2 planning):** the research
  pass's "hardcoded radius" candidate (`OnboardingScreen.tsx`'s
  `borderRadius: 22`, plus similar literals in `EmptyState.tsx`,
  `PieceCountPicker.tsx`, `SettingsScreen.tsx`, `ColoringScreen.tsx`,
  `HomeScreen.tsx`, `QuestionRenderer.tsx`, and the 3 gallery components)
  was checked value-by-value against its paired `width`/`height`. Every
  single one is exactly half its element's diameter (22=44/2, 13=26/2,
  7=14/2, 100=200/2, etc.) — i.e. genuine circle radii, not card-corner
  values that drifted from the `radii` token scale. Using a `radii.*` token
  here would be actively wrong (it would desync from the element's own
  size the moment either changed), so this is not a real inconsistency.
- **Investigated, no code change (iteration 2 planning):** the research
  pass's "`folderMigration.ts` has no in-flight/re-entrancy guard against a
  double-tap-triggered migration" candidate. The guard already exists one
  layer up — `SettingsScreen.tsx` disables its Save button for the whole
  duration of an in-flight migration, and
  `__tests__/settings/SettingsScreen.test.tsx`'s "disables the Save button
  while a migration is in progress, preventing a double submit" test
  already exercises exactly this: a second press while migrating does not
  call `migrateContent` again. No genuine gap found.
- **Iteration 6's review agent** independently re-confirmed the dead-code
  claim (its own repo-wide grep, not just trusting mine), confirmed no
  documentation contradicts the deletion, confirmed the removed test
  doesn't count as a real coverage loss, and caught a genuinely missed
  follow-up (the orphaned `puzzlePickPieces` i18n string) that I fixed
  before committing.
