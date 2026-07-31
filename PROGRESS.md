# Overnight Improvement Progress

## Current Status
- Phase: 1 (baseline verification + inventory), Iteration: 1
- Latest completed improvement: added 2 missing edge-case tests for `floodFill`'s
  "tapped pixel already matches fill color" early-return path (no production
  code changed — pre-existing behavior was already correct, just untested).
- Test status: 21/21 suites passing, 139/139 tests passing (was 137/137 before
  this iteration's added tests).
- tsc status: `npx tsc --noEmit` — clean, no errors.
- Java: default `java -version` on this machine is JDK 25 (Temurin). Repo pins
  Java 17 via `.sdkmanrc` (`java=17.0.15-amzn`) for the Android/Gradle build.
  Ran `source ~/.sdkman/bin/sdkman-init.sh && sdk env` at the start of this
  session to switch to 17 for this shell only — no global Java config changed.
  Future iterations should do the same before any Android-build-related work
  (not needed for `tsc`/`jest`, which run fine under either JDK).

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

## Pure-Logic Module Inventory (for future iterations)
Modules with pure/mostly-pure logic, current test coverage, and possible gaps:

| Module | Purpose | Existing tests | Possible future edge cases |
|---|---|---|---|
| `src/coloring/floodFill.ts` | Flood-fill fill algorithm on RGBA buffer | `__tests__/coloring/floodFill.test.ts` (6 tests after this iteration) | out-of-range `startX`/`startY` (negative or >= width/height) passed as the initial seed before the loop begins — currently only guarded inside the stack loop, not at entry; tolerance boundary (`tolerance` exactly matching a diff); 1x1 image; fully-filled image (no border) |
| `src/coloring/base64.ts` | Dependency-free base64 decoder | `__tests__/coloring/base64.test.ts` | invalid/malformed base64 input (non-multiple-of-4 length without padding), empty string, whitespace-only input |
| `src/coloring/palette.ts` | Static color palette data | none (pure data, no logic) | n/a — could add a smoke test asserting no duplicate `fill` values and valid RGBA ranges |
| `src/puzzle/puzzleGrid.ts` | Board sizing, grid dimensions, piece rects, row grouping, shuffle-with-guaranteed-non-identity | `__tests__/puzzle/puzzleGrid.test.ts` | `computePuzzleBoardSize` with insets that exceed window size entirely (available < 0 before `Math.max` floor); `shufflePieceOrder` with `pieceCount` of exactly 2 (only 2 possible permutations, guaranteed-non-identity swap logic); `groupPiecesIntoRows` with `items.length` not evenly divisible by `cols` |
| `src/quiz/filterQuestions.ts` | Age-range filter | `__tests__/quiz/filterQuestions.test.ts` | already well covered (in-range, boundary-inclusive, empty-result) |
| `src/quiz/loadQuestions.ts` | JSON parsing/validation of `questions.json`, image URI resolution | `__tests__/quiz/loadQuestions.test.ts` | duplicate option IDs (partially covered per `isValidQuestion`'s Set-size check — verify test exists); `minAge > maxAge` rejection; question with neither `text` nor `image`; option `text` present but missing one language key |
| `src/quiz/quizSession.ts` | Session building (shuffle + slice to 20), score/finish state machine | `__tests__/quiz/quizSession.test.ts` | fewer than 20 eligible questions (session shorter than `SESSION_LENGTH`); calling `answerCurrentQuestion` after `isFinished` is already true (should be a no-op — appears handled, confirm test exists); 0 eligible questions (`initialSessionState` with empty array marks `isFinished: true` immediately) |
| `src/quiz/shuffle.ts` | Fisher-Yates shuffle | `__tests__/quiz/shuffle.test.ts` | empty array, single-element array, custom deterministic `rng` producing a known permutation |
| `src/storage/folderAccess.ts` | SAF folder helpers: `leafNameOf`, `findChildUri`, `ensureContentStructure` | `__tests__/storage/folderAccess.test.ts` | `leafNameOf` with unencoded/partially-encoded URI, trailing slash, no slash at all |
| `src/storage/folderMigration.ts` | Copy+verify+delete folder migration, `isSameOrNestedWithin` same/nested detection | `__tests__/storage/folderMigration.test.ts` | `isSameOrNestedWithin` with a volume-root URI ending exactly in `primary:` (boundary char logic at line 31-33); sibling folders with one name being a prefix of another (e.g. "Kutta" vs "KuttaBackup") — should NOT be treated as nested, verify a regression test exists for the boundary-char fix already documented in comments |
| `src/storage/folderPathDisplay.ts` | SAF URI → human-readable path | none found — **no test file exists for this module** | malformed percent-encoding (`decodeURIComponent` throws — has a try/catch, worth a test); non-`primary` volume (SD card, e.g. `1234-5678:Path`); URI with no `/tree/` marker at all; empty path after volume marker |
| `src/storage/profileStore.ts` | AsyncStorage get/save profile with JSON parse guard | `__tests__/storage/profileStore.test.ts` | corrupted/non-JSON stored value (should return `null`, not throw) — verify covered |
| `src/types/*.ts` | Type-only, no runtime logic | n/a | n/a |
| `src/i18n/strings.ts` | Bilingual string dictionary | `__tests__/i18n/strings.test.ts` | probably fine as-is; could check every key has both `en`/`de` present if not already asserted |

**Highest-value gap identified:** `src/storage/folderPathDisplay.ts` has zero
dedicated tests despite non-trivial parsing logic and multiple fallback paths
(malformed encoding, missing `/tree/` marker, non-primary volumes). Recommend
this as the iteration 2 focus.

## Next
Iteration 2 priority: add a test file `__tests__/storage/folderPathDisplay.test.ts`
covering `toReadableFolderPath` — primary volume happy path (already implied
by the doc comment example), non-primary volume (SD card) label passthrough,
malformed percent-encoding fallback, and missing-`/tree/`-marker fallback.
This is a pure function with zero existing coverage — good, safe, isolated
next step. If that module turns out already effectively covered indirectly
elsewhere, fall back to the next inventory row (e.g. `quizSession.ts`
zero-eligible-questions case, or `puzzleGrid.ts` insets-exceed-window case).

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
- What changed: one test-only commit adding 2 new edge-case tests to
  `floodFill.test.ts`. No production/runtime code changed. No UI changed.
- What's valuable: PROGRESS.md now has a concrete pure-logic inventory table
  future iterations can work through one row at a time instead of
  re-discovering the module map from scratch.
- What needs visual testing: nothing from this iteration.
- Risks: none identified — this iteration was intentionally conservative
  (baseline + inventory + one safe test addition).
- Open questions for the developer: none blocking. Java version note: your
  default global `java -version` reports JDK 25; the project needs JDK 17 for
  Android/Gradle builds specifically, and `.sdkmanrc` + `sdk env` handles that
  per-shell already — no action needed unless you want JDK 17 as your global
  default too (not changed by this loop, per hard limits on shell config).
