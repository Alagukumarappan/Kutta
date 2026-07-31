# Overnight Improvement Progress

## Current Status
- Phase: 1 (baseline verification + inventory), Iteration: 15
- Latest completed improvement (iteration 15, one commit): Phase 2 item 3
  (palette-color-swatch accessibility labels, deferred from iteration 14's
  `Next` item 1). `src/coloring/ColoringScreen.tsx`'s 12 palette swatches
  (`palette-color-${i}`, ~lines 401-431) were plain colored circles with no
  children/text/label at all — genuinely icon-only and screen-reader-silent.
  Read `src/coloring/palette.ts` first: the `PaletteColor` type only had
  `display`/`fill`, no existing name/id field, confirming a small additive
  field was needed (not a restructuring). The 12 actual hex colors (read
  from the file, not guessed) are red, orange, yellow, green, blue, purple,
  pink, brown, black, white, teal, and gray — one more than the `Next` note's
  example list assumed (teal was not previously named in that note).
  - Data-shape change: added `nameKey: StringKey` to the `PaletteColor`
    interface in `palette.ts` (additive only — `display`/`fill` untouched)
    and set it on all 12 array entries to a new per-color i18n key
    (`paletteColorRed` ... `paletteColorGray`), matching the existing
    `// red`/`// orange`/etc. trailing comments already in the file.
  - i18n: added all 12 new keys to `src/i18n/strings.ts` in both languages
    (24 new strings) — en: Red, Orange, Yellow, Green, Blue, Purple, Pink,
    Brown, Black, White, Teal, Gray; de: Rot, Orange, Gelb, Grün, Blau, Lila,
    Pink, Braun, Schwarz, Weiß, Türkis, Grau. "Orange" and "Pink" are
    identical in both languages — both are fully naturalized loanwords in
    German (not left untranslated by mistake; a code-review subagent
    specifically checked and confirmed this is idiomatic, not an oversight).
  - Accessibility: added `accessibilityRole="button"`,
    `accessibilityLabel={t(paletteColor.nameKey)}`, and
    `accessibilityState={{ selected: isSelected }}` to each swatch's
    `Pressable`. `isSelected` was already a pre-existing local variable
    driving the existing visual selected-indicator (a thicker dark border +
    1.12x scale on the selected swatch, ~lines 421-427) — the "indicate
    selection using more than color alone" requirement was already met
    visually before this iteration, so no new visual indicator was added;
    `accessibilityState` only wires the same existing selection fact through
    to screen readers (TalkBack/VoiceOver announce "selected"/"not
    selected" alongside the "button" role).
  - German word-length check: all 12 German names are the same length or
    shorter than their English counterparts except "Schwarz" (7 vs "Black"'s
    5) and "Türkis" (6 vs "Teal"'s 4) — neither is rendered as visible text
    anywhere (swatches remain plain colored circles; the name is
    `accessibilityLabel`-only), so there is no layout risk in either
    language. Noted here per the iteration brief's instruction even though
    no actual layout concern exists.
  - TDD: added 2 tests to `__tests__/coloring/ColoringScreen.test.tsx` —
    one asserting (in English) that `findByLabelText('Red')` and
    `findByLabelText('Blue')` resolve, that each has
    `accessibilityRole: 'button'`, that the initially-selected swatch (Red,
    `PALETTE[0]`) has `accessibilityState.selected === true` while Blue has
    `false`, and that pressing Blue flips both swatches'
    `accessibilityState.selected` correctly; a second test asserting three
    German labels ("Rot"/"Grün"/"Grau") resolve. Confirmed both failed for
    the right reason first (`Unable to find an element with accessibility
    label: Rot` / `Red`) before implementing.
  - Verified `npx tsc --noEmit` clean, full suite 24/24 suites and
    169/169 tests passing (167 baseline + 2 new). No existing test touched,
    skipped, or renamed.
  - A code-review subagent independently reviewed the diff: confirmed
    `t(paletteColor.nameKey)` resolves correctly by reading
    `LanguageContext.tsx`'s `t()` closure and `strings.ts`'s `UI_STRINGS`
    lookup, confirmed all 12 colors have complete non-empty en/de keys,
    confirmed "Pink"/"Türkis" are natural, child-appropriate German (not
    awkward literalism), confirmed `accessibilityState={{ selected }}`
    alongside `accessibilityRole="button"` is the standard correct RN
    pattern with no TalkBack/VoiceOver conflict, confirmed the new tests are
    non-tautological (query by accessible label, assert role and selection
    state before/after a real press, re-query to confirm the flip) and not
    order-dependent, confirmed `git diff --stat` touched only the 4 intended
    files with no `any`/`ts-ignore`/dependency changes, and confirmed the
    diff stayed tightly scoped (additive `nameKey` field only, no
    restructuring of `palette.ts`/`ColoringScreen.tsx`). Approved with no
    required or optional changes.
  - Commit: `136d42f` — `loop: label ColoringScreen's palette swatches for
    screen readers`.
- Previous iteration's completed improvement (iteration 14, one commit): Phase 2 item 3
  (icon-only-controls accessibility audit, deferred from iteration 13's
  `Next` item 1). Grepped every `Pressable`/`TouchableOpacity`/
  `TouchableWithoutFeedback` in `src/` (14 files) and, for each one, read its
  JSX children to classify it as icon-only (no adjacent visible `<Text>`) vs.
  already-labeled/text-labeled. Findings:
  - `src/home/HomeScreen.tsx`'s settings gear-icon button
    (`home-settings-icon`, a lone `⚙️` `<Text>`, no adjacent label) was the
    one genuine, unambiguous gap: it's the app's **only** path to the
    Settings screen (no other affordance opens it), on the one screen with
    `headerShown: false` (no native header chrome to fall back on). Fixed.
  - The 4 home feature cards (`home-card-*`) are NOT icon-only — each
    `Pressable` also renders `t(card.labelKey)` as visible text
    (`Coloring`/`Quiz`/`Photo Puzzle`/`Videos`) alongside its emoji, which
    screen readers already read automatically.
  - All 7 retry buttons already have `accessibilityLabel` from iterations
    12-13.
  - `AgePicker`/`PieceCountPicker`'s picker fields and modal option rows all
    have adjacent visible `<Text>` (age number / piece count / "English" /
    "Deutsch" / etc.) — not icon-only.
  - `SettingsScreen`/`OnboardingScreen`'s language pills and folder/save
    buttons all render visible text inside the `Pressable`.
  - `RootNavigator.tsx` has no custom `headerLeft`/`headerRight`/back-icon
    render props — all 9 screens use React Navigation's native default
    header back button, which ships with its own built-in accessible name
    ("Back" / localized by the OS) — not an app-level gap to fix.
  - `ColoringScreen.tsx`'s 12 palette-color swatches (`palette-color-${i}`,
    lines ~404-429) genuinely ARE icon-only — a plain colored circle with no
    children/text/label at all — but labeling them properly needs 12 new
    per-color i18n name keys (e.g. "Red"/"Orange"/.../"Gray") x 2 languages
    (24 new strings) plus a naming judgment call for each of the 12 hex
    values in `src/coloring/palette.ts`. Judged materially larger and more
    heterogeneous than the single settings-button fix, so deliberately
    deferred rather than bundled in (see Next and Technical Decisions).
  - TDD: added a new test to `__tests__/home/HomeScreen.test.tsx` —
    `findByLabelText('Settings')`, presses it, asserts `onNavigate` was
    called with `'settings'`. Confirmed it failed for the right reason first
    (`Unable to find an element with accessibility label: Settings`) before
    implementing.
  - Fix: added `accessibilityRole="button"` and
    `accessibilityLabel={t('settingsTitle')}` to the one `Pressable` in
    `src/home/HomeScreen.tsx`, reusing the pre-existing `settingsTitle` i18n
    key (`en`: "Settings", `de`: "Einstellungen" — already the Settings
    screen's own header title, so the accessible name matches the
    destination screen's own name). No new i18n strings needed. No
    production logic changed beyond the two accessibility props.
  - Verified `npx tsc --noEmit` clean, full suite 24/24 suites and 167/167
    tests passing (166 baseline + 1 new). No existing test touched, skipped,
    or renamed.
  - A code-review subagent independently reviewed the diff: confirmed
    `t('settingsTitle')` really produces "Settings"/"Einstellungen" by
    reading `strings.ts`, confirmed the wording matches the button's action,
    confirmed `findByLabelText('Settings')` can't ambiguously match anything
    else on the screen (checked all other visible text on `HomeScreen`),
    confirmed localization is complete, confirmed no `any`/unsafe casts,
    confirmed only the two intended files changed (`git status`), and
    confirmed the scoping decision (fix the one unambiguous gap, defer the
    12-color palette swatches as a separate, larger effort) was correct.
    Approved with no required or optional changes.
  - Commit: `<see git log — loop: add an accessibilityLabel to the home
    screen's settings icon button>`.
- Previous iteration's completed improvement (iteration 13, one commit): finished the
  accessibility-label pass on the app's retry buttons (`Next` item 1 from
  iteration 12). First re-grepped `testID="[a-z-]*retry"` under `src/` to
  confirm iteration 12's named list of 4 remaining buttons was still
  accurate (it was, byte-for-byte): `src/puzzle/PuzzleGallery.tsx`
  (`puzzle-gallery-retry`), `src/video/VideoGallery.tsx`
  (`video-gallery-retry`), `src/navigation/RootNavigator.tsx`'s
  `FolderErrorScreen` (`folder-resolve-retry`), and
  `src/video/VideoPlayerScreen.tsx` (`video-player-retry` — confirmed it
  was added in iteration 12's own commit `a67d544` without a label, so it
  still needed one). Added `accessibilityRole="button"` and
  `accessibilityLabel={t('retry')}` to all four, reusing the existing
  `retry` i18n key (`en`: "Retry", `de`: "Erneut versuchen") — every one of
  these buttons already renders `t('retry')` as its visible `<Text>`, so the
  key is the exactly-correct accessible name in all four cases (verified by
  reading each button's JSX before editing, not assumed).
  - TDD: for `PuzzleGallery`, `VideoGallery`, and `VideoPlayerScreen`,
    swapped each screen's existing retry-flow test's press target from
    `findByTestId('...-retry')` to `findByLabelText('Retry')` — confirmed
    all three failed for the right reason (`Unable to find an element with
    accessibility label: Retry`) before implementing. `RootNavigator.tsx`'s
    `FolderErrorScreen` had **zero test coverage of any kind** before this
    iteration (no existing test ever drove the app into the folder-error
    branch), so a new test was added instead of extending one: mocks
    `folderAccess.ensureContentStructure` to reject once (the first call
    inside `resolveSubfolderUris`), asserts `folder-resolve-error` renders,
    then asserts `findByLabelText('Retry')` finds the button. Confirmed this
    fails first for the same reason, then passes after the fix.
  - No new i18n strings needed — all four buttons reuse the pre-existing
    `retry` key. No new dependency. No production logic changed — every
    change is exactly two accessibility props added to an existing
    `Pressable`, matching iteration 12's pattern for
    `QuizScreen`/`ColoringGallery`/`ColoringScreen` byte-for-byte.
  - Verified `npx tsc --noEmit` clean, full suite 24/24 suites and
    166/166 tests passing (165 baseline + 1 new `RootNavigator` test; the
    three `findByTestId`→`findByLabelText` swaps replaced assertions in
    place rather than adding new `it` blocks).
  - A code-review subagent independently reviewed the diff: confirmed the
    `retry` key match is correct for all four buttons (visible text
    unchanged, matches the label exactly), confirmed the
    `findByLabelText('Retry')` swap doesn't accidentally match more than one
    element in any of the three modified tests (each error state has
    exactly one retry control), confirmed the new `RootNavigator` test is
    deterministic and not order-dependent (traced `resolveSubfolderUris`'s
    call order — `ensureContentStructure` fires before `findChildUri`, and
    `jest.clearAllMocks()` runs per-test so the `mockRejectedValueOnce`
    can't leak into other tests), confirmed no TypeScript/lifecycle/
    navigation/scope-creep issues, and confirmed no existing test was
    weakened, skipped, or renamed. Approved with no required or optional
    changes.
  - Decided NOT to take on the optional icon-only-controls fast-follow this
    iteration (Phase 2 item 3 territory — auditing back/close/settings icon
    buttons for missing `accessibilityLabel`) because the primary task
    turned out to be exactly 4 buttons, at the upper edge of (not clearly
    under) the "3 or fewer, quick pass" threshold given in this iteration's
    brief for taking on a bonus scope item; left as the next documented
    follow-up instead (see Next).
  - Commit: `<see git log — loop: add accessibilityLabel to the remaining
    retry buttons>`.
- Previous iteration's completed improvements (iteration 12, two commits):
  1. `VideoPlayerScreen`'s error-state audit (this iteration's primary task,
     `Next` item 1 from iteration 11). Read `src/video/VideoPlayerScreen.tsx`
     in full against the same 5-point checklist iteration 11 used: no stuck
     spinner (no spinner state exists at all — it renders `VideoView`
     immediately and lets the native player show its own loading UI), no
     unhandled promise rejection (no promises in this file at all — the
     player reports failure via a synchronous `statusChange` event listener,
     not a rejected promise), no setState-after-unmount bug (the listener's
     `subscription.remove()` cleanup already ran correctly on unmount), and
     the error message was already friendly and localized
     (`t('videoLoadError')`, never a raw `PlayerError`). But — exactly the
     same pattern as iteration 11's `ColoringScreen` finding — `VideoGallery`
     (the screen one level up, listing videos) already has a
     `retryToken`-driven Retry button for the identical SAF-failure category
     (SAF grant revoked / file deleted externally / SD card unmounted), while
     `VideoPlayerScreen`'s error state was a dead end: no retry button, no
     way to recover except navigating back out via the header. This is a
     genuine, real gap, not manufactured — confirmed by re-reading
     `VideoGallery.tsx`'s retry pattern and `RootNavigator.tsx`'s route wiring
     (video-detail is shown with `headerShown: true`, same as every other
     detail screen).
     - Fix (TDD): wrote `__tests__/video/VideoPlayerScreen.test.tsx` (new
       file, 4 tests — the screen's first-ever test coverage) first —
       happy-path render, friendly-error-on-status-error (asserts the
       localized message renders and no raw/technical text like "Exception"
       leaks through), a retry-recovers test, and a setState-after-unmount
       regression test. Confirmed the retry test failed for the right reason
       first (`video-player-retry` testID didn't exist) before implementing.
       `expo-video` "isn't mockable/transformable under this project's
       (untouched) jest config" per `RootNavigator.test.tsx`'s own comment
       (it touches real native prototypes at import time, so
       `RootNavigator.test.tsx` stubs the whole screen out) — since this new
       test file exists specifically to exercise `VideoPlayerScreen`'s own
       load/error/retry logic, the mock boundary was placed one level lower
       instead: a `jest.mock('expo-video', ...)` fakes only `useVideoPlayer`
       and `VideoView` with a controllable in-memory player object that can
       `emit('statusChange', ...)` for real, exercising the screen's actual
       effect/listener/retry code rather than faking the behavior under test
       (same principle iteration 11 used for its Skia mock). Status-changing
       `emit()` calls are wrapped in `await act(async () => {...})` to avoid
       introducing new act()-warning noise (a plain synchronous `act()`
       didn't flush the update under this React/RN version — needed the
       async form).
     - Then implemented the fix in `src/video/VideoPlayerScreen.tsx`: added a
       `handleRetry` callback and a `<Pressable testID="video-player-retry">`
       button in the error branch, styled identically to
       `ColoringScreen`'s/`QuizScreen`'s retry button
       (`colors.coral`/`coralDark`, `radii.xl`, `...shadow`, `elevation: 4`,
       from `../theme/tokens` — note the correct import path is
       `theme/tokens`, not `theme`). Unlike the `retryToken`-bump pattern used
       by every other screen (which re-runs a fetch/read *effect*),
       `VideoPlayerScreen` has no effect to re-run — it holds one long-lived
       `player` object for the screen's whole life. The equivalent recovery
       action documented in a code comment: call `player.replace(videoUri)`
       (the `expo-video` API's documented way to make a player re-attempt the
       same source) followed by `player.play()`, and reset `error` to
       `false` so a subsequent `statusChange` (success or failure) can drive
       the UI again. No new dependency, no new i18n strings
       (`videoLoadError` and `retry` both already existed in
       `src/i18n/strings.ts` with en/de).
     - Verified `npx tsc --noEmit` clean, full suite 24/24 suites and
       165/165 tests passing (161 baseline + 4 new `VideoPlayerScreen`
       tests). No existing test touched, skipped, or renamed.
     - A code-review subagent independently reviewed the diff: confirmed
       `player.replace`/`player.play` are synchronous, void-returning methods
       per `node_modules/expo-video/build/VideoPlayer.types.d.ts` (no async
       closure risk, no throw hazard), confirmed the listener
       cleanup/dependency array are unchanged and still correct (no new
       setState-after-unmount risk), confirmed the `expo-video` mock
       genuinely exercises the real effect/listener/retry code rather than
       faking it, confirmed no risky `any`/unsafe casts, confirmed the button
       styling matches the established pattern exactly, and confirmed no
       accessibility/child-safety/scope-creep issues. One optional
       improvement suggested (assert `player.play` was actually called on
       retry, not just implied indirectly) — applied before committing.
       Approved.
     - Commit: `a67d544` — `loop: add a retry action to VideoPlayerScreen's
       playback-error state`.
  2. Accessibility follow-up (this iteration's secondary task, `Next` item 3
     from iteration 11): none of the app's retry buttons had an
     `accessibilityLabel`, a pre-existing gap iteration 11's code-review
     subagent flagged as optional. Added `accessibilityRole="button"` and
     `accessibilityLabel={t('retry')}` to the three retry buttons iteration
     11's note specifically named — `QuizScreen.tsx` (`quiz-retry`),
     `ColoringGallery.tsx` (`coloring-gallery-retry`), and
     `ColoringScreen.tsx` (`coloring-retry`). No new i18n strings needed —
     reused the existing `retry` key (`en`: "Retry", `de`: "Erneut
     versuchen"), which already had both languages and is exactly the right
     accessible name for the action. Extended each screen's existing
     retry-error test (not a new test file) with one `await
     findByLabelText('Retry')` assertion each, confirming the label actually
     renders and is queryable the way a screen reader would find it — this
     is a real assertion, not a no-op, since `findByLabelText` fails if the
     prop isn't wired up (hand-verified by checking it against the
     unmodified files first mentally: the query targets
     `accessibilityLabel`, a prop that did not exist before this change).
     Deliberately did NOT touch `PuzzleGallery.tsx`, `VideoGallery.tsx`,
     `RootNavigator.tsx`'s `FolderErrorScreen`, or the just-added
     `VideoPlayerScreen` retry button in this pass — iteration 11's note
     named exactly three screens, and expanding to all seven retry buttons
     found in the codebase (see Technical Decisions) is left as a documented,
     easy follow-up rather than silently bundled in. `tsc` clean, 24/24
     suites, 165/165 tests unchanged (assertions were added to existing
     tests, not new `it` blocks, so the count didn't change from item 1's
     165). This was reviewed via self-review only (mechanical,
     low-risk, single-prop-per-file change) rather than a fresh code-review
     subagent pass, per the protocol's "equivalently rigorous self-review"
     fallback for very small diffs.
     - Commit: `78ea4c9` — `loop: add accessibilityLabel to the app's retry
       buttons`.
- Previous iteration's completed improvement (iteration 11, one commit):
  Phase 1 item 8 (error-state audit). Audited all three candidate screens'
  async content-loading paths (`QuizScreen`, `ColoringScreen`, `PuzzleScreen`)
  against the 5-point checklist (stuck spinner, unhandled rejection,
  setState-after-unmount, raw technical error shown to child, racy/double-
  firing retry). `QuizScreen.tsx` and `PuzzleScreen.tsx` both already had
  dedicated test files with full error-path coverage (including retry, for
  `QuizScreen`) and were confirmed clean on inspection (both use a correct
  `cancelled`-flag guard in their loading effects). `ColoringScreen.tsx` had
  **zero test coverage of any kind** before this iteration — the real gap.
  On inspection its photo-load effect already had a correct `cancelled`
  guard and a correct try/catch showing a friendly localized message
  (`t('coloringImageLoadError')`, never a raw error) — no stuck spinner, no
  unhandled rejection, no setState-after-unmount bug. But unlike `QuizScreen`
  and `ColoringGallery`, which both handle the *identical* failure category
  (SAF grant revoked / file deleted externally / SD card unmounted) with a
  `retryToken` state bumped by a Retry button, `ColoringScreen`'s error state
  was a dead end: no retry button at all, so the child/parent had no way to
  recover from a transient failure without navigating away and back via the
  header. This is a genuine, real inconsistency/gap (not a manufactured one)
  — the exact same recoverable failure mode is handled inconsistently across
  three near-identical screens in this codebase.
  - Fix (TDD): wrote `__tests__/coloring/ColoringScreen.test.tsx` (new file,
    5 tests) first — happy-path load, friendly-error-on-rejection (asserts
    the raw `Error` message text, e.g. an `ENOENT:` string, never appears in
    the rendered output), friendly-error-on-null-decode (Skia decode returns
    null with no exception — a distinct branch from the throw path), a
    retry-recovers-from-transient-failure test, and a setState-after-unmount
    regression test (controlled promise resolved after `unmount()`, asserts
    no "unmounted component" `console.error`). Confirmed the retry test
    failed for the right reason first (no `coloring-retry` testID existed).
    Since no Skia mock infrastructure existed anywhere in this repo's test
    suite before, added a minimal inline `jest.mock('@shopify/react-native-skia')`
    scoped to exactly what `ColoringScreen`'s load/decode path touches
    (`Canvas`/`Image`/`Path` as no-op components, `Skia.Data.fromBytes`,
    `Skia.Image.MakeImageFromEncoded`/`MakeImage`, `ColorType`/`AlphaType`) —
    it doesn't fake the `cancelled`/retry logic under test, so it can't hide
    a real regression there.
  - Then implemented the fix in `src/coloring/ColoringScreen.tsx`: added a
    `retryToken` state (byte-for-byte the same pattern as `QuizScreen.tsx`
    and `ColoringGallery.tsx` — same comment style, added to the load
    effect's dependency array), and a `<Pressable testID="coloring-retry">`
    button in the `imageLoadFailed` branch styled identically to
    `QuizScreen`'s retry button (`colors.coral`/`coralDark`, `radii.xl`,
    `...shadow`, `elevation: 4`). No new dependency, no new i18n strings
    (`coloringImageLoadError` and `retry` both already existed in
    `src/i18n/strings.ts` with en/de).
  - Verified rapid-repeated-retry-tap safety: each effect run captures its
    own `cancelled` closure; React runs the previous effect's cleanup
    (setting the old closure's `cancelled = true`) before the next effect
    starts, so no race or double-fire is possible even if the Retry button
    is tapped multiple times quickly — same guarantee already relied on by
    `QuizScreen`/`ColoringGallery`.
  - Verified: `npx tsc --noEmit` clean, full suite 23/23 suites and
    161/161 tests passing (156 baseline + 5 new `ColoringScreen` tests). No
    existing test touched, skipped, or renamed.
  - A code-review subagent independently reviewed the diff: confirmed the
    `retryToken` pattern is genuinely consistent with `QuizScreen.tsx` (not
    subtly different), confirmed the Skia mock doesn't hide bugs in the
    guard logic under test, confirmed the unmount-regression test targets
    the specific "unmounted component" warning substring (not vacuously
    asserting zero `console.error` calls, which would silently pass even if
    unrelated pre-existing act() noise were present), confirmed
    localization is correct with no hardcoded strings, confirmed no
    `any`/`as any`/`ts-ignore` in production code (one `: any` exists only
    on a mock prop type inside the new test file's `jest.mock` factory —
    standard RN mock boilerplate, not production code), and noted (as an
    optional, not-required, pre-existing gap) that none of the three retry
    buttons in the app have an `accessibilityLabel`/`role` — consistent
    with existing convention, not a regression introduced here. Approved
    with no required changes.
  - Commit: see `git log` on `overnight-improvements` branch, message
    `loop: add a retry action to ColoringScreen's photo-load error state`.
- Previous iteration's completed improvement (iteration 10, one commit):
  Finished the `RootNavigator.tsx` `RootStackParamList` typing fix that
  iteration 9 deferred. Defined a 9-route `RootStackParamList` (params shape
  for every screen, `undefined` for the 6 param-less ones and `{ imageUri:
  string }`/`{ videoUri: string }` for the 3 detail screens), passed it to
  `createNativeStackNavigator<RootStackParamList>()` (previously called with
  no generic at all), and removed all 3 `({ route }: any) => ...` casts on
  the `coloring-detail`/`puzzle-detail`/`video-detail` screens — `route` is
  now genuinely inferred as `RouteProp<RootStackParamList, RouteName>`.
  Hand-verified via temporary sabotage (misspelling `route.params.imageUri`
  as `route.params.wrongProp`) that `tsc` now catches it — it didn't before.
  Also hand-verified an important limitation, documented in a code comment:
  React Navigation's own `RouteConfigComponent` type declares the sibling
  `navigation` argument in the same render-prop callback as plain `any`
  regardless of the navigator's generic (confirmed by reading
  `node_modules/@react-navigation/core/lib/typescript/src/types.d.ts`), so
  `navigation.navigate(...)` call sites (in this file and in `HomeScreen`)
  remain unchecked against `RootStackParamList` — e.g. a misspelled route
  name or wrong param key passed to `navigate(...)` will NOT be caught by
  `tsc`. This is an upstream library type limitation, not something this fix
  (or a bigger local fix) can close. Zero behavior change — pure type-safety
  improvement, `tsc` clean, 22/22 suites and 156/156 tests unchanged. A
  code-review subagent independently re-verified the `RootStackParamList`
  shape against all 9 `Stack.Screen name=` sites and all `navigate(...)`
  call sites, independently confirmed the `navigation: any` upstream
  limitation claim by reading the same type-definition file, and approved
  with no required or optional changes.
- Previous iteration's completed improvements (iteration 9, two commits):
  1. Added 1 test to `__tests__/coloring/floodFill.test.ts` covering the
     previously-uncovered 1x1 image case (`width=1, height=1`, seed `(0,0)`)
     — asserts the single pixel gets filled, the result is a distinct copy,
     and the input buffer is untouched. TDD-verified (temporarily made the
     traversal stack seed empty for the 1x1 case, confirmed the test failed
     for the intended reason, restored the original file exactly; `git diff
     --stat` showed no production change afterward). A code-review subagent
     independently confirmed the test is non-tautological (distinct from all
     other 3x3/1x3 fixtures) and correctly asserts fill/copy/non-mutation.
     This closes the last named gap in the floodFill pure-logic inventory.
  2. Phase 1 item 9 (TODO/lint-smell audit): grepped `src/` and `__tests__/`
     for TODO/FIXME/HACK/TEMP/XXX, `eslint-disable`, `ts-ignore`/
     `ts-expect-error`, `: any`/`as any`, `console.log`, and commented-out
     code. Found zero TODO-style markers, zero `eslint-disable`, zero
     `ts-ignore`/`ts-expect-error`, zero `console.log`, and no real
     commented-out code (the two `//` hits that matched the heuristic were
     genuine prose comments, not dead code). Found 8 `as any` occurrences: 5
     in production code (`src/quiz/loadQuestions.ts`) and 3 in
     `src/navigation/RootNavigator.tsx` route-prop render callbacks, plus 3
     more in test-helper parameter signatures (not production risk). Fixed
     the `loadQuestions.ts` ones (see Completed #12 below); investigated and
     deliberately deferred the `RootNavigator.tsx` ones (see Technical
     Decisions).
- Test status: 24/24 suites passing, 169/169 tests passing (up from
  24/24 suites, 167/167 tests — iteration 15 added 2 new tests to
  `ColoringScreen.test.tsx`, covering palette-swatch labels/selection state
  in English and German).
- Previous test status: 24/24 suites passing, 167/167 tests passing (up from
  24/24 suites, 166/166 tests — iteration 14 added 1 new test,
  `HomeScreen`'s settings-icon accessible-name test).
- Previous test status: 24/24 suites passing, 166/166 tests passing (up from
  24/24 suites, 165/165 tests — iteration 13 added 1 new test, a
  `RootNavigator` test exercising `FolderErrorScreen`'s retry button for the
  first time ever; 3 other retry-flow tests had their press-target
  assertion swapped from `findByTestId` to `findByLabelText` in place,
  which doesn't add to the count).
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

7. **loop: add shufflePieceOrder pieceCount=2 boundary coverage** (iteration 5)
   - Files: `__tests__/puzzle/puzzleGrid.test.ts` (test-only change; no
     production code modified)
   - Checked first: confirmed iteration 4's `Next` top recommendation
     (`shufflePieceOrder` with `pieceCount === 2`) was genuinely uncovered —
     the existing "never returns the identity order" test only loops over
     `pieceCount` in `[4, 6, 9, 12]`, and no test anywhere calls
     `shufflePieceOrder(2, ...)`.
   - Test added (1): "always returns [1, 0] for exactly 2 pieces, regardless
     of which RNG branch fires" — hand-traced both branches of
     `shuffle([0, 1], rng)` (the only Fisher-Yates loop iteration is `i=1`,
     `j = floor(rng() * 2)`): `rng() >= 0.5` gives `j=1` (self-swap, stays
     identity `[0,1]`, so `shufflePieceOrder`'s own fallback swap then
     produces `[1,0]`); `rng() < 0.5` gives `j=0` (swaps directly to `[1,0]`,
     already non-identity, fallback does not fire). Asserted 4 RNG values
     spanning both branches (0.99999, 0.5, 0.25, 0.0) all yield `[1, 0]`.
   - TDD-verified: temporarily removed the `isIdentity` fallback-swap block
     from `shufflePieceOrder` in `src/puzzle/puzzleGrid.ts` to confirm the
     new test fails for the intended reason — the `rng() >= 0.5` assertions
     failed with `[0, 1]` (uncorrected identity) instead of `[1, 0]`, exactly
     as expected. Restored the original production file exactly afterward;
     `git diff --stat` confirmed zero production-code change remained. The
     test passes against the real, unmodified implementation — no bug found,
     pure coverage addition.
   - A code-review subagent independently re-traced all 4 RNG values against
     the Fisher-Yates loop and confirmed the assertions are mathematically
     correct (not coincidental), confirmed this is genuinely new
     non-overlapping coverage, confirmed the test would catch a real
     regression if the fallback swap were broken/removed, and confirmed only
     the test file changed. Approved with no required changes (one optional
     cosmetic nit — also assert a value just below 0.5 like 0.4999 to pin the
     exact boundary — not applied, since the four existing values already
     fully partition both code paths).
   - Commit: see `git log` on `overnight-improvements` branch, message
     `loop: add shufflePieceOrder pieceCount=2 boundary coverage`.

8. **loop: add groupPiecesIntoRows ragged-row boundary coverage** (iteration 6)
   - Files: `__tests__/puzzle/puzzleGrid.test.ts` (test-only change; no
     production code modified)
   - Checked first: confirmed iteration 5's `Next` top recommendation
     (`groupPiecesIntoRows` with `items.length` not evenly divisible by
     `cols`) was genuinely uncovered — every existing test in the
     `groupPiecesIntoRows` describe block (including the "never produces a
     row with more or fewer than `cols` items" loop test) only exercises
     exact multiples: `[4,2],[6,3],[6,2],[9,3],[12,4],[12,3]`.
   - Tests added (2):
     - "puts the remainder into a shorter final row when the item count is
       not an exact multiple of `cols`" — 7 items, cols=3, expects
       `[[0,1,2],[3,4,5],[6]]`, pinning down the ragged-remainder branch of
       `items.slice(i, i + cols)`.
     - "returns a single short row (not an empty extra row) when item count
       is less than `cols`" — 2 items, cols=3, expects `[[0,1]]` (a single
       short row, not an extra empty array or a dropped remainder).
   - TDD-verified: temporarily replaced the loop in `groupPiecesIntoRows`
     (`src/puzzle/puzzleGrid.ts`) with a `Math.floor(items.length /
     cols)`-bounded version that drops any remainder — both new tests failed
     for the intended reason (missing final row / empty result instead of a
     short row). Restored the original production file exactly afterward;
     `git diff --stat` confirmed zero production-code change remained. The
     tests pass against the real, unmodified implementation — no bug found,
     pure coverage addition.
   - Note (documented, same pattern as iteration 5's `pieceCount === 2`
     case): `groupPiecesIntoRows` is only ever called today with
     `pieceCount`/`cols` pairs from `GRID_DIMENSIONS_LANDSCAPE`, which are
     always exact multiples (4/2, 6/2or3, 9/3, 12/3or4) — so a ragged row is
     not currently user-reachable in the live app. Still worth testing as
     the general contract of a reusable, exported pure function, and cheap
     regression insurance if a future non-square piece count is ever added.
   - A code-review subagent independently re-verified both hand-computed
     expected outputs against the loop's actual slice bounds, confirmed the
     tests exercise genuinely new branches not covered by the existing
     exact-multiple loop test, confirmed they'd catch a real regression
     (e.g. an off-by-one or a remainder-dropping rewrite), and confirmed the
     "not currently user-reachable" comment is accurate against
     `GRID_DIMENSIONS_LANDSCAPE`. Approved with no required or optional
     changes.
   - Commit: see `git log` on `overnight-improvements` branch, message
     `loop: add groupPiecesIntoRows ragged-row boundary coverage`.

9. **loop: add floodFill out-of-range-seed coverage** (iteration 7)
   - Files: `__tests__/coloring/floodFill.test.ts` (test-only change; no
     production code modified)
   - Checked first: confirmed iteration 6's `Next` top recommendation
     (`floodFill`'s out-of-range seed coordinates) was genuinely uncovered —
     read the full existing test file and confirmed none of the 6 existing
     tests pass a `startX`/`startY` outside `[0, width)`/`[0, height)`. The
     other two candidates named in the `Next` note (tolerance-exact-boundary,
     1x1-image) were not needed since this one was confirmed uncovered first.
   - Tests added (2, 6 assertions total):
     - "...negative, including single-axis-only cases" — asserts an
       unchanged copy for both-axes-negative `(-1,-1)`, X-only-negative
       `(-1,0)`, and Y-only-negative `(0,-1)`, plus a `not.toThrow()` check.
     - "...>= width/height, including single-axis-only cases" — same
       structure for `(3,3)`, `(3,0)`, `(0,3)` on the 3x3 test image.
   - Rationale for "unchanged copy, no throw" being the correct contract
     (hand-traced, not assumed): with an out-of-range seed, `result[
     startIndex]` reads past the real `Uint8ClampedArray` bounds and returns
     `undefined`, so `targetColor` becomes `[undefined,undefined,undefined,
     undefined]`; every `colorsMatch` comparison then computes `Math.abs(px -
     undefined)` → `NaN`, and `NaN <= tolerance` is always `false`, so no
     pixel can ever match and nothing is ever painted. The traversal stack's
     own bounds check (`x < 0 || x >= width || y < 0 || y >= height →
     continue`) also immediately discards the out-of-range seed without
     touching a real pixel. Both mechanisms independently guarantee safety
     today; the tests exist to pin this down so a future change to either
     one (e.g. someone "helpfully" clamping the seed into range) is caught.
   - TDD-verified (twice — see code-review note below): temporarily clamped
     `startX`/`startY` via `Math.max(0, Math.min(dim - 1, coord))` both when
     computing `startIndex`/`targetColor` and when seeding the initial stack
     entry in `src/coloring/floodFill.ts`. First attempt (clamping only the
     `startIndex` computation, not the stack seed) did NOT fail the tests —
     caught this and fixed the sabotage to also clamp the stack seed, after
     which all 6 equality assertions across both new tests failed for the
     intended reason (a real flood-fill started from the clamped boundary
     pixel and changed real pixels). Restored the original production file
     exactly afterward; `git diff --stat` confirmed zero production-code
     change remained.
   - A code-review subagent reviewed the diff and found the reasoning sound
     but flagged a real gap: the first draft only had `toEqual(px)` equality
     assertions for the both-axes-out-of-range combos, leaving the
     single-axis-only combos checked with just `not.toThrow()` (a regression
     that mishandled only one axis, e.g. clamping Y but not X, could have
     slipped through undetected). Fixed by adding `toEqual(px)` assertions
     for the single-axis cases too, and re-ran the TDD sabotage to confirm
     those specific new assertions also catch the same class of regression
     (they did — the failure surfaced on the very first `toEqual` call in
     each test). No production bug was found; this is pure coverage
     addition, now closing the out-of-range-seed gap without a partial-
     coverage blind spot.
   - Commit: see `git log` on `overnight-improvements` branch, message
     `loop: add floodFill out-of-range-seed coverage`.

10. **loop: add floodFill tolerance-exact-boundary coverage** (iteration 8)
    - Files: `__tests__/coloring/floodFill.test.ts` (test-only change; no
      production code modified)
    - Checked first: read the full existing test file (8 tests as of
      iteration 7) and confirmed neither of iteration 7's two named `Next`
      candidates — tolerance-exact-boundary and a 1x1 image — were covered:
      none of the existing tests pass a custom `tolerance` argument (all use
      the default 10), and none use a 1x1 image. Picked
      tolerance-exact-boundary as the single focused improvement.
    - Test added (1): "treats a color difference exactly equal to tolerance
      as a match (inclusive boundary)" — a 1x3 image with a seed pixel, a
      neighbor whose red channel differs by exactly the given `tolerance`
      (5), and a third pixel differing by more (15); asserts the
      exactly-at-tolerance neighbor is filled and the beyond-tolerance pixel
      is not, pinning down `colorsMatch`'s `Math.abs(diff) <= tolerance` as
      genuinely inclusive.
    - TDD-verified: temporarily changed `colorsMatch` in
      `src/coloring/floodFill.ts` from `<= tolerance` to `< tolerance` on all
      four channel comparisons; the new test failed for the intended reason
      (the exactly-at-tolerance pixel stayed unfilled at its original color
      instead of the fill color). Restored the original production file
      exactly afterward; `git diff --stat` confirmed zero production-code
      change remained. The test passes against the real, unmodified
      implementation — no bug found, pure coverage addition.
    - A code-review subagent independently traced the flood-fill traversal
      order for the 1x3 buffer and confirmed the filled/filled/unfilled
      result pattern can only arise from the intended `<=` boundary
      semantics (not an unrelated mechanism like traversal order or
      visited-marking), confirmed this is the only test in the file using a
      non-default tolerance (genuinely new, non-overlapping coverage), and
      approved with no required changes.
    - Commit: see `git log` on `overnight-improvements` branch, message
      `loop: add floodFill tolerance-exact-boundary coverage`.

11. **loop: add floodFill 1x1-image coverage** (iteration 9)
    - Files: `__tests__/coloring/floodFill.test.ts` (test-only change; no
      production code modified)
    - Checked first: read the full existing test file (10 tests as of
      iteration 8... actually 9 before this addition) and confirmed no test
      uses a 1x1 image — this was iteration 8's own named `Next`
      recommendation and was confirmed still genuinely uncovered.
    - Test added (1): "fills a 1x1 image (single pixel, seed and only pixel
      are the same)" — a single white pixel filled red; asserts the pixel
      changes to the fill color, the returned array is a distinct reference
      (`not.toBe`), and the original input buffer is untouched.
    - TDD-verified: temporarily changed the traversal stack's initial seed to
      an empty array specifically when `width === 1 && height === 1` in
      `src/coloring/floodFill.ts`; the new test failed for the intended
      reason (pixel stayed white instead of turning red). Restored the
      original production file exactly afterward; `git diff --stat` confirmed
      zero production-code change remained. The test passes against the
      real, unmodified implementation — no bug found, pure coverage addition.
      This closes the last named gap in the floodFill pure-logic inventory
      (see table below).
    - A code-review subagent independently confirmed: the test exercises a
      genuinely distinct code path from all other fixtures (which are all
      3x3 or 1x3); all three assertions (fill color, copy semantics,
      non-mutation) are correct and non-redundant; no regression risk since
      1x1 dimensions can't trigger any special-cased behavior in the
      algorithm. Approved with no required changes (one optional nit — an
      explicit `result.length === 4` byte-count assertion — not applied,
      judged redundant with the existing `getPixel` read).
    - Commit: `8a940bb` — `loop: add floodFill 1x1-image coverage`.

12. **loop: replace as-any casts in loadQuestions with Record<string, unknown>**
    (iteration 9, Phase 1 item 9 — TODO/lint-smell audit)
    - Files: `src/quiz/loadQuestions.ts` (production code; test-only-adjacent
      in effect since it's a pure type-safety refactor with zero behavior
      change)
    - Audit method: grepped `src/` and `__tests__/` for
      `TODO|FIXME|HACK|TEMP|XXX`, `eslint-disable`, `ts-ignore`/
      `ts-expect-error`, `: any\b|as any\b`, `console.log`, and a
      commented-out-code heuristic (`^\s*//\s*(const|let|...)`). Findings:
      - Zero TODO-style markers anywhere in `src/` or `__tests__/`.
      - Zero `eslint-disable`, zero `ts-ignore`/`ts-expect-error`, zero
        `console.log` anywhere.
      - Two commented-out-code heuristic hits, both false positives on
        inspection (`src/coloring/ColoringScreen.tsx:29` and `:204`,
        `src/storage/folderAccess.ts:38` — all genuine explanatory prose
        comments, not dead code).
      - 8 `as any` occurrences total: 5 in `src/quiz/loadQuestions.ts`
        (production, untrusted-JSON type guards), 3 in
        `src/navigation/RootNavigator.tsx` (`({ route }: any) => ...` render
        props for `coloring-detail`/`puzzle-detail`/`video-detail` screens),
        and 3 more in test-helper parameter type annotations (not a
        production risk, left as-is — test-file `any` for loosely-typed
        mock/DOM-traversal helpers is a normal, low-risk pattern and out of
        scope for this audit's "safe, in-scope, minimal fix" bar).
    - Fix applied: replaced all 5 production `as any` casts in
      `loadQuestions.ts`'s type-guard functions (`isBilingualText`,
      `isValidOption`, `isValidQuestion`, `parseQuestionsFile`) with
      `as Record<string, unknown>`, which forces every property access to
      still go through an explicit `typeof`/`undefined` check (same as
      before) but gives the compiler real signal instead of blanket-silencing
      it. Also dropped two now-redundant `(o: QuestionOption)` parameter
      annotations on `.map`/`.some` calls that follow
      `q.options.every(isValidOption)` — confirmed (via `npx tsc --noEmit`
      staying clean with the annotations removed) that TypeScript 6.0.3's
      `Array.prototype.every` type-predicate narrowing flows `QuestionOption[]`
      through automatically, so the manual annotations were redundant, not
      load-bearing.
    - Verified zero behavior change: all 12 pre-existing tests in
      `__tests__/quiz/loadQuestions.test.ts` pass unchanged, `npx tsc
      --noEmit` clean, full suite 22/22 suites and 156/156 tests passing.
    - A code-review subagent independently ran `tsc` and the test file
      itself, confirmed the type-predicate narrowing is genuine (not an
      accidental `any` reappearing — proved by the fact that strict-mode
      property access on the narrowed array compiles, which is impossible on
      `unknown`), confirmed the refactor is behavior-identical, and confirmed
      no `as any` remains in the file. Approved with no required changes.
    - Explicitly did NOT touch `RootNavigator.tsx`'s three `any` route-prop
      casts in this pass — see Technical Decisions below for why (a quick
      experiment showed the narrow local fix doesn't type-check without a
      larger, riskier navigator-wide typing change).
    - Commit: `f258268` — `loop: replace as-any casts in loadQuestions with
      Record<string, unknown>`.

13. **loop: type RootNavigator's routes with a RootStackParamList** (iteration 10)
    - Files: `src/navigation/RootNavigator.tsx` (production code; pure
      type-safety refactor, zero behavior change)
    - Picked option (a) from iteration 9's `Next` note, since it was
      "well-scoped now that iteration 9 diagnosed the exact blocker."
      Re-read the full navigator file and all 7 `Stack.Screen` render-prop
      call sites (`Home`, `settings`, `quiz`, `coloring`, `coloring-detail`,
      `puzzle`, `puzzle-detail`, `video`, `video-detail` — 9 screens total,
      not 7; iteration 9's note undercounted the param-less ones) plus
      `HomeScreen.tsx`'s `HomeDestination` type before writing anything.
    - Fix: defined `RootStackParamList` mapping all 9 route names to their
      exact `params` shape (`undefined` for the 6 param-less routes,
      `{ imageUri: string }` for `coloring-detail`/`puzzle-detail`,
      `{ videoUri: string }` for `video-detail`), passed it as
      `createNativeStackNavigator<RootStackParamList>()`'s generic
      (previously called with none), and removed the 3 `({ route }: any) =>
      ...` casts — `route` in those 3 render props is now inferred as
      `RouteProp<RootStackParamList, RouteName>` with no cast needed.
      Iteration 9's local-fix experiment failed because it tried typing
      `route` inline without ever setting the navigator's own generic;
      setting the generic on `createNativeStackNavigator` itself (the one
      thing iteration 9 flagged as "the larger fix") was all that was
      actually required — no other file needed to change.
    - TDD-style verification (no dedicated type-test framework exists in this
      project, so verification was done directly via `tsc`, per the
      protocol's "type-level regression test" allowance): temporarily
      changed `route.params.imageUri` to `route.params.wrongProp` in the
      `coloring-detail` screen — `tsc --noEmit` correctly failed with
      `Property 'wrongProp' does not exist on type 'Readonly<{ imageUri:
      string; }>'`. This did NOT fail before the fix (it was silently
      swallowed by the `: any` cast). Restored and re-verified clean
      afterward (`git diff --stat` / `diff` against a saved backup showed
      the file was restored exactly before applying the real fix).
    - Important limitation discovered and documented in a code comment:
      the sibling `navigation` argument in the same render-prop callback is
      typed plain `any` by React Navigation's own `RouteConfigComponent`
      type (`node_modules/@react-navigation/core/lib/typescript/src/
      types.d.ts`, the `children:` field) regardless of the navigator's
      param-list generic — confirmed by reading that file directly, and by
      a follow-up sabotage test: misspelling a route name in a
      `navigation.navigate(...)` call (`'coloring-detaill'`) and passing a
      wrong param key (`{ wrongParam: imageUri }`) to a correctly-spelled
      route both compiled without error. So this fix genuinely closes the
      `route.params` `any`-cast gap (the thing iteration 9 found and this
      iteration was scoped to fix) but does NOT make
      `navigation.navigate(...)` call sites type-checked against the param
      list — that would need a custom-typed wrapper around every render
      prop's `navigation` argument, which is a materially larger, separate
      piece of work and out of scope here. Documented as a known residual
      gap rather than silently left unmentioned.
    - Verified zero behavior change: `npx tsc --noEmit` clean, full suite
      22/22 suites and 156/156 tests passing unchanged (including
      `__tests__/navigation/RootNavigator.test.tsx`, which only asserts
      header title/visibility behavior and needed no changes).
    - A code-review subagent independently re-verified the
      `RootStackParamList` shape against all 9 `Stack.Screen name=` sites
      and all `navigate(...)` call sites (via grep), independently
      re-verified the `navigation: any` upstream limitation claim by reading
      the same node_modules type file, ran `tsc --noEmit` and the existing
      navigation test file itself, and confirmed the diff is minimal with no
      unrelated changes. Approved with no required or optional changes.
    - Commit: see `git log` on `overnight-improvements` branch, message
      `loop: type RootNavigator's routes with a RootStackParamList`.

14. **loop: add a retry action to ColoringScreen's photo-load error state**
    (iteration 11, Phase 1 item 8 — error-state audit)
    - Files: `src/coloring/ColoringScreen.tsx` (production code) and
      `__tests__/coloring/ColoringScreen.test.tsx` (new file, 5 tests)
    - See the full write-up under Current Status above (Latest completed
      improvement) for the finding, TDD trace, and code-review outcome —
      not duplicated here to avoid drift between the two sections.
    - Summary: `ColoringScreen.tsx` had zero test coverage before this
      iteration. Its async photo-load effect was already correct (cancelled
      guard, try/catch, friendly localized error message) but, unlike
      `QuizScreen`/`ColoringGallery` which handle the identical SAF-failure
      category with a `retryToken`-driven Retry button, offered no recovery
      path at all. Added the same `retryToken` pattern plus a Retry button,
      and 5 new tests covering happy-path load, friendly-error-on-rejection,
      friendly-error-on-null-decode, retry-recovers, and
      setState-after-unmount (regression guard for the pre-existing
      `cancelled` flag). `tsc` clean, 23/23 suites, 161/161 tests. A
      code-review subagent approved with no required changes.
    - Commit: see `git log` on `overnight-improvements` branch, message
      `loop: add a retry action to ColoringScreen's photo-load error state`.

15. **loop: add a retry action to VideoPlayerScreen's playback-error state**
    (iteration 12, `Next` item 1 from iteration 11)
    - Files: `src/video/VideoPlayerScreen.tsx` (production code) and
      `__tests__/video/VideoPlayerScreen.test.tsx` (new file, 4 tests)
    - See the full write-up under Current Status above for the finding, TDD
      trace, and code-review outcome — not duplicated here to avoid drift.
    - Commit: `a67d544`.

16. **loop: add accessibilityLabel to the app's retry buttons** (iteration 12,
    `Next` item 3 from iteration 11)
    - Files: `src/quiz/QuizScreen.tsx`, `src/coloring/ColoringGallery.tsx`,
      `src/coloring/ColoringScreen.tsx` (production code, one prop pair each)
      and their 3 existing test files (one new assertion each, no new `it`
      blocks)
    - See the full write-up under Current Status above.
    - Commit: `78ea4c9`.

17. **loop: add an accessibilityLabel to the home screen's settings icon
    button** (iteration 14, Phase 2 item 3, `Next` item 1 from iteration 13)
    - Files: `src/home/HomeScreen.tsx` (production code, two props added)
      and `__tests__/home/HomeScreen.test.tsx` (one new test)
    - See the full write-up under Current Status above for the audit
      method, finding, TDD trace, and code-review outcome — not duplicated
      here to avoid drift.
    - Commit: `<see git log — loop: add an accessibilityLabel to the home
      screen's settings icon button>`.

18. **loop: label ColoringScreen's palette swatches for screen readers**
    (iteration 15, Phase 2 item 3, `Next` item 1 from iteration 14)
    - Files: `src/coloring/palette.ts` (production, additive `nameKey`
      field), `src/i18n/strings.ts` (production, 12 new keys x 2 languages),
      `src/coloring/ColoringScreen.tsx` (production, 3 accessibility props
      added to the existing swatch `Pressable`), and
      `__tests__/coloring/ColoringScreen.test.tsx` (2 new tests)
    - See the full write-up under Current Status above for the audit
      method, data-shape decision, i18n choices, TDD trace, and code-review
      outcome — not duplicated here to avoid drift.
    - Commit: `136d42f`.

## Pure-Logic Module Inventory (for future iterations)
Modules with pure/mostly-pure logic, current test coverage, and possible gaps:

| Module | Purpose | Existing tests | Possible future edge cases |
|---|---|---|---|
| `src/coloring/floodFill.ts` | Flood-fill fill algorithm on RGBA buffer | `__tests__/coloring/floodFill.test.ts` (10 tests as of iteration 9) — now also covers out-of-range seed coordinates, the tolerance-exact-boundary case, and the 1x1-image case | no further named gaps identified; a "fully-filled image, no border at all" case would be redundant with the existing no-op/re-tap tests (same code path) |
| `src/coloring/base64.ts` | Dependency-free base64 decoder | `__tests__/coloring/base64.test.ts` | invalid/malformed base64 input (non-multiple-of-4 length without padding), empty string, whitespace-only input |
| `src/coloring/palette.ts` | Static color palette data (`display`/`fill`/`nameKey` per entry) | indirectly covered via `__tests__/coloring/ColoringScreen.test.tsx`'s palette-label tests (iteration 15) | could still add a smoke test asserting no duplicate `fill` values, valid RGBA ranges, and that every `nameKey` resolves to a non-empty string in both languages |
| `src/puzzle/puzzleGrid.ts` | Board sizing, grid dimensions, piece rects, row grouping, shuffle-with-guaranteed-non-identity | `__tests__/puzzle/puzzleGrid.test.ts` (34 tests as of iteration 6) — now also covers `groupPiecesIntoRows`'s ragged-final-row and shorter-than-`cols` cases | `computePuzzleBoardSize`'s "insets exceed window entirely" case assessed in iteration 4: judged equivalent in code-path terms to the existing "floors to the minimum size when the window is very small" test; not treated as a real gap. No further known gaps in this module as of iteration 6. |
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
Iteration 16 priority: the accessibility-label pass on every retry button
(all 7, iterations 12-13), the app's one unambiguous icon-only-control gap
(the home settings-icon button, iteration 14), and the palette-swatch
accessibility labels (iteration 15) are now all complete. Remaining options,
in priority order:
1. **`palette.ts` smoke test (small, optional fast-follow from iteration
   15).** No dedicated test file exists for `src/coloring/palette.ts`
   itself — its `nameKey`/`display`/`fill` correctness is currently only
   exercised indirectly through `ColoringScreen.test.tsx`'s two palette
   tests (which check 4 of the 12 colors' labels, not all 12, and don't
   check for accidental duplicate `fill`/`display` values or malformed RGBA
   tuples). A small `__tests__/coloring/palette.test.ts` asserting, for all
   12 entries: `fill`/`display` correspond to the same color, no duplicate
   `fill` values, every RGBA channel in `[0,255]`, and every `nameKey`
   resolves to a non-empty string in both `en`/`de` via `t()` — would close
   this out cheaply (pure data validation, no production code change
   expected).
2. **Optional smaller follow-up (unchanged from iteration 10)**: the
   `navigation.navigate(...)` call sites in `RootNavigator.tsx` and
   `HomeScreen.tsx` remain untyped against `RootStackParamList` because
   React Navigation's `RouteConfigComponent` type declares that render-prop's
   `navigation` argument as plain `any` regardless of the navigator's
   generic — see Completed #13 and Technical Decisions for the full trace.
   Closing this would need a custom-typed wrapper around each render prop's
   `navigation` argument (e.g. casting
   `navigation as NativeStackNavigationProp<RootStackParamList, RouteName>`
   once per screen, or a small typed-navigate helper) — judged a separate,
   smaller-value piece of work, not bundled into any iteration so far to
   keep each diff minimal and focused.
3. If the above turn out unfruitful or too large to safely scope in one
   iteration, move toward Phase 2 (accessibility/child-safety) more broadly:
   the Phase 1 baseline, pure-logic inventory, TODO/lint-smell audit, the
   error-state audit (all 5 async-loading screens), and now the retry-button
   accessibility-label pass are all substantially covered.
(The pre-existing, already-documented `PuzzleScreen.test.tsx` act() warning
under BLOCKED below is a related but separate test-hygiene item, not itself
part of the error-state audit.)

## Visual Review Required
- Iteration 15's `ColoringScreen` palette-swatch accessibility changes
  (`accessibilityLabel`/`accessibilityRole`/`accessibilityState`) are
  invisible on-screen — no new visual indicator was added or changed; the
  pre-existing border/scale "selected" styling is unchanged. No visual
  review needed for this iteration's change. Recommended (not required)
  real-device check: with TalkBack/VoiceOver enabled on the Galaxy S22,
  swipe through the palette strip in both English and German and confirm
  each swatch announces its color name and selected/not-selected state
  correctly — this iteration could only verify the underlying props via
  Jest's accessibility-prop assertions, not real screen-reader announcement
  behavior end-to-end.
- **`VideoPlayerScreen`'s new Retry button** (iteration 12): appears only
  when `expo-video` reports a `statusChange` event with `status: 'error'`
  (e.g. a corrupted/unsupported video file, or the SAF grant to the videos
  folder being revoked mid-playback). Styled identically to the existing
  `ColoringScreen`/`QuizScreen` retry buttons (coral background, dark-coral
  border, rounded, drop shadow) but never rendered on a real device by this
  iteration — no emulator/device available in this environment. Please check
  on the Galaxy S22, in both English ("Retry" / "This video could not be
  played.") and German ("Erneut versuchen" / "Dieses Video konnte nicht
  abgespielt werden."), that: (a) the button is easy for a small child to tap
  in landscape orientation, (b) tapping it actually resumes playback of a
  real video file after a real transient failure (this iteration only
  verified the retry *calls* `player.replace`/`player.play` correctly via a
  mocked player — it could not verify real `expo-video` playback recovery
  end-to-end, since `expo-video` itself isn't testable under this project's
  Jest setup), and (c) the layout still respects the screen's safe-area
  insets on a real notch/gesture-nav device.
- No other UI changes iteration 12 introduced (the accessibility-label
  addition is invisible on-screen — `accessibilityLabel` only affects screen
  readers/TalkBack, not visual layout).
- Iteration 13's accessibility-label additions to `PuzzleGallery`,
  `VideoGallery`, `RootNavigator`'s `FolderErrorScreen`, and
  `VideoPlayerScreen`'s retry buttons are likewise invisible on-screen — no
  visual review needed for this iteration's changes specifically. No new
  UI, no new screens.

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
- Iteration 15: kept "Orange" and "Pink" identical in English and German
  rather than substituting a "more German" alternative (e.g. "Rosa" for
  pink) — both are fully naturalized loanwords in everyday German
  (including children's usage) and a code-review subagent independently
  confirmed this reads as intentional/idiomatic, not an untranslated
  oversight. Also chose to wire `accessibilityState={{ selected }}` onto the
  existing swatch `Pressable` rather than adding any new visual
  selected-indicator, since `ColoringScreen.tsx` already had a correct
  visual indicator (thicker border + 1.12x scale) satisfying the "more than
  color alone" requirement before this iteration — only the screen-reader
  gap was open.
- Iteration 14: chose to fix only the home settings-icon button and defer the
  12 `ColoringScreen` palette swatches rather than doing both in one
  iteration, and rather than doing neither. The task brief's scoping rule
  was "fix ALL icon-only controls in a single well-scoped cohesive area" OR
  "fix the single highest-value gap, document the rest" — a full repo-wide
  icon-only audit found exactly one unambiguous, cheap, high-value gap (the
  settings button — the app's only path to Settings, a one-line-diff fix
  reusing an existing i18n key) and one much larger, more heterogeneous gap
  (12 palette swatches needing 24 new i18n strings and a small data-shape
  change to `palette.ts`). Bundling both into one diff would have made the
  settings-button fix's review harder to isolate from the larger palette
  change's own judgment calls (color-naming choices, `PaletteColor` type
  shape). Splitting them keeps each diff minimal, reviewable, and safely
  revertible independently — consistent with every prior iteration's
  approach to "found a bigger related gap mid-task" (e.g. iteration 12's
  retry-button-label decision, iteration 9's `RootNavigator` `any`-cast
  decision).
- Iteration 12: chose `player.replace(videoUri)` + `player.play()` as
  `VideoPlayerScreen`'s retry action instead of trying to force-mimic the
  `retryToken`-bump pattern every other screen uses. That pattern works
  because those screens' error state comes from a `useEffect` that runs a
  fresh fetch/read on every dependency-array change; `VideoPlayerScreen`
  doesn't have such an effect — `useVideoPlayer(videoUri, setup)` creates one
  long-lived player object for the component's whole life, and bumping some
  unrelated state wouldn't make it re-attempt loading. `replace()` is
  `expo-video`'s own documented API for telling an existing player to
  re-attempt a (possibly the same) source, so it's the direct semantic
  equivalent of "try loading this again" for this specific API shape, not a
  workaround.
- Iteration 12: scoped the accessibility-label follow-up to exactly the 3
  retry buttons iteration 11's note named, even though a repo-wide grep
  during this iteration found 4 more retry buttons with the same gap
  (`PuzzleGallery`, `VideoGallery`, `RootNavigator`'s `FolderErrorScreen`,
  and this iteration's own new `VideoPlayerScreen` button). Judged that
  silently expanding scope mid-iteration (even to fix "more of the same
  thing") risks a larger, less-reviewable diff than intended, and iteration
  11's note was specific about which three it meant. Documented the other 4
  explicitly in `Next` above as a fast, well-scoped follow-up rather than
  either quietly doing them all or quietly leaving them undocumented.
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

- Iteration 5: picked `shufflePieceOrder`'s `pieceCount === 2` case exactly
  as iteration 4 recommended, since it was confirmed genuinely uncovered on
  inspection (existing identity-fallback test only loops `[4, 6, 9, 12]`).
  Note: `pieceCount` is typed as a plain `number` in `shufflePieceOrder`'s own
  signature (unlike `computeGridDimensions`, which restricts to the literal
  union `4 | 6 | 9 | 12`), and the actual UI (`PieceCountPicker` /
  `PuzzleScreen`) only ever offers 4/6/9/12 — so `pieceCount === 2` is not a
  real user-reachable difficulty tier today. It's still worth testing as the
  mathematically tightest edge case of the shuffle function's own general
  contract (smallest N for which shuffling/non-identity is meaningful at
  all, with only 2 possible permutations), and it's cheap regression
  insurance if a future "very easy" 2-piece mode is ever added.

- Iteration 9: investigated fixing `RootNavigator.tsx`'s three
  `({ route }: any) => ...` casts as part of the TODO/lint-smell audit's
  `as any` findings. Tried the narrowest possible local fix — typing just the
  destructured `route` param inline as `{ route: { params: { imageUri:
  string } } }` without touching `createNativeStackNavigator()`'s generic —
  and confirmed via `npx tsc --noEmit` that it does NOT type-check: React
  Navigation's `Stack.Screen` children prop type is `(props: { route:
  RouteProp<ParamListBase, "...">; navigation: any }) => ReactNode`, and
  `RouteProp<ParamListBase, ...>`'s `params` is `Readonly<object | undefined>`
  — not assignable to a concrete `{ imageUri: string }` shape without
  widening the whole navigator's generic. A real fix requires defining a
  `RootStackParamList` type and passing it to
  `createNativeStackNavigator<RootStackParamList>()`, which would also
  affect every other `Stack.Screen`/`navigation.navigate(...)` call site in
  the file (7 screens total) — correctly typing all of them in one
  iteration, verifying no regression, and getting a careful review is more
  scope than this iteration's "minimal, focused fix" budget allows safely.
  Reverted the experiment (confirmed `git diff --stat` showed no change
  remaining) and documented it as iteration 10's top option instead of
  forcing a partial or unsafe fix. The 3 `any` casts remain in production
  code but are low-risk as-is: they're narrowly scoped to 3 read-only
  `route.params` destructures with a stable, hand-verified shape (both
  `navigation.navigate(...)` call sites and the screens that read them
  agree on `{ imageUri: string }` / `{ videoUri: string }`), not a
  general-purpose unsafe cast.

- Iteration 10: resolved iteration 9's deferred `RootNavigator.tsx` item.
  Iteration 9's blocker analysis turned out to be solvable exactly the way it
  predicted — setting `createNativeStackNavigator<RootStackParamList>()`'s
  generic was the one change needed, and once done the 3 `route`-typing
  casts came out cleanly with no other file touched. The "affects every
  other `Stack.Screen`/`navigation.navigate(...)` call site" concern from
  iteration 9 turned out to be only half true: `route.params` typing does
  propagate correctly to every screen, but `navigation.navigate(...)` call
  sites do NOT get checked against the param list at all, because React
  Navigation's `RouteConfigComponent` type hard-codes that render prop's
  `navigation` argument as `any` independent of the navigator's generic
  (verified by reading `node_modules/@react-navigation/core/lib/typescript/
  src/types.d.ts` directly, and by two sabotage tests: a misspelled route
  name and a wrong param key in `navigate(...)` calls both compiled without
  a `tsc` error). So this iteration's fix closes exactly the `as any` gap
  iteration 9 found (a real, if narrow, win) but does not deliver the
  broader "navigation becomes fully type-checked" outcome iteration 9's
  `Next` note speculated about — that would need a separate, additional
  piece of work (see `Next` above), not something this iteration attempted
  or claims to have done.

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
- What changed (iteration 14, one commit): added `accessibilityRole="button"`
  and `accessibilityLabel={t('settingsTitle')}` to `src/home/HomeScreen.tsx`'s
  settings gear-icon button (the app's only path to Settings), plus one new
  test in `__tests__/home/HomeScreen.test.tsx` confirming the label is
  screen-reader-queryable and still navigates correctly.
- What's valuable: before this fix, a screen-reader user on the home screen
  (the app's landing screen, with no native header) would hear nothing
  useful when focusing the gear icon — no way to discover it opens Settings,
  and no other affordance reaches Settings at all. This closes that dead end
  with zero new i18n strings (reused the existing `settingsTitle` key,
  which conveniently matches the destination screen's own header title).
- What needs visual testing: nothing — `accessibilityLabel` is
  screen-reader-only and has no visual effect. No new UI, no layout change.
- Risks: none identified. `tsc` clean, 24/24 suites and 167/167 tests passing
  (166 baseline + 1 new), no existing test touched/skipped/renamed. A
  code-review subagent independently verified the i18n key's actual string
  value, confirmed the test's `findByLabelText('Settings')` query is
  unambiguous on this screen, and confirmed the scope decision to defer the
  12-swatch palette-color-labeling task (a materially larger, separate piece
  of work) was correct. Approved with no required or optional changes.
- Open questions for the developer: none blocking. The 12 `ColoringScreen`
  palette-color swatches still have no accessible name (screen-reader users
  can't tell which color a given swatch is) — see `Next` above for the
  scoped follow-up (needs 24 new i18n strings and a small `palette.ts`
  data-shape addition, judged too large to bundle into this iteration's
  single-button fix).
- What changed (iteration 12, two commits): (1) added a Retry button and
  handler to `src/video/VideoPlayerScreen.tsx`'s playback-error state (the
  screen's first-ever test coverage, 4 new tests in
  `__tests__/video/VideoPlayerScreen.test.tsx`) — same category of fix as
  iteration 11's `ColoringScreen` gap, this time for video playback errors;
  (2) added `accessibilityLabel`/`accessibilityRole="button"` to the 3 retry
  buttons iteration 11's code review flagged (`QuizScreen`,
  `ColoringGallery`, `ColoringScreen`), with a test assertion each confirming
  the label renders.
- What's valuable: before commit 1, if a video failed to play (corrupted
  file, unsupported codec, SAF grant revoked, SD card unmounted — all
  plausible real events), the only recovery was navigating away and back via
  the header — the exact same dead-end pattern iteration 11 fixed in
  `ColoringScreen`, and inconsistent with `VideoGallery` (one screen up) 
  already having a working Retry button for the identical failure category.
  Before commit 2, none of the app's retry buttons were exposed to
  screen readers with a proper accessible name (TalkBack would likely read
  nothing useful, or fall back to reading raw internal text) — a real
  accessibility gap for any child or parent using an assistive device.
- What needs visual testing: see "Visual Review Required" above —
  specifically the new `VideoPlayerScreen` Retry button's real-device
  behavior (tap target size in landscape, actual playback recovery on a real
  `expo-video` player, safe-area layout), since `expo-video` itself can't be
  exercised in this Jest environment (confirmed via
  `RootNavigator.test.tsx`'s own pre-existing comment about it not being
  mockable/transformable, and independently by writing this iteration's own
  lower-boundary mock). The accessibility-label change has no visual effect
  (screen-reader-only), so nothing to check visually there.
- Risks: none identified. `tsc` clean, 24/24 suites and 165/165 tests
  passing (161 baseline + 4 new), no existing test touched/skipped/renamed.
  A code-review subagent independently verified `player.replace`/`play` are
  synchronous void-returning `expo-video` APIs (no async/throw hazard),
  confirmed the existing unmount-cleanup logic still works correctly, and
  confirmed the new mock genuinely exercises the screen's real logic rather
  than faking it; one optional review suggestion (assert `player.play` was
  called on retry) was applied before committing. The accessibility commit
  was self-reviewed only, being a mechanical, low-risk, single-prop-per-file
  change with an already-existing localized string reused (no new i18n
  strings, no behavior change).
- Open questions for the developer: none blocking. Four more retry buttons
  in the app (`PuzzleGallery`, `VideoGallery`, `RootNavigator`'s
  `FolderErrorScreen`, and this iteration's new `VideoPlayerScreen` button)
  still lack an `accessibilityLabel` — deliberately left out of this
  iteration's accessibility pass to keep it minimal and matching exactly
  what iteration 11 named; see `Next` above for the fast follow-up.
- What changed (iteration 11, one commit): a small production-code fix in
  `src/coloring/ColoringScreen.tsx` (added a `retryToken` state and a Retry
  button to the photo-load error state) plus a new test file,
  `__tests__/coloring/ColoringScreen.test.tsx` (5 tests — the screen's first
  ever test coverage). This closes Phase 1 item 8 (error-state audit) for
  the last of the three named candidate screens.
- What's valuable: before this fix, if a coloring photo failed to load (SAF
  grant revoked, file deleted externally, SD card unmounted — all plausible
  real-world events, not hypothetical), the only way for a child/parent to
  recover was to navigate away and back in via the header. Every other
  screen in the app that handles this exact failure category
  (`QuizScreen`, `ColoringGallery`) already offered an in-place Retry
  button; `ColoringScreen` was the one inconsistent dead end. Also valuable:
  the screen had zero test coverage before this iteration (nothing verified
  its already-correct `cancelled`-flag/try-catch/friendly-message behavior),
  so this iteration both fixed a real gap and locked in the previously
  correct-but-unverified behavior with tests.
- What needs visual testing: the new Retry button's appearance/tap target
  on the actual coloring-photo-load-error screen (styled to match
  `QuizScreen`'s existing retry button, but never rendered on a real device
  by this iteration — no emulator available in this environment).
- Risks: none identified. `tsc` clean, 23/23 suites and 161/161 tests
  passing (156 baseline + 5 new), no existing test touched/skipped/renamed,
  and a code-review subagent independently verified the retryToken pattern
  is consistent with `QuizScreen`'s and that rapid repeated retry taps
  can't race (each effect run's `cancelled` closure is set by React's
  cleanup before the next run starts).
- Open questions for the developer: none blocking. A code-review subagent
  flagged (optional, not required) that none of the app's three retry
  buttons have an `accessibilityLabel`/`accessibilityRole` — a pre-existing,
  consistent gap, not introduced by this change. Worth a dedicated
  accessibility pass across all three if you want screen-reader support
  there; see `Next` above.
- What changed (iteration 10, one commit): one small production-code commit
  to `src/navigation/RootNavigator.tsx` — added a `RootStackParamList` type
  covering all 9 routes, passed it to `createNativeStackNavigator<...>()`
  (previously untyped), and removed the last 3 `as any` casts in the file
  (on the `coloring-detail`/`puzzle-detail`/`video-detail` screens'
  `route.params` destructures). Pure type-safety refactor, zero behavior
  change — `tsc` clean, 22/22 suites and 156/156 tests unchanged. This closes
  the item iteration 9 deferred as too large; it turned out to be exactly as
  scoped as iteration 9 predicted (one generic parameter, no other files
  needed changing).
- What's valuable: `route.params.imageUri`/`videoUri` in those 3 screens are
  now genuinely compiler-checked instead of silently trusted via `any` — a
  future rename of `imageUri`/`videoUri` anywhere in the param shape, or a
  typo in one of the 3 `navigate(...)` calls that construct these params,
  will now surface as a `route.params.<wrongName>` compile error in the
  receiving screen (hand-verified via a temporary sabotage edit).
- Important caveat found and documented (not a regression, a pre-existing
  library limitation now made visible): `navigation.navigate(...)` call
  sites themselves (in this file and in `HomeScreen.tsx`) are still NOT
  type-checked against the route/param list, because React Navigation's own
  type for this render-prop's `navigation` argument is plain `any`
  regardless of the navigator's generic. So a misspelled route name in a
  `navigate(...)` call would still silently compile today — this is an
  upstream library type-system gap, not something introduced by or fixable
  within this change. Flagged in `Next` as an optional, separate follow-up
  if a future iteration wants to close it via a small typed-navigate helper.
- What needs visual testing: nothing from this iteration (pure type-level
  change, zero runtime/UI behavior modified — every screen still receives
  the exact same `imageUri`/`videoUri` values at runtime as before).
- Risks: none identified. Verified via `tsc --noEmit`, the full existing test
  suite (unchanged pass count), and an independent code-review subagent that
  re-derived the `RootStackParamList` shape from the actual call sites and
  re-verified the `navigation: any` caveat by reading the same library type
  definitions.
- Open questions for the developer: none blocking. If the residual
  `navigation.navigate(...)` typing gap described above is worth closing,
  see `Next` above for the smallest approach found (a per-screen
  `navigation as NativeStackNavigationProp<RootStackParamList, RouteName>`
  cast or a small typed-navigate helper) — not attempted this iteration to
  keep the diff minimal and focused on the specific `as any` casts iteration
  9 identified.
- What changed (iteration 9, two commits): (1) one test-only commit adding 1
  test to `__tests__/coloring/floodFill.test.ts` covering the 1x1-image case
  — closes the last named gap in the floodFill inventory; (2) one small
  production-code commit replacing 5 `as any` casts with
  `as Record<string, unknown>` in `src/quiz/loadQuestions.ts`'s untrusted-JSON
  type guards, a pure type-safety refactor with zero behavior change (all 12
  pre-existing tests pass unchanged). Also did a full TODO/FIXME/eslint-
  disable/ts-ignore/console.log audit across `src/` and `__tests__/` — found
  nothing else needing action, and documented 3 remaining `any` casts in
  `RootNavigator.tsx` (route-prop typing) as a deliberately deferred,
  larger-scoped fix for iteration 10 rather than forcing a narrow fix that a
  quick experiment showed doesn't type-check.
- What's valuable: the `loadQuestions.ts` change makes the parser's defenses
  against malformed on-device `questions.json` data (a file a parent could
  in principle hand-edit or a sync tool could corrupt) real compiler-checked
  property access instead of blanket-silenced `any`, with no behavior
  change — safer to extend in future iterations without an `any` cast
  silently accepting a typo.
- What needs visual testing: nothing from this iteration (test-only +
  internal type-safety refactor, no UI or runtime behavior touched).
- Risks: none identified. Both changes were verified test-count-neutral or
  test-count-increasing, tsc-clean, and independently code-reviewed.
- Open questions for the developer: none blocking. If you'd like the
  `RootNavigator.tsx` route-typing fix done as its own dedicated task rather
  than an overnight-loop iteration, it's a good candidate — see Technical
  Decisions above for the exact scope (a `RootStackParamList` type touching
  all 7 screens in that file).
- What changed (iteration 8): one test-only commit adding 1 test to
  `__tests__/coloring/floodFill.test.ts` covering the tolerance-exact-boundary
  case in `colorsMatch` (a color diff exactly equal to `tolerance` must
  count as a match, per the `<=` comparison). No production/runtime code
  changed. No UI changed. Confirms a real child-usability detail: the
  coloring tool's "closeness" fuzziness at the tolerance's exact edge
  behaves as designed (inclusive), which affects how forgiving flood-fill is
  near anti-aliased line-art edges.
- What changed (iteration 7): one test-only commit adding 2 tests (6
  assertions) to `__tests__/coloring/floodFill.test.ts` covering out-of-range
  seed coordinates passed to `floodFill` (negative and `>= width`/`height`,
  including single-axis-only combinations). No production/runtime code
  changed. No UI changed.
- What's valuable: confirms (by hand-tracing the actual read-past-bounds →
  `undefined` → `NaN` comparison mechanism, not just by running it) that a
  bad/out-of-range coordinate reaching `floodFill` — e.g. from a rounding
  bug or a bad touch-to-pixel mapping elsewhere in the coloring screen —
  cannot crash the app or corrupt the canvas; it safely no-ops instead. This
  is a real child-safety-adjacent guarantee (a coloring-page crash mid-tap is
  a bad experience for a young child) that was previously unverified by any
  test. Also worth noting for reviewers: a code-review subagent caught a
  real gap in the first draft (single-axis-out-of-range combos were only
  checked with `not.toThrow()`, not equality) before it was committed — see
  Completed #9 for the full trace.
- What needs visual testing: nothing from this iteration (test-only, pure
  buffer-algorithm logic, no rendered UI touched).
- Risks: none identified — intentionally conservative, test-only iteration.
  Two rounds of TDD sabotage-and-restore were run against
  `src/coloring/floodFill.ts`; `git diff --stat` confirmed no production
  change remains either time.
- Open questions for the developer: none blocking. Java version note (still
  applies from earlier iterations): your default global `java -version`
  reports JDK 25; the project needs JDK 17 for Android/Gradle builds
  specifically, and `.sdkmanrc` + `sdk env` handles that per-shell already —
  no action needed unless you want JDK 17 as your global default too (not
  changed by this loop, per hard limits on shell config).
