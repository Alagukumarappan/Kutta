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

### Iteration 9 — Visual Consistency: ColoringScreen's error state now matches every other error state
**Area:** Visual Consistency.

**Problem:** `ColoringScreen.tsx`'s `imageLoadFailed` error state rendered
a bare `View`+`Text` with inline styles — the one visibly inconsistent
error screen left in the app, now that `FolderErrorScreen`, `QuizScreen`,
the 3 galleries, and `VideoPlayerScreen` had all converged on a
`RaisedCard`+`RaisedPrimaryButton` pattern in earlier polish/quality
passes.

**Fix:** Wrapped the same existing text/retry-button in a `RaisedCard`,
using `VideoPlayerScreen.tsx`'s equivalent as the direct reference (same
`elevationLevel="level3"`, same `errorCardOuter`/`errorCardInner`/
`errorTitle` style shapes, moved from inline styles into the file's
existing `StyleSheet.create` block). No testID, i18n key, retry wiring, or
button props changed — purely a visual wrapper around identical content
and behavior.

**Caught and fixed during review:** the first version placed the
`errorCardOuter` style on the plain outer `View` instead of on the
`RaisedCard` itself, unlike every reference screen (which apply that style
directly to the card). Visually equivalent by coincidence (the outer
View's `alignItems:'center'` plus RaisedCard's default `alignItems:'stretch'`
happened to produce the same layout), but structurally inconsistent with
the established pattern, and it meant the accompanying regression test
was verifying "a style constant survived" rather than "RaisedCard is
actually used" — it would have still passed with RaisedCard removed and
the style left on a bare View. Fixed by moving the style onto the
`RaisedCard` (now the pattern matches exactly) and giving the `RaisedCard`
its own testID so the test queries it directly, which cannot pass unless
the card is genuinely rendered.

