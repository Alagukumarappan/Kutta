# Overnight Improvement Progress

## Current Status
- Phase: 1 (baseline verification + inventory), Iteration: 4
- Latest completed improvement: added 1 test to
  `__tests__/storage/folderMigration.test.ts` covering the sibling-folder
  prefix boundary case ("Kutta" vs "KuttaBackup") of `isSameOrNestedWithin`
  in `src/storage/folderMigration.ts`. No production code changed — the new
  test passed against the existing implementation unmodified on first run,
  and was manually verified to fail for the right reason (temporarily
  reverted the boundary-char fix to a naive `startsWith`, confirmed the test
  failed as expected, then restored the original file exactly).
- Test status: 22/22 suites passing, 149/149 tests passing (was 22/22 suites,
  148/148 tests before this iteration's added test).
- tsc status: `npx tsc --noEmit` — clean, no errors.
- Java: default `java -version` on this machine is JDK 25 (Temurin). Repo pins
  Java 17 via `.sdkmanrc` (`java=17.0.15-amzn`) for the Android/Gradle build.
  This iteration did not touch Android/Gradle so `sdk env` was not needed
  (`sdk` shell function isn't loaded by default — iteration 1 sourced
  `~/.sdkman/bin/sdkman-init.sh` first). Future iterations should do the same
  before any Android-build-related work (not needed for `tsc`/`jest`, which
  run fine under either JDK).

## Completed
1. **Baseline verification** (no code changes): confirmed `npx tsc --noEmit`
   is clean and `npm test -- --runInBand` passes 21/21 suites, 137/137 tests
   on the pre-existing codebase (commit at branch creation, see `git log`).
2. **Pure-logic module inventory** (see below) — for future iterations to pick
   edge-case tests from.
3. **loop: add floodFill early-return edge-case tests**
   - Files: `__tests__/coloring/floodFill.test.ts` (test-only change)
   - Tests added:
     - "returns an unchanged copy when the tapped pixel already matches the
       fill color (no-op re-tap)" — exercises the `targetMatchesFill` early
       exit in `src/coloring/floodFill.ts` (line ~25-30), asserting the
       result is pixel-identical to input but is a distinct array (still
       copies, doesn't return the same reference).
     - "starting flood fill from a pixel already matching the target region
       border color still fills correctly" — starts the fill exactly on a
       border pixel already the target color, confirms it does not leak into
       neighboring regions.
   - Behavior change: none — both tests pass against the existing
     implementation unmodified. Pure coverage addition for an
     already-correct-but-previously-untested code path (relevant for child
     UX/performance: rapid repeated taps on an already-filled region should
     be cheap no-ops, not a full grid traversal).
   - Commit: see `git log` on `overnight-improvements` branch, message
     `loop: add floodFill early-return edge-case tests`.
4. **loop: add folderPathDisplay coverage** (iteration 2)
   - Files: `__tests__/storage/folderPathDisplay.test.ts` (new file,
     test-only change; no production code modified)
   - Tests added (7 total) for `toReadableFolderPath` in
     `src/storage/folderPathDisplay.ts`:
     - primary volume happy path → "Internal storage / Kutta / Content"
     - non-primary volume (SD card id) passthrough as-is (not relabeled)
     - malformed percent-encoding (`decodeURIComponent` throws) → falls back
       to the raw, un-decoded input string
     - no `/tree/` marker present at all *and* no volume colon either →
       still produces a readable, slash-joined path from the whole string
     - path after the volume colon is empty → shows just the volume label
       ("Internal storage") with no trailing separator
     - fully empty input string → returns the empty string unchanged
       (documents the "no usable segments" fallback branch)
     - accidental doubled slashes in the encoded path collapse to single
       " / " separators (the `.filter(Boolean)` on split segments)
   - All 7 tests passed on first run against the unmodified implementation —
     manually hand-traced each expected value against the function's actual
     decode → tree-marker-split → colon-split → filter → join logic before
     writing assertions, and a code-review subagent independently re-traced
     all 7 and confirmed none were coincidentally passing for the wrong
     reason. No bug found in `toReadableFolderPath`; this was pure coverage
     addition for a previously fully-untested module.
   - One review nit addressed: reworded a test description that overclaimed
     it exercised colon-splitting when the example URI actually had no colon
     at all (now says "...and no volume colon either").
   - Commit: see `git log` on `overnight-improvements` branch, message
     `loop: add folderPathDisplay coverage`.

5. **loop: add quizSession 0-eligible-questions coverage** (iteration 3)
   - Files: `__tests__/quiz/quizSession.test.ts` (test-only change; no
     production code modified)
   - Checked first: the "fewer than 20 eligible questions" case recommended
     by iteration 2's `Next` note was already covered by the existing test
     "uses all eligible questions when fewer than 20 exist" — so only the
     "0 eligible questions" gap remained and was targeted instead.
   - Tests added (2 total):
     - `buildSession`: "returns an empty session when no question is
       eligible for the given age" — 5 questions with `minAge/maxAge` 6-8,
       queried at age 2 (genuinely fails the range filter, not just an empty
       input array), asserts the resulting session has length 0. This closes
       a gap the pre-existing "excludes questions outside the age range"
       test left open (that test only asserts a property over whatever
       remains, which is vacuously true on an empty result).
     - reducer: "marks isFinished true immediately when the session has 0
       questions" — calls `initialSessionState([])` directly, asserts
       `isFinished: true` with `currentIndex`/`score` still at their zero
       defaults. No prior test exercised the `session.length === 0` branch
       of `initialSessionState`.
   - Both tests passed on first run against the unmodified implementation —
     confirms no bug in the empty-session boundary logic. Pure coverage
     addition. A code-review subagent independently re-traced both tests
     against `filterQuestionsByAge`'s age-range check and
     `initialSessionState`'s ternary, confirmed both are non-tautological and
     exercise the intended branches, and approved with no required fixes
     (one optional style nit about the exact out-of-range age value used,
     not applied — the chosen value already unambiguously fails the range
     check).
   - Commit: see `git log` on `overnight-improvements` branch, message
     `loop: add quizSession 0-eligible-questions coverage`.

6. **loop: add folderMigration sibling-prefix boundary coverage** (iteration 4)
   - Files: `__tests__/storage/folderMigration.test.ts` (test-only change;
     no production code modified)
   - Checked first: iteration 3's `Next` note's top recommendation
     (`computePuzzleBoardSize`'s "insets exceed window entirely" boundary)
     was assessed and judged already adequately covered — see Technical
     Decisions below for why — so the documented fallback was used instead:
     `folderMigration.ts`'s `isSameOrNestedWithin` sibling-prefix boundary
     case. Confirmed the exact "primary:" volume-root boundary case was
     already covered by an existing test
     ("refuses to migrate...whole-storage grant..."), but the *other*
     documented gap — sibling folders where one name is a textual prefix of
     another (e.g. "Kutta" vs "KuttaBackup") should NOT be treated as
     nested — had no test anywhere in the file.
   - Test added (1): "does NOT treat a sibling folder whose name is a prefix
     of another as nested (e.g. \"Kutta\" vs \"KuttaBackup\")" — builds two
     sibling SAF tree URIs (`primary:Kutta`, `primary:KuttaBackup`) with a
     full parallel folder tree for both, asserts `migrateContent` succeeds
     and `copyAsync` is called (i.e. the migration is NOT wrongly blocked as
     "nested").
   - TDD-verified: temporarily replaced `isSameOrNestedWithin`'s
     boundary-character check with a naive `candidate.startsWith(ancestor)`
     to confirm the new test fails for the intended reason (migration
     incorrectly blocked as nested) — it did, then the production file was
     restored exactly (`git diff --stat` showed no change to the production
     file afterward). The test passes against the real, unmodified
     implementation. No bug found — pure coverage addition, closing the last
     documented gap in `isSameOrNestedWithin`.
   - A code-review subagent independently reviewed the diff: approved with
     no required changes. It confirmed the test is non-tautological, doesn't
     overlap existing nesting tests, and correctly exercises the
     boundary-char logic; it also noted the check is only exercised in one
     direction (KuttaBackup-as-candidate) but judged this adequate since the
     underlying check is symmetric.
   - Commit: see `git log` on `overnight-improvements` branch, message
     `loop: add folderMigration sibling-prefix boundary coverage`.

## Pure-Logic Module Inventory (for future iterations)
Modules with pure/mostly-pure logic, current test coverage, and possible gaps:

| Module | Purpose | Existing tests | Possible future edge cases |
|---|---|---|---|
| `src/coloring/floodFill.ts` | Flood-fill fill algorithm on RGBA buffer | `__tests__/coloring/floodFill.test.ts` (6 tests after this iteration) | out-of-range `startX`/`startY` (negative or >= width/height) passed as the initial seed before the loop begins — currently only guarded inside the stack loop, not at entry; tolerance boundary (`tolerance` exactly matching a diff); 1x1 image; fully-filled image (no border) |
| `src/coloring/base64.ts` | Dependency-free base64 decoder | `__tests__/coloring/base64.test.ts` | invalid/malformed base64 input (non-multiple-of-4 length without padding), empty string, whitespace-only input |
| `src/coloring/palette.ts` | Static color palette data | none (pure data, no logic) | n/a — could add a smoke test asserting no duplicate `fill` values and valid RGBA ranges |
| `src/puzzle/puzzleGrid.ts` | Board sizing, grid dimensions, piece rects, row grouping, shuffle-with-guaranteed-non-identity | `__tests__/puzzle/puzzleGrid.test.ts` | `computePuzzleBoardSize`'s "insets exceed window entirely" case assessed in iteration 4: judged equivalent in code-path terms to the existing "floors to the minimum size when the window is very small" test (both exercise the same `Math.max(..., PUZZLE_MIN_SIZE)` clamp on a negative pre-floor value — the only difference is whether the negative comes from a small window or from oversized insets, which is not a distinct branch); not treated as a real gap. Remaining real gaps: `shufflePieceOrder` with `pieceCount` of exactly 2 (only 2 possible permutations, guaranteed-non-identity swap logic); `groupPiecesIntoRows` with `items.length` not evenly divisible by `cols` |
| `src/quiz/filterQuestions.ts` | Age-range filter | `__tests__/quiz/filterQuestions.test.ts` | already well covered (in-range, boundary-inclusive, empty-result) |
| `src/quiz/loadQuestions.ts` | JSON parsing/validation of `questions.json`, image URI resolution | `__tests__/quiz/loadQuestions.test.ts` | duplicate option IDs (partially covered per `isValidQuestion`'s Set-size check — verify test exists); `minAge > maxAge` rejection; question with neither `text` nor `image`; option `text` present but missing one language key |
| `src/quiz/quizSession.ts` | Session building (shuffle + slice to 20), score/finish state machine | `__tests__/quiz/quizSession.test.ts` (10 tests as of iteration 3) — now covers fewer-than-20-eligible, 0-eligible, already-finished no-op, and normal score/advance paths | well covered now; no further gaps identified in this module |
| `src/quiz/shuffle.ts` | Fisher-Yates shuffle | `__tests__/quiz/shuffle.test.ts` | empty array, single-element array, custom deterministic `rng` producing a known permutation |
| `src/storage/folderAccess.ts` | SAF folder helpers: `leafNameOf`, `findChildUri`, `ensureContentStructure` | `__tests__/storage/folderAccess.test.ts` | `leafNameOf` with unencoded/partially-encoded URI, trailing slash, no slash at all |
| `src/storage/folderMigration.ts` | Copy+verify+delete folder migration, `isSameOrNestedWithin` same/nested detection | `__tests__/storage/folderMigration.test.ts` (10 tests as of iteration 4) — covers same-folder, real nesting both directions, the `primary:` volume-root boundary, and (as of iteration 4) the sibling-prefix-name non-nested case | well covered now; no further gaps identified in this module |
| `src/storage/folderPathDisplay.ts` | SAF URI → human-readable path | `__tests__/storage/folderPathDisplay.test.ts` (7 tests, added iteration 2) — covers primary/non-primary volumes, malformed encoding, missing `/tree/` marker, empty path after volume, fully empty input, doubled-slash collapsing | well covered now; could add a Windows-style/UNC-ish edge case if one is ever reported, but not a known real-world SAF shape |
| `src/storage/profileStore.ts` | AsyncStorage get/save profile with JSON parse guard | `__tests__/storage/profileStore.test.ts` | corrupted/non-JSON stored value (should return `null`, not throw) — verify covered |
| `src/types/*.ts` | Type-only, no runtime logic | n/a | n/a |
| `src/i18n/strings.ts` | Bilingual string dictionary | `__tests__/i18n/strings.test.ts` | probably fine as-is; could check every key has both `en`/`de` present if not already asserted |

**Highest-value gap identified (resolved iteration 2):** `src/storage/folderPathDisplay.ts`
had zero dedicated tests; now has 7 covering all documented fallback paths.
No remaining zero-coverage pure-logic modules found in the inventory table
above as of iteration 2. As of iteration 3, `src/quiz/quizSession.ts` is also
fully covered (its previously-listed gaps are closed). As of iteration 4,
`src/storage/folderMigration.ts` is also fully covered (the sibling-prefix
gap is closed; the `primary:` boundary gap was already covered before this
iteration).

## Next
Iteration 5 priority: `src/puzzle/puzzleGrid.ts`'s `shufflePieceOrder` with
`pieceCount` of exactly 2 — only 2 possible permutations exist for 2
elements, so `shuffle`'s output is either the identity or its single swap;
worth confirming the guaranteed-non-identity fallback (swapping the first
two elements when `shuffle` returns identity) is exercised and that the
result is always `[1, 0]` for `pieceCount === 2` regardless of which branch
fires. First read `__tests__/puzzle/puzzleGrid.test.ts`'s existing
`shufflePieceOrder` tests to confirm this exact case isn't already covered.
If it is, fall back to `groupPiecesIntoRows` with `items.length` not evenly
divisible by `cols` (last remaining item in the inventory table above), or
the `src/coloring/floodFill.ts` out-of-range seed / tolerance-boundary /
1x1-image cases, or `src/coloring/base64.ts` malformed-input cases, or
`src/quiz/loadQuestions.ts`'s `minAge > maxAge` rejection and
missing-both-text-and-image rejection.

## Visual Review Required
None this iteration — no UI or behavior changes were made, only test-file
additions covering existing (unchanged) logic.

## Documentation or Implementation Mismatches
None found that affect correctness. Notes:
- README's "Running the tests" section says `npm test` "should show all
  suites passing" — confirmed true (21/21) both before and after this
  iteration.
- README documents Java 17 requirement and `sdk env` usage for native Android
  builds; this was verified to work as documented (`.sdkmanrc` present and
  correct, `sdk env` switches to 17.0.15-amzn successfully). No mismatch.
- No other discrepancies noticed between README's described behavior and the
  source under `src/` during this iteration's read-through. Deeper review
  (e.g. actually running the app) is out of scope for a baseline iteration
  with no device/emulator available in this environment.

## Technical Decisions
- Did not fix the pre-existing React `act(...)` console warning in
  `__tests__/puzzle/PuzzleScreen.test.tsx` (triggered by an async image-size
  callback calling `setImageSize` outside of `act`). It's a test-hygiene
  warning, not a failure — the suite still passes. Left as a documented
  pre-existing item (see BLOCKED-adjacent note below) rather than touched in
  this baseline iteration, per instructions not to fix unrelated pre-existing
  issues beyond triviality/safety judgment calls. A real fix likely needs
  wrapping the async resolution/act boundary in the test itself; flagged for
  a future focused iteration rather than bundled into this one.
- Chose the `floodFill` early-return path as this iteration's one extra
  improvement because it was: (a) genuinely uncovered, (b) purely additive
  (no risk of behavior change since it's test-only), (c) small enough to
  fully verify in one iteration, and (d) relevant to real child-usability
  (repeated taps on an already-colored region should be fast/no-op).
- Iteration 2: chose `folderPathDisplay.ts` per iteration 1's own
  recommendation. Confirmed no bug exists (all 7 tests passed unmodified on
  first run, independently re-verified by a code-review subagent) — this was
  pure coverage addition, not a bugfix. This module matters for offline UX:
  it's the only thing standing between a raw, scary-looking SAF content URI
  and a readable path shown to parents in Settings/Onboarding, so its
  fallback-on-any-parsing-surprise design (never throw, never show nothing)
  is worth having pinned down by tests.
- Iteration 4: assessed iteration 3's top recommendation
  (`computePuzzleBoardSize`'s "insets exceed window entirely" case) and
  decided NOT to add a test for it, judging it not a genuinely distinct gap:
  the existing "floors to the minimum size when the window is very small"
  test already exercises the exact same code path — `Math.max(negativeValue,
  PUZZLE_MIN_SIZE)` — that "insets exceed window entirely" would hit; the
  only difference between the two scenarios is *which* subtraction produces
  the negative pre-floor value (small window vs. oversized insets), and both
  feed the identical `Math.max` clamp with no separate branch or code path
  in between. Adding a second test asserting the same 200-floor outcome via
  a different arithmetic route would not exercise new logic, so per this
  iteration's own instructions ("do not manufacture a change if coverage is
  already adequate; pick a genuinely uncovered case instead") the documented
  fallback was used: `folderMigration.ts`'s sibling-prefix-name boundary
  case, which was a real, previously-untested gap (see Completed #6).

## BLOCKED
None. No pre-existing uncommitted changes were found (`git status` was clean
before starting), so no developer-owned-changes conflict exists. No test or
tsc failures were found that needed to be deferred.

Pre-existing non-blocking item for a future iteration to address on its own:
- `console.error` "An update to PuzzleScreen inside a test was not wrapped in
  act(...)" printed during `__tests__/puzzle/PuzzleScreen.test.tsx` (test
  still passes). Root cause: `src/puzzle/PuzzleScreen.tsx` line ~113 calls
  `setImageSize` from inside an async image-size-resolution callback that the
  test invokes directly (`resolveGetSize` at
  `__tests__/puzzle/PuzzleScreen.test.tsx:159`) without wrapping in `act()`.
  Fix should live in the test (wrap the callback invocation in
  `act(async () => { ... })`), not in production code — flagging so it isn't
  mistaken for a new regression by a future iteration.

## Morning Review Notes
- What changed (iteration 4): one test-only commit adding 1 test to
  `__tests__/storage/folderMigration.test.ts` covering the sibling-prefix
  boundary of `isSameOrNestedWithin` (e.g. "Kutta" vs "KuttaBackup" should
  not be treated as nested). No production/runtime code changed. No UI
  changed. Also documented (in Technical Decisions) a decision NOT to add a
  test for iteration 3's originally-recommended `computePuzzleBoardSize`
  case, since it turned out to be the same code path as an existing test.
- What's valuable: closes the last documented coverage gap in
  `src/storage/folderMigration.ts`; the added test is a genuine regression
  guard against a subtle real-world SAF footgun — a naive prefix check could
  have wrongly blocked (or worse, silently mis-scoped) a migration between
  two similarly-named but unrelated sibling folders, which the fix and now
  the test both explicitly protect against.
- What needs visual testing: nothing from this iteration (test-only, and the
  underlying logic touches SAF folder migration, not any rendered UI).
- Risks: none identified — intentionally conservative, test-only iteration.
- Open questions for the developer: none blocking. Java version note: your
  default global `java -version` reports JDK 25; the project needs JDK 17 for
  Android/Gradle builds specifically, and `.sdkmanrc` + `sdk env` handles that
  per-shell already — no action needed unless you want JDK 17 as your global
  default too (not changed by this loop, per hard limits on shell config).
