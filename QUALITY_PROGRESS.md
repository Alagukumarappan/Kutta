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

## Architecture improvements
(none yet this pass)

## Gamification improvements
(none yet this pass)

## Bugs fixed
- Iteration 1: corrupted `questions.json` silently indistinguishable from an empty quiz folder (see above).

## Consistency improvements
(none yet this pass)

## Remaining opportunities
(from the initial research pass, not yet started)
- **Architecture (L):** `PuzzleGallery.tsx`, `ColoringGallery.tsx`, and
  `VideoGallery.tsx` each independently implement an almost-identical
  selection/removal/reload state machine (`images`/`videos`, `error`,
  `retryToken`, `selectionMode`, `selectedUris`, `removing`, and handlers
  `toggleSelected`/`handleLongPress`/`handleCancelSelection`/
  `handleRemoveSelected`). A shared `useSelectableGallery` hook would cut
  ~150-200 duplicated lines and centralize future selection-bug fixes.
  Large — worth splitting into its own iteration(s), extracted only if it
  genuinely simplifies all three call sites without behavior change.
- **Bug Hunting (S-M):** `folderMigration.ts`'s `migrateContent` copy loop
  has no in-flight/idempotency guard — double-triggering migration (e.g. a
  child mashing the folder-change button) or a same-named-file collision in
  the destination folder is unverified/untested. Worth a race-condition
  regression test plus a guard if a real gap is confirmed.
- **Gamification (M):** No achievement/reward/progress-persistence
  mechanism exists anywhere in the app (grepped — nothing beyond
  QuizScreen's own non-persisted per-session star emoji). A small, local
  `src/storage/activityLog.ts` (mirroring the existing tiny `profileStore.ts`)
  tracking a simple completed-activities counter could be a clean, low-risk
  first hook point for a badge/celebration variant — without touching
  existing screens' core logic beyond one increment call per completion
  callback.
- **Visual Consistency (S per file, M in aggregate):** a handful of
  hardcoded spacing/radius literals exist alongside the design-system
  tokens instead of using them — e.g. `OnboardingScreen.tsx`'s
  `borderRadius: 22` doesn't match any documented radius step in
  `src/design-system/tokens.ts`; similar scattered literals were spotted in
  `EmptyState.tsx`, `PieceCountPicker.tsx`, and the three gallery
  components. Worth a full audit-and-standardize sweep.

## Technical debt removed
(none yet this pass)

## Review notes
- Iteration 1's review agent confirmed the fix is real (regression tests
  fail without it), the new `errorKind` state resets correctly on every
  retry/reload, and the automocked-class `instanceof` test pattern used in
  `QuizScreen.test.tsx` is sound (both the test and the screen import the
  same automocked module reference, so `instanceof` holds by construction).
