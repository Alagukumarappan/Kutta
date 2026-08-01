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

## Architecture improvements
- Iteration 4: `useSelectableGallery` hook, deduping Coloring/Puzzle/Video
  galleries' load+selection logic. See above.

## Gamification improvements
- Iteration 3: local, offline "activities completed" counter (quizzes +
  puzzles) with a small, hideable-at-zero summary in Settings. See above.

## Bugs fixed
- Iteration 1: corrupted `questions.json` silently indistinguishable from an empty quiz folder (see above).

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

## Technical debt removed
(none yet this pass)

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