**Tests:** 1 new test in `__tests__/coloring/ColoringScreen.test.tsx`
("wraps the error message in a real styled card, not a bare unstyled
layout"), re-verified via `git stash` to genuinely fail without the fix —
first with a style-based assertion (passed coincidentally due to the
placement bug above, caught by review), then re-verified after the fix
with the corrected testID-based assertion (fails with "Unable to find
element," not just a missing style, once the fix is reverted). Full
suite: 624/624 passing. `npx tsc --noEmit` clean. Reviewed by an
independent agent — found the real style-placement issue described above
(alongside iteration 5's double-tap race, one of the two genuine
review-caught issues this loop has fixed so far, versus most reviews
finding the change already sound as submitted).

### Iteration 10 — Bug fix: HomeScreen's settings icon had no double-tap guard
**Area:** Bug Hunting.

**Problem:** `HomeScreen.tsx`'s `handleCardPress` guards every activity
card against a rapid double-tap via a `navLockRef` (keyed per-card,
re-armed 800ms later) — but the settings gear icon called
`onNavigate('settings')` directly with no guard at all. Since Home stays
mounted underneath a pushed screen (React Navigation's native stack, per
this file's own existing comment on why cards need the guard), a rapid
double-tap on the gear could push Settings twice, the exact same risk
class already handled for cards but missed for this one control.

**Fix:** Added `handleSettingsPress`, reusing the SAME `navLockRef`/
`rearmTimeoutsRef` refs with a new key (`'settings-icon'`, verified
distinct from every card's own `'home-card-*'`-prefixed testID) — same
guard-and-rearm shape as `handleCardPress`, so the settings icon's re-arm
timer is cleaned up on unmount identically to card timers.

**Deliberately NOT done:** extracting a shared `guardedNavigate(key,
destination)` helper for `handleCardPress`/`handleSettingsPress` — flagged
by review as a legitimate but marginal call for only 2 near-identical
sites; same judgment already applied to the tracked (and still deferred)
HomeScreen/TicTacToeSetupScreen nav-debounce duplication in "Remaining
opportunities" below. Also not done: enforcing the key-uniqueness
guarantee at the type level (`CardSpec.testID` stays a plain `string`) —
today's 5 cards all follow the `'home-card-*'` convention with no actual
collision, and adding an enforcement mechanism for a currently-hypothetical
future mistake would be complexity spent on a problem that doesn't exist
yet.

**Tests:** 2 new tests in `__tests__/home/HomeScreen.test.tsx` (double-tap
on the settings icon is blocked; a card press right after doesn't get
blocked by the settings icon's own lock, proving the guard is per-control).
Verified to genuinely fail without the fix via `git stash` ("Expected: 1,
Received: 2"). Full suite: 626/626 passing. `npx tsc --noEmit` clean.
Reviewed by an independent agent, which caught one small but real
documentation bug: the new code comment claimed the reused lock key was
`'settings'` when the code actually used `'settings-icon'` — fixed before
committing.

### Iteration 11 — Bug fix: QuestionRenderer could silently overwrite a child's answer on a rapid double-tap
**Area:** Bug Hunting.

**Problem:** `QuestionRenderer.tsx`'s answer grid disables each option via
`disabled={hasAnswered}`, where `hasAnswered` is derived from the
`selectedOptionId` PROP (owned by the parent, `QuizScreen`). That
`disabled` only takes effect once the parent re-renders after
`onSelect`'s `setSelectedOptionId` — so two taps landing on two DIFFERENT
options before that commit both called `onSelect`, and since
`setSelectedOptionId` has no dedup logic, the LAST call silently won,
changing the child's actual answer to whichever option happened to
process second, with zero correction UI. Not a scoring bug (scoring only
happens in `handleNext`), but a real, untested UX edge case exactly
matching the kind of "child mashes the screen" scenario this loop's Bug
Hunting mandate targets.

**Fix:** Added an `answerLockRef`, checked-and-set synchronously inside
the option's `onPress` before calling `onSelect` — same idiom as this
codebase's other double-fire guards.

**Caught and fixed during review (second genuine finding this iteration,
third across the loop):** the ref's reset-back-to-unlocked logic was
initially placed in a `useEffect` keyed on `hasAnswered`. Effects run
AFTER commit, which reopened the exact same class of bug in the other
direction: right after a new question loads or "Try Again" clears the
answer, `disabled={false}` commits and the Pressable becomes tappable
again, but the ref hadn't been reset yet in that same render — a
genuinely new, legitimate tap landing in that narrow window would be
silently swallowed (visually the button would still tilt on press-in, but
`onSelect` would never fire), requiring a confusing second tap. Fixed by
mutating the ref directly in the render body instead (`if (!hasAnswered &&
answerLockRef.current) answerLockRef.current = false;`) — the standard
React "adjust a ref during rendering" pattern — so the ref and `disabled`
update in the exact same synchronous pass and can never disagree.

**Tests:** 1 new test in `__tests__/quiz/QuestionRenderer.test.tsx`
("guards against a rapid tap on two different options, only calling
onSelect once"), verified via `git stash` to genuinely fail without the
fix ("Expected: 1, Received: 2"). Confirmed distinct (not redundant) from
the pre-existing "does not call onSelect again once an option has already
been answered" test, which exercises `disabled` via a real prop update,
never reaching the new ref path at all. The `useEffect`-timing bug itself
wasn't given its own dedicated test — reproducing it deterministically
would require racing a real React effect-flush boundary, which this
project's synchronous jsdom/test-renderer test environment can't
meaningfully simulate (the same category of gap `git stash`-based
verification exists to catch for logic bugs, but doesn't apply cleanly to
a render-vs-effect timing bug); the fix itself follows React's own
documented pattern and the full suite (traced through both the "new
question" and "Try Again" reset paths) stayed green throughout. Full
suite: 627/627 passing. `npx tsc --noEmit` clean.

### Iteration 12 — Bug fix: VideoPlayerScreen showed no feedback while a video was still loading
**Area:** Bug Hunting.

**Problem:** `VideoPlayerScreen.tsx`'s `statusChange` listener only ever
reacted to `'error'` — between mount and the player actually becoming
ready (e.g. a large file on slow SAF-backed storage), a child just saw an
empty frame with no feedback that anything was happening, unlike every
other async-load screen in the app (all 3 galleries, `QuizScreen`,
`ColoringScreen`), which show an explicit spinner.

**Fix:** Added a `loading` state (`useState(true)`, since the player
begins loading immediately on mount), driven by the same `statusChange`
listener (`'idle'`/`'loading'` count as still-loading; only
`'readyToPlay'` clears it, and an error clears it via the existing error
branch instead). `handleRetry` also re-sets `loading` to `true`, since
replacing the source re-triggers the same load sequence. Renders the
existing shared `LoadingPanel` (same component every gallery already
uses) between the error and normal-player branches.

**Caught and fixed during review (a genuine mount-time race, the fourth
real issue this review step has caught across the loop):** `useVideoPlayer`
creates the player and calls `play()` SYNCHRONOUSLY, before
`VideoPlayerScreen`'s own effect ever subscribes to `statusChange` — so a
real player's status can already have settled (e.g. a small/cached local
file reaching `'readyToPlay'` almost immediately) by the time that
subscription happens. Since a status only transitions once, missing that
first change would leave `loading` stuck `true` forever with no later
event ever arriving to clear it. Fixed by also reading the player's own
synchronous `status` getter once, up front, when the effect first
subscribes — not just listening for future changes.

**Also bundled (trivial, unrelated):** fixed a stale comment in
`TicTacToeScreen.tsx` that claimed a "200ms pacing" figure for
`COMPUTER_MOVE_DELAY_MS`, which is actually `500`. Pure comment fix, no
logic change, verified via the full `__tests__/tictactoe` suite passing
unmodified.

**Tests:** Because nearly every existing test in
`__tests__/video/VideoPlayerScreen.test.tsx` previously assumed the video
view renders immediately with no status event ever needing to fire, most
were updated to call a new `emitReady()` helper before asserting
`video-view` is present — confirmed each still exercises its original
intent (not weakened into tautological). Added 4 new tests: a basic
loading-then-ready test, an `'idle'`-specifically-still-loading test, and
2 tests for the mount-race fix (player already settled to `readyToPlay`
or `error` before the screen ever subscribes, with NO `statusChange` event
emitted at all). All new tests verified via manual revert-and-rerun to
genuinely fail without their respective fixes (the 2 race tests
specifically: "Unable to find element" for `video-view`/`video-player-error`
respectively, both stuck showing the spinner instead, when the
`player.status` seed line is removed). Full suite: 631/631 passing. `npx
tsc --noEmit` clean.

### Iteration 13 — Bug fix: SettingsScreen had no name validation, unlike OnboardingScreen
**Area:** Bug Hunting.

**Problem:** `SettingsScreen.tsx`'s `handleSave` had no name validation at
all — unlike `OnboardingScreen.tsx`, which disables its Save button
entirely until the name is non-blank. A parent clearing the name field to
blank (or whitespace-only) and hitting Save would silently persist an
empty name, which would break `HomeScreen`'s "Hi, {name}" greeting and the
profile-picture initial-letter fallback (both assume a non-empty name).
Found via a fresh research pass over `SettingsScreen.tsx`'s remaining
flows, comparing its validation against `OnboardingScreen`'s equivalent
(already-tested) behavior.

**Fix:** Added a check at the top of `handleSave` — a blank/whitespace-only
name shows an `Alert.alert(t('onboardingNameMissing'))` (reusing the
existing i18n string rather than adding a new one) and blocks the save,
matching this screen's own established convention of surfacing failures
via `Alert.alert` (there was no pre-existing inline-field-error style here
to extend, unlike Onboarding's). Also now trims the name before persisting.

**Tests:** 3 new tests in `__tests__/settings/SettingsScreen.test.tsx`
(blocks on blank, blocks on whitespace-only — not just empty, trims
leading/trailing whitespace before saving), verified via `git stash` to
genuinely fail without the fix. Full suite: 634/634 passing. `npx tsc
--noEmit` clean. Reviewed by an independent agent — no issues found
(confirmed the guard is placed before `saveInFlightRef` is set so a
blocked save can't permanently lock out future valid saves, confirmed no
stale-closure risk, confirmed the single-argument `Alert.alert(message)`
call shape matches this codebase's existing convention elsewhere; flagged
one minor, accepted UX note — a name saved with trailing whitespace will
visibly "snap" to its trimmed form in the text field after Save, matching
Onboarding's equivalent behavior).

### Iteration 14 — Bug fix: SettingsScreen's "Change content folder" had no double-tap guard
**Area:** Bug Hunting.

**Problem:** `handlePickFolder` had no re-entrancy guard at all — a rapid
double-tap on "Change content folder" could fire two concurrent
`requestFolderAccess()` calls whose resolved uris could land out of order
via `setPendingFolderUri`. This is the third time this exact bug class has
been found and fixed in this codebase (`FolderErrorScreen`'s recovery
picker, iteration 5; `OnboardingScreen`'s picker, iteration 8), both
reusing the same `requestFolderAccess()` primitive.

**Fix:** Added a synchronous `pickingFolderRef` check-and-set guard, same
shape as the two prior fixes.

**Tests:** 1 new test in `__tests__/settings/SettingsScreen.test.tsx`
("guards 'Change content folder' against a rapid double-tap, only picking
once"), verified via `git stash` to genuinely fail without the fix
("Expected: 1, Received: 2"). Full suite: 635/635 passing. `npx tsc
--noEmit` clean. Reviewed by an independent agent — no issues found
(walked every exit path to confirm the guard can never get stuck, checked
for interaction with the pre-existing `saveInFlightRef` guard in the same
file, confirmed no fourth unguarded async action remains in this file).

### Iteration 15 — Visual Consistency / Accessibility: SettingsScreen's Pressables gained real accessibility labels
**Area:** Visual Consistency (Accessibility).

**Problem:** `SettingsScreen.tsx`'s own Pressables (Change-folder,
Choose-picture, Remove-picture, Save, Reset) previously had only
`testID`+style, no `accessibilityRole`/`accessibilityLabel` — unlike the
rest of the app's convention (every button in `VideoGallery.tsx`,
`AgePicker.tsx`, `LanguageSelector.tsx`, `FolderErrorScreen`, and the
other galleries explicitly sets both). A screen-reader user had no way to
tell what these 5 controls were or that they were tappable.

**Fix:** Added `accessibilityRole="button"` and `accessibilityLabel={t('...')}`
to all 5, reusing each button's own existing visible-text i18n key as the
label (matching the established pattern already used everywhere else in
the app — no new strings needed, and every one of these 5 buttons already
has clear, unambiguous visible text worth reusing directly).

**Tests:** 2 new tests in `__tests__/settings/SettingsScreen.test.tsx`
(Save/Reset/Change-folder; Choose-picture/Remove-picture, the latter
needing a profile with a `pictureUri` set so the Remove button renders at
all), verified via `git stash` to genuinely fail without the fix
("Expected: 'button', Received: undefined"). Full suite: 637/637 passing.
`npx tsc --noEmit` clean. Reviewed by an independent agent — no issues
found (confirmed all 5 Pressables in the file were covered with none
missed, confirmed each label matches its own button's semantic action
against `strings.ts` with none cross-wired, confirmed no interaction with
the existing `disabled`-state handling on Save/Reset, confirmed the
pictureUri mock in the new test doesn't leak into sibling tests via the
shared `beforeEach`).

### Iteration 16 — Bug fix: SettingsScreen could silently discard an edit made during an in-flight migration
**Area:** Bug Hunting. This is the most subtle fix in the loop so far — required two full review passes, the first of which caught a genuine, self-introduced regression before it shipped.

**Problem:** `handleSave` built its `nextProfile` to persist from a SNAPSHOT
of `profile`/`age` captured before two potentially-slow `await`s
(`confirmMigration()` — a real Alert button press; `migrateContent()` — a
real file copy). If a parent edited name/age/language/picture WHILE either
await was pending, `handleSave`'s already-running closure kept referencing
the stale snapshot, so the final `setProfile(nextProfile)` silently
overwrote the parent's newer edit — the exact gap flagged (but not yet
fixed) in iteration 13's research.

**Fix (first pass):** Added `latestProfileRef`/`latestAgeRef`, kept in
sync via `useEffect`s, and read those refs right before building the final
`nextProfile` instead of the original closure values — but deliberately
NOT for the folder-migration decision itself (`pendingFolderUri` stays
pinned to the snapshot from when Save was pressed, so a later folder pick
mid-migration can't retroactively redirect a migration already running).

**Regression caught by review, then fixed:** the first pass ALSO
re-validated the fresh name for blankness right before the final save — but
by that point, a successful migration may have already irreversibly
happened (`migrateContent` deletes the OLD folder's content once its copy
is verified, confirmed in iteration 7's investigation). Blocking
persistence at that point over a blank name would leave the profile
pointing at now-deleted content with no way back — a brand-new, more
severe bug than the one being fixed. Fixed by never blocking persistence
of a completed migration: if the name went blank mid-flight, it silently
falls back to the last-known-valid name (the one that already passed the
top-of-function guard) instead of aborting — matching this codebase's
established "best-effort, never block core functionality on a secondary
concern" convention (`activityLog.ts`, `fileReferenceStore.ts`).

**Tests:** 4 new tests in `__tests__/settings/SettingsScreen.test.tsx`: a
valid mid-flight name edit is preserved (verified via `git stash` to
genuinely fail without the fix), a mid-flight blank-name edit still lets
the migration result save (falls back to the old name — verified by
temporarily reintroducing JUST the regressed version of the code, showing
`saveProfile` is called 0 times without this specific piece), and a
combined name-blank+age-edit test proving the name fallback doesn't
accidentally also revert the fresh age edit. Full suite: 640/640 passing.
`npx tsc --noEmit` clean. Reviewed by an independent agent TWICE — the
first pass found the migration-orphaning regression described above
(this loop's 5th genuine review-caught issue); the second, follow-up pass
after the fix gave a clean bill of health and suggested the age/language
combination test, which was added.

### Iteration 17 — Visual Consistency: ProfilePicturePicker's loading state was a blank box
**Area:** Visual Consistency.

**Problem:** `ProfilePicturePicker.tsx`'s loading state rendered a totally
blank `<View testID="profile-picture-picker-loading" style={styles.stateBox} />`
— no spinner, no text, no accessibility signal — while every other
async-load screen/component in the app (galleries, QuizScreen,
ColoringScreen) uses the shared `LoadingPanel`. This modal was added after
those other screens converged on `LoadingPanel` and was missed. On a slow
SAF read it looked broken/frozen with zero feedback, sighted or
screen-reader.

**Fix:** Wrapped `LoadingPanel` inside that same `View`, using
`color={colors.parent.accent}` (matching every other colored element
already in this file — this modal uses the calmer "parent" register) and
`message={t('galleryLoading')}` (reused, same as `VideoPlayerScreen`'s
equivalent fix in iteration 12).

**Investigated, accepted as-is (no code change):** review flagged that
`LoadingPanel`'s internal `flex: 1` has no sized flex-container ancestor
here to grow into (unlike the gallery reference usage, which wraps it in
a `flex: 1` screen-level container) — Yoga falls back to content-based
sizing, so the spinner won't collapse or render invisible, just sit
closer to the empty/error states' layout rather than centered in a full
screen region. Cosmetic only, and this modal's bounded card container was
never going to match a full-screen layout anyway, so no fix needed.

**Tests:** 1 new test in `__tests__/settings/ProfilePicturePicker.test.tsx`
("shows a real loading spinner (not a blank box) while the folder is
still being read"), verified via `git stash` to genuinely fail without
the fix (times out looking for the loading message). Full suite: 641/641
passing. `npx tsc --noEmit` clean. Reviewed by an independent agent — no
blocking issues found (confirmed the color/string choices match this
file's own established convention, confirmed the never-resolving test
promise doesn't leak or cause act() warnings, confirmed no other blank
state remains in this file).

### Iteration 18 — Bug fix: TicTacToeSetupScreen's friend-name field had no length cap
**Area:** Bug Hunting.

**Problem:** `TicTacToeSetupScreen.tsx`'s friend-name `TextInput` had no
`maxLength`. That name is later rendered centered and unbounded on
`TicTacToeScreen.tsx`'s `statusText` and the shared `CelebrationOverlay`'s
completion title — neither of which truncates or scrolls. An arbitrarily
long name could wrap across many lines on a short, landscape-locked
phone screen and push the board or completion actions out of view — the
same class of layout break this screen's own compact-redesign fix
(session-start iteration) was written to prevent.

**Fix:** Added `maxLength={20}` to the input for the native-level UX cue.

**Caught and fixed during review (6th genuine review-caught issue):**
RN's `maxLength` prop only enforces truncation at the native widget level
for direct typing — it doesn't clamp the JS-side `onChangeText` argument
itself, and real Android IME paths (predictive-text/batch-insert) have
historically been able to bypass native `maxLength` entirely. Without a
JS-side clamp, `friendName` state itself had no actual guarantee of
staying ≤20 characters. Fixed by adding `handleFriendNameChange`, which
slices the string to `FRIEND_NAME_MAX_LENGTH` before calling
`setFriendName` — the real guarantee, with `maxLength` as the matching
native-level nicety on top.

**Explicitly investigated, not fixed (correctly scoped out):** the SAME
unbounded-render risk exists for the child's OWN name (`profile.name`,
editable in Onboarding/Settings, also flows through `childName` into
`TicTacToeScreen`'s `statusText`/`CelebrationOverlay` render paths) — this
fix is the first (and still only) length cap anywhere in the codebase,
so it establishes a pattern rather than following one, and only covers
half of the two names that hit this render surface. Left for a future
iteration rather than scope-creeping this one.

**Tests:** 2 new tests in `__tests__/tictactoe/TicTacToeSetupScreen.test.tsx`
— one confirming the `maxLength` prop, and one (added after review) that
proves the ACTUAL clamp by firing a 50-character `changeText` (which RNTL
delivers to `onChangeText` in full, bypassing any native-level
truncation) and checking `onStart` receives exactly 20 characters. Both
verified via manual revert-and-rerun to genuinely fail without their
respective fixes. Full suite: 643/643 passing. `npx tsc --noEmit` clean.

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
- Iteration 10: HomeScreen's settings icon had no double-tap guard, unlike every activity card. See above.
- Iteration 11: QuestionRenderer could silently overwrite a child's answer on a rapid double-tap between two different options. See above.
- Iteration 12: VideoPlayerScreen showed no feedback while a video was still loading, and could get stuck loading forever if the player settled before the screen subscribed. See above.
- Iteration 13: SettingsScreen had no name validation, letting a parent silently persist an empty name. See above.
- Iteration 14: SettingsScreen's "Change content folder" had no double-tap guard, the third time this exact bug class has been found and fixed in this codebase. See above.
- Iteration 16: SettingsScreen could silently discard a name/age/language/picture edit made during an in-flight migration. See above.
- Iteration 18: TicTacToeSetupScreen's friend-name field had no length cap, risking layout overflow on the next screen. See above.

## Consistency improvements
- Iteration 9: ColoringScreen's error state now uses the same RaisedCard+RaisedPrimaryButton pattern every other error state in the app converged on. See above.
- Iteration 15: SettingsScreen's own Pressables gained accessibilityRole/accessibilityLabel, matching the rest of the app's convention. See above.
- Iteration 17: ProfilePicturePicker's loading state now uses the shared LoadingPanel instead of a blank box. See above.

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
- **Architecture (S, from iteration 7's research pass, lower priority —
  only 2 copies exist):** `HomeScreen.tsx` and `TicTacToeSetupScreen.tsx`
  each hand-roll a near-identical "debounce rapid navigation taps"
  ref+`setTimeout` pattern (`navLockRef`/`rearmTimeoutRef` —
  `TicTacToeSetupScreen`'s own comment cross-references `HomeScreen`'s
  version). Worth a small `useNavLock()` hook if a third copy ever appears;
  marginal value for just 2.
- **Bug Hunting (M, from iteration 17's research pass, not yet done):**
  `src/design-system/CelebrationOverlay.tsx` — shared by Puzzle, Quiz, and
  TicTacToe's completion moment — has no `accessibilityViewIsModal` on its
  `Modal`, and its title `Text` has no `accessibilityRole="alert"`/
  `accessibilityLiveRegion`. A screen-reader user isn't notified the
  completion dialog appeared at all. Fixing here helps every activity's
  win screen at once, since it's the shared component — higher leverage
  than a per-screen fix, worth its own careful iteration given it's a
  widely-shared component (unlike the smaller isolated fixes so far).
- **Bug Hunting (S, from iteration 18's research, not yet done):** the
  SAME unbounded-render risk fixed for the friend name in iteration 18
  still exists for the child's OWN name (`profile.name`, editable in
  Onboarding/Settings) — it flows through `childName` into the exact same
  `TicTacToeScreen` `statusText`/`CelebrationOverlay` render paths, with
  no length cap anywhere it's set. Lower urgency than the friend name
  (typically shorter, chosen once at onboarding rather than per-game), but
  the same fix pattern would apply directly.

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
