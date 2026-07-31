# Overnight Improvement Progress

## Current Status
- Phase: 4 (original-spec fast-follow items), Iteration: 29
- Latest completed improvement (iteration 29, two commits): completed Phase 4
  item 5 (optional child profile picture) end to end — both halves iteration
  28 deliberately deferred (the picker UI and the HomeScreen display) landed
  in this single iteration, following iteration 28's own concrete plan in
  Next almost exactly.
  - Read `ColoringGallery.tsx`/`PuzzleGallery.tsx` fully first, confirmed
    they're byte-for-byte the same folder-listing pattern (loading/error/
    empty states, SAF `readDirectoryAsync`, a Retry affordance on failure)
    just parameterized over a different folder/i18n key, and confirmed via
    `RootNavigator.tsx` that `folderUris.pictures` (the "pictures" SAF
    subfolder) is the exact folder PuzzleGallery already lists from — i.e.
    the "already-configured pictures folder" the brief pointed at.
  - **Part A (`<see git log>`) — the picker UI in Settings.** New
    `src/settings/ProfilePicturePicker.tsx`, a `Modal`-based picker
    (matching `AgePicker.tsx`'s existing transparent-overlay Modal
    convention rather than inventing a second modal pattern) that lists
    `picturesFolderUri` with the identical loading/error/empty/retry states
    as the two existing galleries. Wired into `SettingsScreen.tsx`: a new
    "Profile Picture" card showing either a circular preview (or a
    placeholder circle if unset/failed-to-load) plus "Choose a picture"
    (opens the modal) and, only when a picture is set, "Remove picture".
    Selecting/removing only updates local `profile` state — exactly like
    name/age/language above it — so nothing is written to `AsyncStorage`
    until the existing "Save changes" button is pressed; a mis-tap on a
    thumbnail is therefore low-stakes. `SettingsScreen` and
    `ProfilePicturePicker` both gained a `picturesFolderUri` prop
    (`SettingsScreen`'s is optional, defaulting the whole feature to hidden,
    so none of iteration <29's existing `<SettingsScreen />`-with-no-props
    tests needed touching); `RootNavigator.tsx` now passes
    `folderUris.pictures` in for the real app.
    - **Double-tap guard**: `ProfilePicturePicker`'s `handleSelect` uses a
      `useRef` (not `useState`) flag, set synchronously on the very first
      tap — a real back-to-back double-tap (two `onPress` calls dispatched
      before any re-render) only calls `onSelect` once. A `useState` flag
      would NOT have been sufficient here (both taps would still read the
      pre-update value before React re-renders); confirmed by a dedicated
      test and by the independent code-review agent.
    - **Stale-file handling split across two layers, deliberately**: the
      picker itself does not re-verify a tapped file still exists (that
      failure mode is already owned by `resolveProfilePictureUri` at
      *display* time — iteration 28's own data-layer slice); Settings'
      preview `<Image>` additionally gets its own `onError` guard (a new
      `previewFailed` state, reset whenever `profile.pictureUri` changes)
      so a stale/broken preview in Settings itself never shows a broken-
      image icon either, mirroring the exact same defensive pattern.
    - **Accessibility / no personal-metadata leak**: each thumbnail's
      `accessibilityLabel` is generic and index-based (`"Choose a picture
      2"`, etc.) rather than the raw filename — a photo's filename can
      itself carry personal metadata (e.g. "birthday-party-grandma.jpg")
      that has no business being read aloud by a screen reader.
  - **Part B (`<see git log>`) — HomeScreen display wiring.** `HomeScreen`
    gained an optional `pictureUri` prop (the raw `Profile.pictureUri`,
    resolved — existence-checked — via `resolveProfilePictureUri()` in a
    `[pictureUri]`-keyed effect with the same `cancelled` race-guard
    convention used throughout this codebase's async effects) rendered as a
    small circular avatar inside the existing `greetingBadge`, to the left
    of the child's name. Falls back to a same-sized placeholder circle with
    the child's first initial (not a broken-image icon) for BOTH "never
    set" and "file went missing" (both resolve to `null`) AND a third case
    this iteration added on top — a real `<Image onError>` handler for
    "file exists but fails to actually decode/load" — so all three failure
    classes converge on the same graceful fallback. Purely decorative: a
    plain `<Image>`/`<View>` with a real `accessibilityLabel`
    (`homeProfilePictureLabel`/`homeProfilePicturePlaceholderLabel`), never
    a `Pressable`, so a child cannot accidentally trigger anything by
    tapping it (matches iteration 28's own Next-section guidance not to
    make it tappable without dedicated design/testing). `RootNavigator.tsx`
    now passes `profile.pictureUri` in for the real app.
    - **Screen-fit**: a new `AVATAR_SIZE = 28` constant, deliberately
      chosen so `greetingBadge`'s own `paddingVertical: spacing.xs` (4px
      per side, 8px total) plus the avatar comes to ~36px of badge content
      height — comfortably under the `SETTINGS_BUTTON_SIZE = 44` constant
      `headerReserve` derives the whole header row's reserved height from.
      Avatar and its placeholder share one base style so the badge's
      height never differs between the two states (no layout jump when a
      picture is picked/removed). Verified this is the correct binding
      constant to check against by rereading `headerReserve`'s formula
      before picking `AVATAR_SIZE`, not just assuming a value looked safe.
  - **New EN+DE i18n keys** (`src/i18n/strings.ts`, same commits):
    `cancel` (generic, deliberately not reusing the scoped
    `clearDrawingConfirmCancel`/`migrationConfirmCancel`),
    `settingsProfilePicture`, `profilePictureChoose`, `profilePictureRemove`,
    `profilePicturePickerTitle`, `homeProfilePictureLabel` (`{name}`
    interpolated via the existing `tFormat`), `homeProfilePicturePlaceholderLabel`.
  - Baseline before this iteration: tsc clean, 27/27 suites, 244/244 tests.
  - After this iteration: tsc clean, **28/28 suites** (new
    `__tests__/settings/ProfilePicturePicker.test.tsx`), **262/262 tests**
    (+18: 7 picker tests — list+select, no-list-while-hidden, empty state,
    retry-after-SAF-failure, cancel-without-select, non-leaking thumbnail
    labels, re-lists-on-reopen; 5 new SettingsScreen tests — hidden without
    a folder, pick-then-stage-then-save, remove-then-save, broken-preview
    fallback, cancel-leaves-picture-untouched; 6 new HomeScreen tests —
    placeholder-when-unset, shows-picture-when-set, placeholder-when-file-
    missing, placeholder-on-image-onError, accessible-label-and-not-
    tappable, re-resolves-on-pictureUri-change). No existing test modified,
    weakened, skipped, or renamed — `SettingsScreen.test.tsx`'s and
    `HomeScreen.test.tsx`'s existing tests all still pass unchanged with no
    `picturesFolderUri`/`pictureUri` prop, confirming the whole feature
    degrades gracefully to "hidden"/"placeholder-only" when absent.
  - A code-review subagent independently reviewed the diff: confirmed the
    `useRef`-based double-tap guard is genuinely necessary (a `useState`
    flag would not have blocked a true back-to-back double-tap) and is
    correctly wired; confirmed picture selection is staged into local
    state and never persisted before "Save changes"; confirmed
    remove-picture correctly ends up with no `pictureUri` key at all in
    persisted storage (via `saveProfile`'s existing `JSON.stringify`
    dropping `undefined`-valued keys, established in iteration 28);
    confirmed thumbnail/avatar accessibility including the no-filename-leak
    labeling and that the avatar is genuinely non-interactive; confirmed
    full EN+DE localization coverage with no hardcoded English left in the
    new components; confirmed the `AVATAR_SIZE`/`headerReserve` screen-fit
    math independently; confirmed the Fragment wrapping added around
    `SettingsScreen`'s `<ScrollView>` is correctly balanced; confirmed no
    hard-limit violations (no new deps, no unsafe casts, no new
    permissions beyond the already-granted "pictures" SAF folder, no
    existing test weakened); and independently re-ran `npx tsc --noEmit`
    (clean) and the full suite (28/28 suites, 262/262 tests, confirming
    the only console output is the same pre-existing benign
    not-wrapped-in-act warning class already present in
    `PuzzleScreen.test.tsx`, not a new regression). Approved with no
    required changes (non-blocking nit: test coverage is already thorough,
    nothing meaningfully missing).
  - Commits: `<see git log — loop: add a Settings picker UI for the
    optional profile picture>`, `<see git log — loop: show the profile
    picture (or a fallback avatar) on HomeScreen>`.
- Previous iteration's completed improvement (iteration 28, two commits): a two-part
  iteration per this iteration's own brief ordering.
  - **Part A (`a1af79a`) — coloring toolbar row screen-fit.** Read
    `ColoringScreen.tsx`'s toolbar row (Fill/Pen/conditional Undo/conditional
    Clear drawing, a plain `flexDirection: 'row'` with no wrap/scroll, above
    the horizontally-scrolling palette) and hand-computed a worst case: up
    to 4 buttons can be visible together (after both a flood-fill tap and a
    pen stroke — confirmed independent triggers from iteration 27's own
    tests), and German text runs noticeably longer than English
    (`clearDrawing`'s "Zeichnung löschen" is the longest string, no emoji).
    Estimating character width at ~8.5px/char (bold ~14pt default RN Text)
    plus each button's real `paddingHorizontal: spacing.md` (16px/side),
    `borderWidth: 2` (2px/side), and inter-button `spacing.sm` (8px) gaps,
    the worst-case row needs roughly **565-600px** of content width, plus
    the footer's own `paddingHorizontal: spacing.md` (32px total) on top.
    Confirmed `RootNavigator.tsx` still locks orientation to `LANDSCAPE` via
    `expo-screen-orientation` before revealing the app shell, so — exactly
    as iteration 20 established for the quiz progress-dots row — the
    binding width is the device's landscape width, typically 600-900dp for
    a normal phone. Unlike iteration 20's dots row (a confidently-huge
    200-500px margin against 600-900px), this toolbar's ~565-600px need
    against a 600-900px range leaves only a **moderate, estimation-sensitive
    margin** — real safe-area insets on notched devices (up to ~40-50px
    combined) and the roughness of a hand-estimated character width (RN
    Text width can't be measured precisely without real device font
    metrics, unlike the dots row's exact numeric dot sizes) mean a genuine
    overflow is plausible on some real narrow-landscape devices, not
    confidently ruled out the way iteration 20's case was. Per this
    iteration's brief ("if the math shows a genuine overflow/wrap risk,
    apply the smallest safe layout fix"), applied `flexWrap: 'wrap'` +
    `gap: spacing.sm` (replacing the old per-button `marginRight:
    spacing.sm`) to the toolbar row — RN 0.86.2 supports `gap`/`rowGap`,
    already used elsewhere in this codebase (`QuizScreen.tsx`,
    `SettingsScreen.tsx`, `PieceCountPicker.tsx`, etc.). This costs nothing
    visually in the common one-row case (all 4 buttons still render on one
    line whenever they fit) and eliminates the overflow risk entirely on
    any device where they don't, by dropping excess buttons to a second
    line rather than clipping them off-screen. Added `testID="coloring-
    toolbar-row"` for testability.
    - **Test** (`describe('toolbar row screen-fit', ...)` in
      `ColoringScreen.test.tsx`): triggers both a flood-fill tap and a pen
      stroke to get all 4 buttons rendered together, then asserts the row's
      flattened style has `flexWrap: 'wrap'`. Verified via `git stash` that
      this test fails (`coloring-toolbar-row` not found) against the
      pre-change source and passes after the fix — confirmed non-tautological.
    - A code-review subagent independently reviewed: confirmed `flexWrap` +
      `gap` is standard, RN-0.86-compatible, and introduces no visual
      regression in the common case; confirmed removing per-button
      `marginRight` in favor of container `gap` is a spacing improvement,
      not a behavior change, for the non-wrapped case; confirmed the test
      is non-tautological and not flaky; confirmed the risk assessment is
      sound (not an overreaction given the app's landscape lock); confirmed
      no hard-limit violations; confirmed no negative accessibility/touch-
      target impact. Approved with no required changes.
  - **Part B (`a7c905a`) — closed out the empty-state check and scoped a
    profile-picture data-layer first slice.** Read `ColoringScreen.tsx`'s
    render logic explicitly (not just inferred, per this iteration's
    brief): `displayImage = filledImage ?? image`. Traced every path that
    can set `image`/`imageLoadFailed` in the `[imageUri, retryToken]`-keyed
    load effect — decode success sets `image`; decode returning falsy sets
    `imageLoadFailed`; any thrown error (including the initial
    `readAsStringAsync` read) also sets `imageLoadFailed`. There is no path
    that leaves `image` permanently `null` without also setting
    `imageLoadFailed` true — the only window where `displayImage` is `null`
    is the brief transient moment between mount and the async decode
    resolving, not a stuck/error state. Every real "no photo could be
    loaded" case is therefore already covered by iteration 11's friendly
    localized error + retry flow; there is no separate, distinct empty
    state gap to close. This closes out Phase 4 item 4 for good (see
    Technical Decisions for the full write-up) — no code change needed for
    this half, matching the brief's instruction not to manufacture a fix.
    Fell through to Phase 4 item 5 (optional child profile picture) per the
    established fallback ordering.
    - Read `src/storage/profileStore.ts` (`getProfile`/`saveProfile` over
      `AsyncStorage`, with a `try { JSON.parse } catch { return null }`
      guard already noted safe in iteration 23), `src/types/profile.ts`
      (the `Profile` interface), and `SettingsScreen.tsx`/
      `OnboardingScreen.tsx`'s existing folder-picker patterns (both use
      Android's Storage Access Framework via `expo-file-system`'s
      `StorageAccessFramework`, not any image/camera picker — there is no
      existing image-picker pattern in this codebase to reuse, confirming a
      picker UI is genuinely new work, not a copy of an existing one).
    - Per the brief's explicit fallback guidance ("only build a full
      picker+display flow if it safely fits in one iteration; otherwise a
      safe first slice is a purely additive, optional `pictureUri` field...
      with NO UI wiring yet"), implemented exactly the safe first slice:
      - `src/types/profile.ts`: added `pictureUri?: string` (optional, not
        `| null`, unlike `rootFolderUri: string | null`) so every existing
        saved profile — which never had this field — still round-trips via
        `JSON.parse` with no migration step; a genuinely-set picture is
        always a local `file://`/`content://` URI, never a remote URL (no
        upload of any kind, matching this app's offline-first/no-tracking
        constraints; no camera access added).
      - New `src/storage/profilePicture.ts`,
        `resolveProfilePictureUri(uri: string | null | undefined):
        Promise<string | null>` — returns `null` immediately for
        null/undefined/empty input (no filesystem call at all), otherwise
        checks the file's actual existence via `expo-file-system/legacy`'s
        `getInfoAsync` (already a dependency, used elsewhere in this
        codebase — no new dependency) and returns the uri only if it still
        exists, falling back to `null` on a missing file OR any thrown
        error (e.g. a revoked SAF grant) — never throws. This mirrors the
        exact same "local file/URI can go stale after being set" failure
        class this app already handles for coloring/puzzle/video photos
        (`ColoringScreen.tsx`'s `imageLoadFailed`, `VideoGallery`'s
        `retryToken`), so a future `<Image>` render backed by this field
        won't show a broken-image icon a young child can't make sense of.
      - Deliberately NO picker UI, NO HomeScreen display wiring this
        iteration — a picker with nothing yet reachable to set would look
        broken, and the brief explicitly called this out as acceptable
        ("no user-visible effect until a future iteration adds the picker
        UI"). See Next for the concrete iteration 29 plan.
    - **Tests**: `__tests__/storage/profilePicture.test.ts` (new file, 4
      tests) — null/undefined/empty-string input short-circuits without
      touching the filesystem; an existing file resolves to its own uri;
      a missing file resolves to `null`; a rejected `getInfoAsync` call
      also resolves to `null`, never throwing. Verified non-tautological by
      temporarily making the implementation return the uri unconditionally
      and confirming the "missing file" test failed for the right reason,
      then restoring it. `__tests__/storage/profileStore.test.ts` got one
      new test (existing tests untouched) asserting a profile with
      `pictureUri` round-trips correctly through `AsyncStorage`, and a
      profile without it round-trips with the key entirely absent
      (`'pictureUri' in loaded === false`) rather than serialized as a
      literal `undefined` — confirming `JSON.stringify` genuinely drops
      `undefined`-valued object keys rather than assuming it.
    - A code-review subagent independently reviewed: confirmed
      `pictureUri?: string` (optional, not nullable) is the right shape
      given there's no "explicitly no picture, as opposed to never set"
      distinction needed yet; confirmed `resolveProfilePictureUri`'s
      fail-safe design is appropriate for a children's app and is a
      reasonable, non-dead-code "safe first slice" (a real pure unit with
      its own tests, ready for a future caller, not speculative unused
      code); confirmed test quality (non-tautological, no flakiness);
      confirmed no hard-limit violations (no new deps, no unsafe casts, no
      camera/cloud/network APIs, no unnecessary personal metadata, no
      existing test weakened); and confirmed the `JSON.stringify` claim
      about absent-vs-undefined keys is technically correct, not just
      plausible. Approved with no required changes.
  - Baseline before this iteration: tsc clean, 26/26 suites, 238/238 tests.
  - After this iteration: tsc clean, **27/27 suites** (new
    `__tests__/storage/profilePicture.test.ts`), **244/244 tests** (+6 new:
    1 toolbar-wrap test, 4 `resolveProfilePictureUri` tests, 1
    `profileStore` pictureUri round-trip test). No existing test modified,
    weakened, skipped, or renamed.
  - Commits: `a1af79a` (Part A), `a7c905a` (Part B).
- Previous iteration's completed improvement (iteration 27, one commit): Phase 4's
  remaining flood-fill sub-item — a single-level "undo last flood fill".
  Iteration 26 deliberately left this open, unsure whether even one level
  of undo was small enough for one iteration (a full undo/redo history
  stack over Skia's `Uint8ClampedArray` pixel buffers clearly would NOT
  be). This iteration read `handleCanvasTap`'s full pixel-buffer flow in
  `src/coloring/ColoringScreen.tsx` and `floodFill`'s implementation in
  `src/coloring/floodFill.ts` before deciding: `floodFill` already does
  `const result = pixels.slice()` as its very first line and only ever
  mutates `result`, never its input — so the pre-fill `pixels` buffer
  sitting in `pixelsRef.current` right before a new fill is untouched and
  free to hold onto. That means a single-level undo needs **zero extra
  buffer allocation**: just a ref capturing the existing `{ pixels,
  filledImage }` pair (a pointer copy) right before each fill, restored on
  one Undo press and then cleared. This is exactly the "genuinely small"
  case per this iteration's brief, so it was implemented (the profile-
  picture Phase 4 item 5 fallback was NOT needed this iteration).
  - **Implementation**: a new `filledImageRef` (mirroring the file's
    existing `imageRef`/`pixelsRef` ref-mirroring pattern for values read
    inside the stable `PanResponder` handlers/`handleCanvasTap`) plus a
    plain `previousFillRef` holding at most one `{ pixels, filledImage }`
    snapshot (not state — refs don't need to trigger renders themselves)
    and a `canUndoFill` boolean **state** purely to drive the Undo
    button's visibility. `handleCanvasTap` captures
    `previousFillRef.current = { pixels, filledImage: filledImageRef.current }`
    using the pre-fill closure variables, strictly before `setPixels`/
    `setFilledImage` run. `handleUndoFill` restores both, then nulls the
    ref and flips `canUndoFill` false — one use only, no re-use without a
    fresh fill in between. The existing `[image]`-keyed `useEffect` that
    already resets `pixels`/`filledImage`/`strokes` on a new photo load
    now also resets `previousFillRef`/`canUndoFill`, so undo can never
    reach across photos.
  - **No confirmation dialog** (unlike `clear-drawing`'s `Alert.alert`
    flow, kept from iteration 26): reverting one fill is cheap and
    trivially redoable (tap fill again), unlike wiping every pen stroke,
    so gating it behind a confirmation would just be friction for a 2-8
    year old, not a real safety need. Confirmed both flows are fully
    independent code paths — `handleUndoFill` never touches `strokes`,
    and the `Alert.alert` clear-drawing flow never touches
    `pixels`/`filledImage`/`previousFillRef`.
  - **UI**: a new `undo-fill` `Pressable` (↩️ + localized "Undo" text),
    rendered only when `canUndoFill` is true, styled byte-for-byte
    consistent with the sibling `clear-drawing`/`tool-fill`/`tool-pen`
    buttons in the same toolbar row (same padding/border/radius
    convention, no dedicated hitSlop needed — matches those existing
    siblings' established convention rather than introducing a new one).
  - **New EN+DE i18n key** (`src/i18n/strings.ts`, same commit):
    `undoFill: { en: 'Undo', de: 'Rückgängig' }` — "Rückgängig" is the
    standard, natural German word for "Undo" (matches OS/app
    conventions), not a literal/awkward translation.
  - **Memory**: bounded to at most ONE extra pixel-buffer snapshot alive
    at a time — `previousFillRef` is a single object slot overwritten on
    each new fill (the old snapshot, if any, becomes unreferenced and
    eligible for GC), never appended to a list/stack.
  - Baseline before this iteration: tsc clean, 26/26 suites, 232/232 tests.
  - After this iteration: tsc clean, 26/26 suites, **238/238 tests** (+6
    new, all in a new `describe('undo last flood fill', ...)` block in
    `__tests__/coloring/ColoringScreen.test.tsx`: no Undo button before any
    fill; a pen stroke alone does NOT reveal the Undo-fill button
    (confirming independence from `clear-drawing`); a flood-fill tap
    reveals Undo and pressing it hides the button again; undo restores via
    the stored snapshot rather than recomputing a new fill (asserted by
    `Skia.Image.MakeImage`'s mock call count staying at 1 across the
    undo — `MakeImage` is only ever invoked inside `handleCanvasTap`, never
    inside `handleUndoFill`, so a regression that reimplemented undo via
    recomputation would be caught); a later fill re-arms a fresh
    single-level undo; German localization. The existing Skia mock's
    `readPixels` was extended with an opt-in `mockPixelState.shouldReturnPixels`
    flag (default `false`, preserving every pre-existing test's original
    behavior unchanged) so these new tests can exercise the real
    `handleCanvasTap`/`floodFill` path with an actual 10x10 white RGBA
    buffer instead of the pre-existing tests' `null` pixels. No existing
    test modified, weakened, skipped, or renamed.
  - A code-review subagent independently reviewed the diff: confirmed the
    pre-fill capture happens strictly before `setPixels`/`setFilledImage`
    reassign anything and uses the pre-fill closure variables (not the
    post-fill `updated` buffer); confirmed `floodFill` never mutates its
    input (`pixels.slice()` as its first line) so holding the old
    reference is safe; confirmed the `[image]`-keyed reset effect clears
    the undo snapshot on every new photo; confirmed `handleUndoFill` and
    the `Alert.alert` clear-drawing flow are fully independent code paths
    touching disjoint state; confirmed the memory bound (one slot,
    overwritten not appended); confirmed EN+DE correctness and natural
    German wording; confirmed accessibility/styling is byte-for-byte
    consistent with the sibling toolbar buttons; confirmed the new tests
    are non-tautological (specifically validating the `MakeImage`
    call-count technique as a real, meaningful "restored vs. recomputed"
    signal); and confirmed no hard-limit violations (no new deps, no new
    `ts-ignore`/unsafe casts, no native/config files touched, only
    `ColoringScreen.tsx`/its test file/`strings.ts` changed). Approved
    with no required or optional changes.
  - Commit: `<see git log — loop: add a single-level undo for the last
    flood fill>`.
- Previous iteration's completed improvement (iteration 26, one commit): Phase 4 item 4
  — coloring usability's confirmation-before-destructive-clear gap. Read
  `src/coloring/ColoringScreen.tsx` fully: the `clear-drawing` button
  (rendered only when `strokes.length > 0`) wiped every pen stroke with a
  single tap and zero confirmation — a real "accidental destructive
  action" risk for a 2-8 year old prone to mis-taps, exactly as this
  iteration's brief flagged. Checked for a lower-risk, distinct undo
  action first (per the brief's instruction not to gate a safe single-step
  undo behind confirmation) — there is only ONE clear/undo-type control in
  the file; the only other `setStrokes([])` call is inside the
  image-load `useEffect` (resets strokes when a fresh photo is decoded,
  not a user-tappable action), so nothing needed to stay ungated.
  Flood-fill taps (the other half of item 4's brief) were deliberately
  left out of scope per the `Next` section's own guidance — an
  undo-for-flood-fill is a genuinely larger feature, not a "small, safe,
  well-bounded slice" fittable in one iteration; noted as a possible
  future item below rather than half-built.
  - **Confirmation pattern chosen**: `Alert.alert`, NOT a new custom
    modal — `src/settings/SettingsScreen.tsx` already established exactly
    this pattern for its own destructive action (folder-migration
    `confirmMigration()`, `migrationConfirmTitle/Body/Confirm/Cancel` i18n
    keys), so this iteration followed the same established convention for
    consistency rather than introducing a second confirmation UI pattern
    into the codebase. The `clear-drawing` `Pressable`'s `onPress` now
    calls `Alert.alert(t('clearDrawingConfirmTitle'),
    t('clearDrawingConfirmBody'), [Cancel, Clear], { cancelable: true })`,
    only calling `setStrokes([])` from the Clear button's own `onPress`
    (`style: 'destructive'`); Cancel (`style: 'cancel'`) does nothing.
  - **New EN+DE i18n keys** (`src/i18n/strings.ts`, added in the same
    commit): `clearDrawingConfirmTitle` ("Clear picture?"/"Bild
    löschen?"), `clearDrawingConfirmBody` ("This will erase your
    drawing."/"Das löscht dein Bild."), `clearDrawingConfirmConfirm`
    ("Clear"/"Löschen"), `clearDrawingConfirmCancel`
    ("Cancel"/"Abbrechen"). Deliberately shorter/gentler wording than the
    adult-facing `migrationConfirmBody` ("...This cannot be undone.") —
    this dialog is child-facing, so it states the effect plainly (erases
    the drawing) without harsher "cannot be undone"/warning-style
    language, matching the brief's "not scary, this is about lost work,
    not danger" instruction.
  - **Double-fire safety**: verified no additional guard was needed —
    `Alert.alert` is a native, OS-level modal, so a second tap on the
    already-hidden-behind-the-dialog `clear-drawing` button cannot reach
    JS while the dialog is open; the confirm callback is a plain
    synchronous `setStrokes([])`, safe to invoke once by construction.
  - **Accessibility**: none needed beyond what's automatic —
    `Alert.alert` is a native OS-level accessible dialog (TalkBack/
    VoiceOver announce it and its buttons on their own), so no new
    `accessibilityLabel`/`accessibilityRole` wiring was required.
  - Baseline before this iteration: tsc clean, 26/26 suites, 228/228
    tests.
  - After this iteration: tsc clean, 26/26 suites, **232/232 tests** (+4
    new, all in a new `describe('clear-drawing confirmation', ...)` block
    in `__tests__/coloring/ColoringScreen.test.tsx`: pressing Clear shows
    the confirmation instead of immediately clearing; confirming actually
    clears (asserted by the button disappearing once `strokes` is empty
    again — the real observable signal); cancelling leaves the drawing
    intact; the confirmation is correctly localized in German including
    button labels. A new `drawOnePenStroke` test helper simulates the raw
    PanResponder `responderGrant`/`responderRelease` native-event pair
    directly (with a minimal fake `touchHistory` object, since
    PanResponder's internal gesture-state math reads `event.touchHistory`
    directly rather than `nativeEvent.touches`) to get one stroke into
    state so the `clear-drawing` button renders — no existing test
    modified, weakened, skipped, or renamed).
  - A code-review subagent independently reviewed the diff: confirmed via
    a fresh read of the full file that only one destructive
    clear/undo-type control exists and it's the one now gated (the other
    `setStrokes([])` call is a non-user-facing effect reset, correctly
    left unconfirmed); confirmed EN+DE tone/naturalness including that the
    shorter child-facing wording vs. the adult-facing migration dialog is
    an intentional, reasonable distinction, not an inconsistency;
    confirmed full EN+DE localization coverage with no hardcoded English
    left in the `Alert.alert` call; confirmed no double-fire risk (native
    modal by construction, idempotent confirm callback); confirmed no
    hard-limit violations (no new deps, no unsafe casts/`ts-ignore`, no
    existing test altered — only new imports/helpers/tests added, no
    undo/redo history built, staying within this iteration's scoped
    slice); and confirmed `Alert.alert`'s native accessibility is
    sufficient with no additional wiring needed. Independently re-ran
    `npx tsc --noEmit` (clean) and the full suite (26/26 suites, 232/232
    tests). Approved with no required or optional changes.
  - Commit: `<see git log — loop: confirm before clearing a child's
    coloring drawing>`.
- Previous iteration's completed improvement (iteration 25, one commit): Phase 4 item 3
  — coloring palette completeness. Checked the existing 12-color
  `PALETTE` in `src/coloring/palette.ts` against the spec's full category
  list (basic/light/dark/warm/cool/skin-tone-friendly/neutral) by reading
  actual hex/RGBA values, not just names: basic/warm/cool were covered by
  the vivid red/orange/yellow/green/blue/purple hues, neutral was covered
  by black/white/gray/brown — but every single one of the 12 is either a
  vivid mid-saturation hue or a pure neutral. There was genuinely no
  light/pastel shade (all 12 fail a "channels mostly >=150" pastel check
  except white itself), no dark shade beyond pure black, and — a real,
  valued gap for a children's coloring app — no skin-tone-friendly colors
  at all, meaning a child could never realistically color a person's skin.
  This was a genuine gap on all three counts, not a manufactured one, so
  5 new colors were added (12 -> 17, well within the "~16-18" ceiling the
  brief allowed):
  - `paletteColorLightBlue` (`#AEE2FF`) — a pastel, distinct from the
    existing vivid `#1E90FF` blue.
  - `paletteColorNavy` (`#1B2A4A`) — a dark shade beyond plain black.
  - `paletteColorSkinLight` (`#FFDBAC`), `paletteColorSkinMedium`
    (`#C68642`), `paletteColorSkinDeep` (`#6B4226`) — a small
    light/medium/deep skin-tone range, deliberately using simple,
    non-clinical EN/DE names ("Light Skin"/"Helle Haut", "Medium
    Skin"/"Mittlere Haut", "Deep Skin"/"Dunkle Haut") rather than any
    "flesh"/"complexion"/ethnicity-referencing terminology.
  - All 5 have unique hex/RGBA/nameKey values (verified by the existing
    `palette.test.ts` uniqueness assertions, which needed no logic
    change — they iterate the array generically). EN+DE strings for all
    5 new `nameKey`s added to `src/i18n/strings.ts` in the same commit.
  - Screen-fit was checked before adding anything: `ColoringScreen.tsx`'s
    palette renders inside a `horizontal` `ScrollView` (`showsHorizontalScrollIndicator={false}`),
    so 5 more circular swatches only extend horizontal scroll content —
    zero effect on `CANVAS_RESERVED_HEIGHT`/vertical layout, so the canvas
    cannot be pushed off-screen and no vertical scrolling is introduced
    (horizontal scroll within an already-designed-to-scroll swatch strip
    is not the kind of forced scrolling the "no scrolling on child-facing
    screens" hard limit is about).
  - Accessibility: the new entries need zero separate wiring — the
    existing `PALETTE.map` in `ColoringScreen.tsx` derives
    `accessibilityLabel`/`accessibilityState`/`hitSlop` generically per
    entry from the array, established in iteration 15/16.
  - Baseline before this iteration: tsc clean, 26/26 suites, 225/225 tests.
  - After this iteration: tsc clean, 26/26 suites, **228/228 tests** (+3
    new, all in `__tests__/coloring/palette.test.ts`'s existing `describe`
    block — one updated in place (12 -> 17 expected entries, an
    intentional count bump matching the new real data, not a weakened
    assertion) plus 3 new tests directly checking for a genuine
    light/pastel shade, a genuine dark-beyond-black shade, and >=3
    skin-tone `nameKey`s; confirmed all 3 new tests failed for the right
    reason against the pre-change 12-color palette before implementing).
  - A code-review subagent independently reviewed the diff: confirmed hex/
    nameKey uniqueness across all 17 entries, confirmed EN/DE naming is
    natural and non-clinical/non-insensitive, confirmed the horizontal-
    ScrollView screen-fit analysis, confirmed accessibility wiring is
    automatic via the generic `PALETTE.map`, confirmed no hard-limit
    violations, and independently re-verified all 5 new hex-to-RGBA
    conversions by hand. Approved with one non-blocking nit (a small
    rationale-comment duplication between `palette.ts` and the test file)
    left as-is.
  - Commit: `<see git log — loop: add light/dark/skin-tone colors to the
    coloring palette>`.
- Previous iteration's completed improvement (iteration 24, one commit): Phase 4 item 1
  — a brief scale-down-on-press-in/scale-back-on-press-out animation on
  `HomeScreen.tsx`'s four feature cards, plus a per-card double-fire
  navigation guard discovered to be genuinely needed (HomeScreen stays
  mounted underneath whatever screen React Navigation's native stack
  pushes). See Completed #21 for full detail, including a real TDD
  complication (a native-driver `Animated.spring` fired via manually-
  simulated `pressIn`/`pressOut` events destabilized the RNTL test
  renderer across unrelated tests in the same file — worked around by
  testing plain presses + direct code-reading instead, per this
  iteration's own documented fallback for animation values that aren't
  practically testable).
  - Baseline before this iteration: tsc clean, 26/26 suites, 222/222 tests.
  - After this iteration: tsc clean, 26/26 suites, **225/225 tests** (+3
    new, all in a new `describe('card press animation / navigation
    safety', ...)` block in `__tests__/home/HomeScreen.test.tsx`; the one
    pre-existing HomeScreen test is unchanged, all its original assertions
    intact).
  - A code-review subagent independently reviewed the diff and approved
    with no required changes (two non-blocking nits noted, left as-is —
    see Completed #21).
  - Commit: `<see git log — loop: add a subtle press animation to
    HomeScreen's feature cards>`.
- Previous iteration's completed improvement (iteration 23, one commit): a fresh, honest
  re-check of both options this iteration's brief suggested, per the brief's
  instruction not to manufacture a fake gap:
  1. **HomeScreen's four feature cards** — checked `src/home/HomeScreen.tsx`'s
     `card`/`cardEmoji`/`cardLabel` styles directly: each card renders a 52px
     emoji plus a bold `cardLabel` text, with `padding: spacing.md` and no
     fixed/small height at all, laid out in a `space-between` row. Comfortably
     far above the ~48x48 guideline — confirmed, no change made, matching the
     brief's own prediction that this was the lower-priority, unlikely-to-need-
     fixing check.
  2. **Pure-Logic Module Inventory re-audit** — read the full table (below)
     and, for each module, checked its *current* test file against the
     listed "possible future edge cases" rather than trusting the table's own
     stale wording:
     - `quizSession.ts`, `folderMigration.ts`, `folderPathDisplay.ts`,
       `puzzleGrid.ts`: table already says "well covered / no further gaps"
       and this was re-confirmed true.
     - `loadQuestions.ts`: the table still lists 4 "possible future edge
       cases", but grepping `__tests__/quiz/loadQuestions.test.ts` showed 3
       of the 4 are already covered (duplicate option IDs, `minAge >
       maxAge`, neither `text` nor `image`) — the table itself was stale.
       Only "option `text` present but missing one language key" remains
       genuinely untested, a smaller/narrower gap than found elsewhere.
     - `profileStore.ts`: the listed "corrupted/non-JSON stored value"
       gap is real and untested, but the function's own `try { JSON.parse }
       catch { return null }` is trivially, visibly correct from inspection
       — lower marginal value than a gap with an actual undocumented sharp
       edge.
     - **`src/storage/folderAccess.ts`'s `leafNameOf`** — the genuinely
       highest-value remaining gap. This pure, exported, one-line-body
       function had **zero direct test coverage** before this iteration
       (only indirect coverage via `ensureContentStructure`'s tests, all of
       which use already-percent-encoded URIs with no trailing slash). Read
       the implementation
       (`decodeURIComponent(uri).substring(...lastIndexOf('/') + 1)`) and
       hand-traced 4 cases the inventory table named:
       already-decoded/unencoded URI, partially-encoded URI (percent-encoded
       space), no slash at all, and a trailing slash. The trailing-slash
       case is a genuinely interesting, previously-undocumented sharp edge:
       it returns an **empty string**, not the folder name before the
       slash — because `lastIndexOf('/')` finds the trailing slash itself.
       Not a live bug (grepped every mocked `content://` URI in this file
       and in `loadQuestions.test.ts` and confirmed none end in a slash), but
       worth pinning down explicitly as documented, verified behavior rather
       than an unverified assumption.
  - Fix: added a new `describe('leafNameOf', ...)` block (4 tests) to
    `__tests__/storage/folderAccess.test.ts`, importing `leafNameOf`
    alongside the existing `ensureContentStructure` import. All 4 passed on
    first run against the unmodified implementation — pure coverage
    addition, no production code changed, no bug found (the trailing-slash
    behavior is documented as-is, not "fixed", since it isn't observed to
    cause any real failure).
  - Verified `npx tsc --noEmit` clean, full suite **26/26 suites, 222/222
    tests** (218 baseline + 4 new; no existing test modified, skipped, or
    renamed — only the import line changed in the touched file).
  - A code-review subagent independently reviewed the diff: hand-traced all
    4 new assertions against the real `decodeURIComponent`/`lastIndexOf`/
    `substring` logic and confirmed each expected value is correct (not a
    typo), confirmed the tests are non-tautological (would fail if the `+1`
    off-by-one were dropped, or if `decodeURIComponent` were skipped),
    confirmed no existing test was modified/weakened/skipped/renamed
    (`git diff --stat`: one file, 33 insertions/1 deletion, only an import
    line touched besides the new block), confirmed no hard-limit violations
    (no new deps, no `ts-ignore`/unsafe casts, no production/native file
    touched), and independently re-verified the trailing-slash code
    comment's claim by grepping both test files for any `content://` literal
    ending in a slash (found none). Approved with no required or optional
    changes.
  - Commit: `<see git log — loop: add direct leafNameOf edge-case coverage>`.
- Previous iteration's completed improvement (iteration 22, four commits): a
  touch-target-sizing sweep across the screens iteration 21's `Next` note
  flagged as unswept (coloring/puzzle/video/settings galleries) plus the
  still-open, deferred `AgePicker.tsx` check from iteration 16.
  1. **`AgePicker.tsx`** (`4e13e3a`) — the closed field and each of the 7
     modal age-option rows (ages 2-8) render ~42px tall, under the ~48px
     guideline this codebase already established for `ColoringScreen`'s
     palette swatches (iteration 16). Read `AgePicker.tsx` and both call
     sites (`OnboardingScreen.tsx`, `SettingsScreen.tsx`) before touching
     anything: the closed field is a single, isolated `Pressable` (only a
     non-interactive `Text` label 8px above it, and — in Onboarding only —
     a non-interactive error `Text` 4px below it), so `hitSlop={{top:4,
     bottom:4,left:4,right:4}}` closes the gap with zero visual change and
     no overlap risk. The 7 modal option rows, by contrast, are stacked
     directly on top of one another inside `modalCard` with NO `gap` style
     — adding vertical hitSlop there would make neighboring ages' hit zones
     overlap, a genuine mis-tap risk for a young child picking the wrong
     age. Used `minHeight: 48` + `justifyContent: 'center'` instead (real
     layout growth, not an invisible zone) — this is the one deliberate,
     visible layout change in this iteration (modal grows by ~6px x 7 rows
     = ~42px taller; still comfortably fits a landscape screen at the
     modal's current ~310px content height). New test file
     `__tests__/components/AgePicker.test.tsx` (AgePicker had zero dedicated
     test coverage of its own before this — only indirect coverage via
     `OnboardingScreen.test.tsx`/`SettingsScreen.test.tsx`, which never
     touched touch-target sizing at all).
  2. **Bundled hitSlop-only fixes** (`3b6155b`) — a fast Explore-agent sweep
     of `ColoringGallery.tsx`, `PuzzleGallery.tsx`, `VideoGallery.tsx`,
     `VideoPlayerScreen.tsx`, and `SettingsScreen.tsx` found several more
     genuine, mechanically-identical gaps, bundled into one commit per this
     iteration's brief ("multiple small touch-target gaps... trivial
     one-line hitSlop additions... fine to fix all in one commit since
     they're the same category of change"):
     - The three gallery retry buttons (`coloring-gallery-retry`,
       `puzzle-gallery-retry`, `video-gallery-retry`) had literally no style
       at all — a plain `Pressable` wrapping unstyled `Text`, rendering
       ~39x17px. Each is the sole interactive element in its error-state
       screen (no adjacent interactive sibling) — `hitSlop={{top:14,
       bottom:14,left:14,right:14}}` added to all three.
     - `SettingsScreen.tsx`'s two language pills (`settings-lang-en`/`-de`)
       sit side-by-side with only an 8px horizontal gap — added
       vertical-only `hitSlop={{top:6,bottom:6}}`, deliberately omitting
       horizontal hitSlop to avoid the two pills' hit zones colliding across
       that 8px gap.
     - `SettingsScreen.tsx`'s folder-change button had no `testID` at all
       (added `settings-folder-picker`, additive only — existing tests query
       it by visible text, unaffected) and got the same vertical-only
       `hitSlop={{top:6,bottom:6}}` (no interactive sibling above/below it).
     - `VideoPlayerScreen.tsx`'s retry button was checked and found already
       borderline-adequate (~44px tall) with no clear gap — left unchanged
       (see Technical Decisions).
  3. **`VideoGallery.tsx`'s list-row `minHeight`** (`5669899`, separate
     commit) — each video row (`FlatList` `renderItem`) had no style at all,
     rendering at one line of unstyled text (~17px tall). Unlike the retry
     button in the same file, these rows are stacked back-to-back in the
     `FlatList` with no separator/gap between them — a `hitSlop` fix here
     would make adjacent rows' hit zones overlap, risking a mis-tap on the
     wrong video (exactly the overlap risk this iteration's brief warned
     against). Used `minHeight: 48` + `justifyContent: 'center'` +
     `paddingVertical: spacing.sm` instead — a real, visible layout change
     (each row is now taller), which is why it's kept in its own commit
     rather than bundled with the invisible-only hitSlop fixes above. The
     gallery is a scrollable `FlatList` by design (browsing many videos), so
     taller rows don't conflict with the "child-facing screens must never
     require scrolling" hard limit, which concerns forced/hidden scrolling
     to complete a primary task, not an intentionally browsable list.
  4. **`OnboardingScreen.tsx`'s matching gap** (`030ec1d`, fourth commit,
     found via a deliberate double-check while writing this very Next-section
     note below) — `OnboardingScreen.tsx` defines its own `langPill`/
     `folderButton` styles separately from `SettingsScreen.tsx` (not a
     shared style object), so item 2's fix above did NOT carry over to this
     visually-identical screen. Same ~39px pills, same 8px gap between them
     (vertical-only hitSlop, same reasoning), same ~38px folder button
     (previously had no `testID` — added `onboarding-folder-picker`,
     additive only). Closes the inconsistency between the app's two
     near-identical folder/language forms.
  - Baseline before this iteration: tsc clean, 25/25 suites, 210/210 tests.
  - After this iteration: tsc clean, **26/26 suites** (new
    `__tests__/components/AgePicker.test.tsx`), **218/218 tests** (+8 new:
    2 in the new AgePicker suite, 4 for the bundled hitSlop fixes — one
    each in `ColoringGallery.test.tsx`/`PuzzleGallery.test.tsx`/
    `VideoGallery.test.tsx` plus one in `SettingsScreen.test.tsx` covering
    both pills and the folder button — 1 for VideoGallery's row
    `minHeight`, and 1 for `OnboardingScreen.test.tsx`'s matching pills/
    folder-button fix). No existing test modified, skipped, or renamed (one
    dead `waitFor` import removed from `VideoGallery.test.tsx` as an
    incidental cleanup, not a test change).
  - A code-review subagent independently reviewed the diff (items 1-3
    above, reviewed together before splitting/committing into three
    commits; item 4's `OnboardingScreen` fix was found and applied
    afterward, mechanically identical to item 2's already-reviewed
    `SettingsScreen` fix, so it was self-reviewed rather than sent through
    a second subagent pass — same rationale as iteration 12's "very small,
    mechanical diff" self-review fallback):
    re-verified every "no adjacent interactive sibling" claim above by
    reading the live JSX/layout of each file (including both `AgePicker`
    call sites), confirmed all hitSlop/minHeight values are plausible
    against `theme/tokens.ts`'s actual `spacing` values, confirmed the new
    tests are non-tautological (numeric thresholds tied to the actual
    guideline, would fail if a fix were reverted or reduced), confirmed no
    hard-limit violations (no new deps, no `any`/`ts-ignore`/unsafe casts,
    no weakened/skipped/renamed test, no new user-facing strings needed,
    no native config touched), and confirmed nothing else in the diff was
    out of scope. Raised one process note (at review time, the VideoGallery
    `minHeight` change had been deliberately, temporarily reverted from the
    working tree to allow a clean 3-way commit split by category — reviewed
    logic against the stated intent, not a real bug) — resolved by
    re-applying that change immediately after as its own commit, exactly as
    planned. No other required or optional changes.
- Previous iteration's completed improvement (iteration 21, one commit): gave the quiz
  completion screen (`QuizScreen.tsx`'s `isFinished` branch) real actions —
  a "Play Again" button that starts a genuinely fresh session (a brand-new
  `buildSession()` call against the already-loaded question pool, reshuffled
  via `shuffle()`'s per-call `Math.random`, with score/currentIndex/selection
  all reset via `initialSessionState()`) and a "Home" button that navigates
  back via a new optional `onGoHome` prop, wired in `RootNavigator.tsx` to
  `navigation.navigate('Home')` — the exact same render-prop pattern already
  used for `HomeScreen`'s `onNavigate`. Both buttons are guarded against
  rapid double-presses with a per-instance `useRef` flag (shared across all
  closures of the component, so even a stale captured button reference can't
  slip past it — same idiom as `SettingsScreen`'s `migrating` in-flight
  guard); `playAgainFiredRef` is re-armed via a `useEffect` keyed on
  `state?.isFinished` so a later play-through's Play Again still works,
  while `hasNavigatedHomeRef` never needs to re-arm since navigating home
  permanently leaves this screen instance. New EN+DE strings `quizPlayAgain`
  ("Play Again"/"Nochmal spielen") and `quizGoHome` ("Home"/"Start") added to
  `src/i18n/strings.ts`. Both buttons are sized `minHeight`/`minWidth: 48`.
  Investigated the existing completion wording (`quizScore` + the
  already-floors-at-1-star `starCount` calc) and found it already
  encouraging with no shame/ranking/failure language at any score,
  including 0/total — left unchanged, confirmed by a new test asserting
  no "fail"/"bad"/"wrong"/"try harder" wording appears at a 0/2 finish.
  - Baseline before this iteration: tsc clean, 25/25 suites, 204/204 tests.
  - After this iteration: tsc clean, 25/25 suites, **210/210 tests** (+6 new
    tests, all in a new `describe('completion screen actions', ...)` block
    in `__tests__/quiz/QuizScreen.test.tsx`; no existing test
    modified/removed/skipped).
  - A code-review subagent independently reviewed the diff: confirmed
    session-reset correctness (fresh `buildSession` call, not a replay),
    confirmed the navigation pattern matches the established
    `onNavigate`/render-prop convention and that `onGoHome` being optional
    keeps existing call sites safe, confirmed both ref-guards are correct
    (including the re-arming logic), confirmed encouraging tone at 0 score
    in both languages, confirmed EN+DE completeness and natural (non-literal)
    German wording, confirmed no hard-limit violations (no new deps, no
    `any`/casts, no native config touched, no test weakened), and confirmed
    the new tests are non-tautological — specifically praising the
    "genuinely fresh session" test's technique of changing `Math.random`'s
    mocked return value between the initial load and the Play Again press to
    prove a real reshuffle occurred (per `shuffle.ts`'s algorithm), and the
    double-press test's exact `Math.random`-call-count assertion as a real
    (not just mock-was-called) guard check. One nit raised — the new
    completion-actions row adds real height on top of the existing scoreCard
    and, while plausible to fit a 360dp-tall landscape screen from the
    source alone, is "tight enough to warrant an actual device/simulator
    check" — carried forward as a Visual Review Required item below (real
    S22 confirmation still pending, consistent with every other
    device-fit item in this log).
  - Commit: `<see git log — loop: add Play Again and Home actions to the
    quiz completion screen>`.
- Previous iteration's completed improvement (iteration 20, one commit): investigated
  the quiz progress-dots row's large-session-count overflow risk flagged
  after iteration 19 — concluded it is NOT a genuine risk (see Technical
  Decisions for the full investigation) and added one test pinning down
  and documenting the current safe behavior at the real maximum session
  length (20 dots), rather than manufacturing an unneeded fix.
  - Baseline before this iteration: tsc clean, 25/25 suites, 203/203 tests.
  - After this iteration: tsc clean, 25/25 suites, **204/204 tests** (+1
    new test in `__tests__/quiz/QuestionRenderer.test.tsx`'s existing
    `describe('progress indicator', ...)` block; no existing test
    modified/removed/skipped; no production code changed at all this
    iteration).
  - Commit: `<see git log — loop: pin down safe quiz progress-dot layout
    at the real max session length>`.
- Previous iteration's completed improvement (iteration 19, one commit): quiz progress
  clarity (Phase 3 item 3) — see Completed entry below for full detail.
  - Baseline before this iteration: tsc clean, 25/25 suites, 196/196 tests.
  - After this iteration: tsc clean, 25/25 suites, **203/203 tests** (+7 new
    tests across `__tests__/quiz/QuestionRenderer.test.tsx` (5) and
    `__tests__/quiz/QuizScreen.test.tsx` (2); no existing test
    modified/removed/skipped).
  - Commit: `<see git log — loop: add a screen-reader progress label to the
    quiz's existing progress dots>`.
- Previous iteration's completed improvement (iteration 18, one commit): age-appropriate,
  encouraging wrong-answer feedback in the quiz flow (Phase 3 item 2) — see
  Completed entry below for full detail.
  - Baseline before this iteration: tsc clean, 25/25 suites, 186/186 tests.
  - After this iteration: tsc clean, 25/25 suites, **196/196 tests** (+10 new
    tests across `__tests__/quiz/QuestionRenderer.test.tsx` and
    `__tests__/quiz/QuizScreen.test.tsx`; one pre-existing QuizScreen test and
    one pre-existing QuestionRenderer test had ONLY their expected wrong-
    answer wording string updated in place — from the old generic "Try
    again!"/"Versuch es nochmal!" to the new age-tiered wording — to match
    the intentional copy change; no assertion was weakened, removed, or
    skipped, and both tests still exercise exactly what they did before).
  - Commit: `<see git log — loop: add age-tiered encouraging wrong-answer
    feedback and a Try Again action to the quiz>`.
- Previous iteration's completed improvement (iteration 17, one commit): a brief,
  non-blocking animated correct-answer celebration in the quiz flow — see
  Completed entry below for full detail.
  - Baseline before this iteration: tsc clean, 25/25 suites, 178/178 tests.
  - After this iteration: tsc clean, 25/25 suites, **186/186 tests** (+8
    new tests, all in `__tests__/quiz/QuestionRenderer.test.tsx`, no
    existing test modified/removed/skipped).
  - Commit: `5cdcd6e` — `loop: add a brief animated correct-answer
    celebration to the quiz`.
- Previous iteration (16, two commits): a direct
  `palette.ts` smoke test (this iteration's primary task, `Next` item 1 from
  iteration 15) plus a touch-target-sizing fix for `ColoringScreen`'s
  palette swatches (secondary, Phase 2 fast-follow).
  1. **`__tests__/coloring/palette.test.ts`** (new file, test-only, 8
     tests). `src/coloring/palette.ts`'s 12-entry `PALETTE` array was only
     ever exercised indirectly, and only for 4 of 12 colors, via
     `ColoringScreen.test.tsx`'s palette-label tests. This adds a dedicated
     smoke test asserting: exactly 12 entries; no duplicate `display` hex
     values; no duplicate `fill` RGBA values; no duplicate `nameKey`
     values; every `display` matches `/^#[0-9A-Fa-f]{6}$/`; every `fill` is
     a well-formed 4-integer 0-255 tuple with alpha fixed at 255; and every
     `nameKey` resolves via `t(key, 'en')`/`t(key, 'de')` to a non-empty,
     non-whitespace string. All 8 assertions passed on first run against
     the unmodified module — TDD-verified by temporarily duplicating one
     `nameKey` (`paletteColorOrange` → `paletteColorRed`) in
     `src/coloring/palette.ts`, confirming the "no duplicate nameKey"
     assertion failed for exactly that reason, then restoring the file
     exactly (`git diff --stat` showed zero production change afterward).
     Pure coverage addition, no bug found, no production code touched.
     A code-review subagent independently confirmed the assertions are
     non-tautological, import paths match sibling test-file conventions,
     no `any`/unsafe casts, no meaningful overlap with
     `ColoringScreen.test.tsx`'s existing (different-purpose) palette
     tests, and no existing test/config was modified. Approved with no
     changes.
     - Commit: `e7e9100` — `loop: add a direct smoke test for coloring's
       PALETTE data`.
  2. **Touch-target sizing for `ColoringScreen`'s palette swatches**
     (secondary; scanned via a fast Explore-agent sweep of touch-target
     sizing, motion safety, and Galaxy S22 screen-fit per this iteration's
     brief — see Technical Decisions for the full scan results). The 12
     palette swatches (`src/coloring/ColoringScreen.tsx`, `Pressable` at
     ~line 404) are visually 44x44px circles — the app's only interactive
     control found under the ~48x48 logical-pixel touch-target guideline;
     every other control scanned (`PieceCountPicker`'s `optionRow`,
     `AgePicker`'s field/options, all retry/nav buttons) already has
     `minHeight`/padding comfortably at or above 48px.
     - TDD: added a test to `ColoringScreen.test.tsx` asserting
       `redSwatch.props.hitSlop` has `top`/`bottom`/`left`/`right` all
       `>= 2`. Confirmed it failed for the right reason first
       (`hitSlop` was `undefined`) before implementing.
     - Fix: added `hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}` to
       each swatch's `Pressable`, bringing the effective tap target to
       ~48x48. Verified no overlap risk: swatches sit `spacing.sm` (8px)
       apart horizontally (`marginRight`), so 2px hitSlop per side leaves a
       4px gap between neighboring hit zones; vertically the swatches are a
       single row inside a horizontal `ScrollView` with no sibling
       above/below, so vertical hitSlop has nothing to overlap. No visual
       change — `hitSlop` only affects the tappable area, not rendering.
     - Verified `npx tsc --noEmit` clean, full suite 25/25 suites and
       178/178 tests passing (177 baseline + 1 new). No existing test
       touched, skipped, or renamed.
     - A code-review subagent independently re-verified the 8px-gap /
       2px-hitSlop-per-side no-overlap math against `theme/tokens.ts`'s
       actual `spacing.sm`/`spacing.xs` values, confirmed vertical hitSlop
       is safe given the single-row horizontal-`ScrollView` layout,
       confirmed `hitSlop` doesn't interfere with the parent `ScrollView`'s
       pan-responder/scroll gesture, confirmed the new test is
       non-tautological (would fail if hitSlop were removed or set below
       2), and confirmed only the two intended files changed. Approved
       with no required or optional changes.
     - Commit: `959f846` — `loop: add hitSlop to ColoringScreen's palette
       swatches for touch-target sizing`.
- Previous iteration's completed improvement (iteration 15, one commit): Phase 2 item 3
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
- Test status: **26/26 suites passing, 225/225 tests passing** (up from
  26/26 suites, 222/222 tests — iteration 24 added 3 new tests, all in a
  new `describe('card press animation / navigation safety', ...)` block in
  `__tests__/home/HomeScreen.test.tsx`; no existing test
  modified/removed/skipped).
- Previous test status: 26/26 suites passing, 222/222 tests passing (up from
  26/26 suites, 218/218 tests — iteration 23 added 4 new tests, all in a new
  `describe('leafNameOf', ...)` block in
  `__tests__/storage/folderAccess.test.ts`; no existing test
  modified/removed/skipped).
- Previous test status: 25/25 suites passing, 178/178 tests passing (up from
  24/24 suites, 169/169 tests — iteration 16 added 1 new suite,
  `__tests__/coloring/palette.test.ts` with 8 tests, plus 1 new test to
  `ColoringScreen.test.tsx` covering palette-swatch `hitSlop`).
- Previous test status: 24/24 suites passing, 169/169 tests passing (up from
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
19. **loop: add a brief animated correct-answer celebration to the quiz**
    (iteration 17, Phase 3 item 1, `Next` item from iteration 16)
    - Files: `src/quiz/QuestionRenderer.tsx` (production), `src/i18n/strings.ts`
      (production, 1 new key x 2 languages), `__tests__/quiz/QuestionRenderer.test.tsx`
      (8 new tests, no existing test modified)
    - What it does: when the child's selected answer is correct, a small
      rounded bubble (🎉 + a new short localized message,
      `t('quizCelebration', language)` → "Yay! ⭐" / "Juhu! ⭐") pops in with
      a scale+opacity spring/timing sequence (~200ms in), holds briefly
      (900ms), then fades out (300ms) — ~1.4s total, non-looping,
      non-flashing, and auto-resolves without any user action needed.
    - Built entirely with RN's built-in `Animated` API (`useRef(new
      Animated.Value(...))` + `Animated.sequence`/`parallel`/`spring`/`timing`/
      `delay`), per iteration 16's `Next` plan. **Technical decision**:
      `react-native-reanimated` IS present in `package.json`, but it has no
      babel plugin wired into `babel.config.js` and is used nowhere in the
      app today — wiring it up would be a build-config change, judged
      riskier than warranted for an unsupervised overnight iteration with no
      device/emulator to verify a native rebuild against. RN's `Animated` is
      bundled with `react-native` itself, so this is "no new dependency"
      either way.
    - Layout/screen-fit: the celebration bubble is `position: 'absolute'`
      (pinned to the top of the column, over the question card — never over
      the feedback row/Next button), so it sits outside this screen's
      carefully-tuned proportional flexbox layout entirely and cannot force
      the existing ScrollView safety net to engage on a small device.
    - Safety/correctness:
      - Cleanup: the effect's `return () => animation.stop()` cancels the
        in-flight animation on unmount, on question change, or when
        `isCorrect` flips back to false — no leaked timers/handles. An
        `isMountedRef` additionally guards the `.start()` completion
        callback's `setShowCelebration(false)` against firing after unmount
        (defense in depth; a code-review subagent noted `.stop()` already
        makes this technically redundant since it fires the callback with
        `finished:false`, but kept it as harmless, consistent with this
        app's existing `cancelled`-flag effect-cleanup idiom).
      - Double-fire guard: the effect is keyed on `[isCorrect, question.id,
        scaleAnim, opacityAnim]` — re-renders with the same correct answer
        cannot restart it. This is on top of (not a replacement for) the
        pre-existing `!hasAnswered` guard in `renderOption`'s `onPress`,
        which already prevents `onSelect`/scoring from firing more than
        once per question under rapid/repeated tapping. `question.id` was
        added to the dependency array (beyond just `isCorrect`) per
        code-review feedback, as defense-in-depth against `QuizScreen`'s
        reset-`selectedOptionId`-to-`null`-before-advancing contract ever
        changing in a future edit.
      - Next button: never gated, delayed, disabled, or visually covered by
        the celebration (`pointerEvents="none"` on the overlay, plus the
        positioning noted above) — verified by a dedicated test that taps
        "Next" while the celebration is showing and confirms `onNext` fires
        immediately. No new `setTimeout`-driven auto-advance was introduced.
    - Accessibility decision: the celebration bubble is marked
      `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`
      (purely decorative, hidden from screen readers) because the
      pre-existing `feedbackText` ("Correct!"/`quizCorrect`) already
      announces the result — this avoids a redundant/competing
      announcement. A code-review subagent confirmed this is a reasonable
      call, not a gap.
    - i18n: `quizCelebration` added to `UI_STRINGS` for both `en`/`de` in
      the same commit; automatically validated by the existing generic
      completeness test in `__tests__/i18n/strings.test.ts` (asserts every
      key has a non-empty value in both languages) — no dedicated test
      needed beyond that.
    - TDD: 8 new tests written first against the (still static-only) 🎉
      banner and confirmed failing for the right reason (`quiz-celebration`
      testID did not exist yet), then implemented until green. One
      RNTL-specific gotcha hit and resolved during this: because the
      overlay is intentionally hidden from the accessibility tree, RNTL's
      default `getByTestId`/`getByText`/`queryByTestId` queries (which skip
      accessibility-hidden nodes) could not find it — fixed by passing
      `{ includeHiddenElements: true }` in the tests that need to look
      inside it, not by changing the accessibility props themselves.
    - Code review: a code-review subagent reviewed the diff against all 8
      focus areas from the iteration brief (cleanup, double-fire, Next-button
      correctness, i18n completeness, motion-safety, screen-fit, hard
      limits, accessibility) and returned "Approve with nits" — the one nit
      (dependency-array robustness) was addressed (see above) before commit.
    - tsc: clean. Tests: 25/25 suites, 186/186 tests (up from 178/178
      baseline; +8 new, 0 modified/removed/skipped).
    - Commit: `5cdcd6e`.
20. **loop: add age-tiered encouraging wrong-answer feedback and a Try Again
    action to the quiz** (iteration 18, Phase 3 item 2 from the original
    spec)
    - Files: `src/quiz/QuestionRenderer.tsx`, `src/quiz/QuizScreen.tsx`,
      `src/i18n/strings.ts` (production, 2 new keys x 2 languages, 1 old key
      removed); `__tests__/quiz/QuestionRenderer.test.tsx` (9 new tests, 1
      pre-existing test's expected wording string updated in place),
      `__tests__/quiz/QuizScreen.test.tsx` (2 new tests, 1 pre-existing
      test's expected wording string updated in place).
    - Read first (per protocol): `QuestionRenderer.tsx`, `QuizScreen.tsx`,
      `Profile`/`RootNavigator.tsx` (age flow), both test files, and
      README.md's quiz-feedback claim ("Shows correct/incorrect feedback on
      each answer, then a final score" — no explicit reveal requirement).
      Two existing-behavior facts, found by reading rather than assumed,
      shaped the whole design:
      1. An existing, unmodified test
         (`marks the correct option with a checkmark and the wrong tapped
         option with an X once answered`) already locks in that the correct
         option's checkmark IS revealed immediately on a wrong pick. Per
         this iteration's own instructions ("Do NOT reveal the correct
         answer immediately, unless... existing quiz behavior clearly
         requires something else"), this pre-existing reveal was left
         completely untouched rather than "fixed" — changing it would have
         broken a passing test for a behavior the brief explicitly permits
         keeping.
      2. An existing, unmodified-in-spirit test (now with only its expected
         string updated) already required "Next" to work standalone after a
         wrong answer: press wrong → press `quiz-next` → advance, score 0.
         So "Try Again" was added ALONGSIDE Next, not as a replacement —
         again per the brief's own "unless existing behavior clearly
         requires something else" carve-out.
    - Age tier: a new optional `childAge?: number` prop on
      `QuestionRenderer` (`childAge <= 4` → young, else → older; defaults to
      older if omitted). Wired from the real per-profile age already
      threaded end-to-end in this app — `RootNavigator.tsx` passes
      `profile.age` into `QuizScreen`'s existing `childAge` prop (previously
      only used for `buildSession`'s age filtering), which now also forwards
      it to `QuestionRenderer`. Not hardcoded to one age group.
    - i18n: removed the single old `quizIncorrect` key (`en`: "Try again!",
      `de`: "Versuch es nochmal!" — grepped first to confirm it was used
      nowhere else) and added two new keys, both en+de, in the same commit:
      `quizIncorrectYoung` (en: "Good try! Let's try again.", de: "Gut
      versucht! Versuchen wir's noch mal.") and `quizIncorrectOlder` (en:
      "Nice try! Take another look.", de: "Netter Versuch! Schau noch mal
      genau hin.") — warm, natural phrasing in each language (not mirror
      translations of each other), never harsh/shaming, automatically
      validated for non-empty en/de by the existing generic completeness
      test in `__tests__/i18n/strings.test.ts`.
    - New "Try Again" action: a `quiz-retry-answer` `Pressable` (styled
      distinctly — yellow `colors.sun`/`sunDark` vs Next's coral — with
      `accessibilityRole="button"`/`accessibilityLabel={t('retry',
      language)}`, reusing the existing `retry` i18n key rather than adding
      a new one) appears next to Next only when the answer is wrong. Pressing
      it calls a new `onRetry` prop, wired in `QuizScreen` to
      `handleRetry = () => setSelectedOptionId(null)` — this ONLY clears the
      local UI selection (re-enabling the option grid so the child can pick
      again on the same question); it never calls `answerCurrentQuestion`.
    - Duplicate-scoring guard for the retry path (this iteration's specific
      ask): scoring happens in exactly one place, `QuizScreen.handleNext`,
      gated by `if (selectedOptionId === null) return`, and is only ever
      invoked by pressing Next. Since `handleRetry` never touches scoring
      and only ever resets `selectedOptionId` to `null`, no number of
      retries (including rapid repeated taps on Retry or on a wrong option)
      can cause a question to be scored more than once, and whichever
      selection is current at the moment Next is actually pressed is the
      only thing that counts — verified by a new test that retries once,
      picks correctly on the second attempt, and confirms the final score is
      exactly 1 point for that question (not 0, not 2).
    - Screen-fit: the wrong-answer footer now shows two buttons
      (`feedbackButtonGroup`, `flexDirection: 'row'`) instead of one, sized
      with smaller padding (`spacing.xs`/`md` vs the correct-path button's
      `spacing.sm`/`xl`) specifically so the footer's total height doesn't
      grow. `numberOfLines`/`adjustsFontSizeToFit` was added to the feedback
      text and both button labels so the longer new wording shrinks rather
      than wraps/clips. This section is outside the flexed
      question/grid column (auto-sized, unchanged flex ratios), so it can't
      alter the screen's carefully-tuned no-scroll layout math — real-device
      confirmation still flagged under Visual Review Required.
    - TDD: wrote all new tests first (age-tier wording in en/de, retry shows
      alongside Next but not on a correct answer, retry calls `onRetry` and
      not `onSelect`/`onNext`, no answer-text leakage through the new
      wording, and the QuizScreen-level double-scoring test) and confirmed
      them failing for the right reason (the `quizIncorrect` key no longer
      existed, so every render crashed with `Cannot read properties of
      undefined` until the component was updated) before implementing.
    - Two pre-existing tests had ONLY their expected wrong-answer wording
      string updated in place (from the old generic text to the new
      age-tiered text matching their given `childAge`) — this is an
      intentional, documented copy change, not a weakening: no assertion was
      removed, loosened, or skipped, and both tests still exercise exactly
      the same behavior (wrong-answer feedback text + Next still advances
      and scores correctly) they did before.
    - Code review: a code-review subagent independently re-ran `tsc`/jest,
      re-verified the age-flow wiring end-to-end from `RootNavigator.tsx`,
      re-confirmed the untouched-checkmark-reveal test still passes and no
      new code path leaks the answer, confirmed no double/lost-scoring path
      including rapid taps, confirmed accessibility labeling and
      screen-fit-conscious sizing, and approved with one cosmetic nit
      (curly vs straight apostrophes in the new strings, inconsistent with
      the rest of `strings.ts`) — fixed before committing.
    - tsc: clean. Tests: 25/25 suites, 196/196 tests (up from 186/186
      baseline; +11 new net across both files, 2 pre-existing wording
      assertions updated in place, 0 removed/skipped).
    - Commit: see `git log` on `overnight-improvements`, message `loop: add
      age-tiered encouraging wrong-answer feedback and a Try Again action to
      the quiz`.
20. **loop: add a screen-reader progress label to the quiz's existing
    progress dots** (iteration 19, Phase 3 item 3, "quiz progress clarity").
    - First read `QuizScreen.tsx`/`QuestionRenderer.tsx`/`quizSession.ts` in
      full per this iteration's instructions, expecting to build a progress
      indicator from scratch — instead found the app **already has** a row
      of small progress dots (`quiz-progress`, one `quiz-progress-dot-${i}`
      per question, `progressDotDone`/`progressDotCurrent` styling), wired
      correctly to the real `currentIndex`/`totalQuestions` props that
      `QuizScreen.tsx` already passes down from `QuizSessionState`. This
      predates the overnight loop (`git log` traces it to a pre-loop commit,
      `0bb51e7 "Polish quiz screen: progress dots, ..."`) and had **zero**
      test coverage anywhere in the repo and **no accessibility label** —
      the dots are plain, unlabeled `<View>`s, so a screen-reader user got
      no progress information at all. Given the existing dots already
      satisfy the brief's "row of simple markers... lightweight, no new
      dependencies, no clutter for ages 2-4" guidance visually, judged the
      right-sized iteration-19 improvement to be closing the two real gaps
      (accessibility, tests) rather than redesigning or duplicating an
      already-correct visual, per the brief's own explicit review checklist
      item: "should the progress indicator have an accessibilityLabel like
      'Question 2 of 5'?".
    - Added a new i18n key, `quizProgressLabel` (en: `"Question {current} of
      {total}"`, de: `"Frage {current} von {total}"`) to `src/i18n/
      strings.ts`, alongside both languages in the same commit.
    - In `QuestionRenderer.tsx`, added `accessible`, `accessibilityRole=
      "text"`, and `accessibilityLabel={tFormat('quizProgressLabel', ...)}`
      (1-based `currentIndex + 1`) to the existing `progressRow` View. No
      new visible `Text`/`View` was added — `accessible={true}` on the
      parent collapses the row (and its unlabeled dot children) into ONE
      screen-reader-focusable node carrying the label, instead of TalkBack/
      VoiceOver reading N separate unlabeled dots. This is a pure
      accessibility addition: zero visual/layout change, so zero new
      screen-fit risk on a Galaxy S22 (verified by inspection — the diff
      touches only props on an already-unchanged-size View).
    - Correctness against real session state (traced, not assumed):
      `quizSession.ts`'s `initialSessionState` sets `currentIndex: 0`
      (confirms 0-based, hence the `+1` for the 1-based spoken label);
      `answerCurrentQuestion` (only called from `QuizScreen.handleNext`) is
      the only place `currentIndex` ever changes; `QuizScreen.handleRetry`
      only calls `setSelectedOptionId(null)` and never touches session
      state — so the label can never appear to move/reset during a "Try
      Again" retry, and `QuizScreen`'s `state.isFinished` branch renders the
      score card instead of `QuestionRenderer` entirely, so no stale
      progress label/dots exist once the quiz ends.
    - TDD: wrote 5 new tests in `__tests__/quiz/QuestionRenderer.test.tsx`
      (dot count matches `totalQuestions` with no extra/missing dot,
      current-dot-vs-later-dot size distinction via `StyleSheet.flatten`,
      the en/de accessibility label text, and confirming no visible "2 of
      5"/"2 / 5" text node exists) and 2 in `__tests__/quiz/
      QuizScreen.test.tsx` (label unchanged across a real wrong-answer +
      "Try Again" cycle but advances correctly on Next; no `quiz-progress`
      testID or matching accessibility label survives into the finished/
      score-card state) — all confirmed failing for the right reason
      (`Unable to find an element with accessibility label: ...`) before
      implementing the `accessibilityLabel` prop.
    - A code-review subagent independently re-traced the same
      `quizSession.ts`/`QuizScreen.tsx` call graph, confirmed
      `accessible`+`accessibilityRole="text"`+`accessibilityLabel` on a View
      is the standard correct RN collapsing pattern (no TalkBack/VoiceOver
      conflict), confirmed `tFormat`'s generic `{key}`-replace works
      identically for `{current}`/`{total}` as it does for the pre-existing
      `{score}`/`{total}` in `quizScore`, confirmed the German phrasing is
      natural, confirmed the hardcoded `14`/`18` pixel values in the new
      tests match the actual pre-existing `progressDot`/`progressDotCurrent`
      styles (not invented), confirmed no visible UI was added, and
      confirmed no pre-existing test was weakened/removed/skipped. Approved
      with no required or optional changes.
    - Verified `npx tsc --noEmit` clean, full suite 25/25 suites and
      **203/203 tests** (196 baseline + 7 new, 0 removed/modified).
    - Commit: see `git log` on `overnight-improvements`, message `loop: add
      a screen-reader progress label to the quiz's existing progress dots`.
21. **loop: add a subtle press animation to HomeScreen's feature cards**
    (iteration 24, Phase 4 item 1, per iteration 23's `Next` note).
    - Read `src/home/HomeScreen.tsx` and its existing test file in full
      first: the 4 cards are `Pressable`s with `onPress={() =>
      onNavigate(card.destination)}` and no `onPressIn`/`onPressOut` at all
      before this iteration, and `src/quiz/QuestionRenderer.tsx`'s
      correct-answer celebration (iteration 17) for the established
      `Animated.Value` via `useRef`, native-driven `Animated.spring`/
      `timing`, and unmount-cleanup conventions.
    - Added one persistent `Animated.Value` per card (keyed by `testID`, not
      array index, so it can't get mismatched if `CARDS` is ever reordered),
      and wired `onPressIn`/`onPressOut` to a small `animateCard` helper that
      springs the value to `0.95`/back to `1` via `Animated.spring(...,
      { useNativeDriver: true })`. The scale is applied via `transform` on a
      new `Animated.View` (`cardInner`) that wraps only the card's *visible
      content* (emoji + label), while the outer `Pressable` keeps its
      original fixed `width`/`height` style untouched — so the press
      animation is a pure visual transform with zero layout/size change (no
      Galaxy S22 screen-fit risk, confirmed by inspection: `transform` never
      participates in Yoga's layout pass).
    - Double-fire guard: `onPress` (navigation) was found to be genuinely
      decoupled from the animation — the two are separate `Pressable` props
      with no shared await/chaining. But `src/navigation/RootNavigator.tsx`
      confirms HomeScreen is NOT unmounted when it pushes a card's
      destination (React Navigation's native stack keeps the previous screen
      mounted underneath), so a rapid double-tap on the SAME card really
      could call `onNavigate` twice before the first navigation completes —
      the same risk category as iteration 21's Play Again/Home guards. Added
      a `navLockRef` keyed **per card testID** (not one lock shared across
      all four): the app already allows a child to tap several *different*
      cards in quick succession (the pre-existing "shows the child name and
      all four feature cards" test presses all 4 in sequence) — that's a
      genuinely different action each time, not a duplicate of the same one,
      so only a repeated tap on the *same*, still-locked card is blocked.
      Each card's lock re-arms itself 800ms after firing (well past any
      realistic double-tap, far short of any real "browsed a gallery and
      came back" return trip), via a `setTimeout` whose ID is tracked in
      `rearmTimeoutsRef` and cleared on unmount, alongside `.stop()` on any
      still-running `Animated.CompositeAnimation` tracked in
      `activeAnimationsRef` — belt-and-braces cleanup, though neither is
      strictly required for correctness (a bare `Animated.Value` flip after
      unmount can't cause a setState-after-unmount warning, and a
      native-driven spring runs on the UI thread, not a JS timer that could
      outlive the screen).
    - TDD: added a `describe('card press animation / navigation safety',
      ...)` block to `__tests__/home/HomeScreen.test.tsx` (3 new tests) —
      a plain press still calls `onNavigate` exactly once with the right
      destination; pressing the SAME captured card element twice (the same
      "stale double-tap" shape as `QuizScreen.test.tsx`'s Play Again guard
      test) calls `onNavigate` only once; and pressing two *different* cards
      in sequence still calls `onNavigate` for both (proving the guard is
      per-card, not an over-broad shared lock that would silently break a
      child who taps the wrong card and immediately taps the right one).
    - A real complication surfaced during TDD, documented in a code comment
      in the test file: a first attempt manually fired raw `'pressIn'`/
      `'pressOut'` events via `fireEvent(card, 'pressIn'/'pressOut')` to
      simulate a real touch's full press sequence and directly exercise the
      animation start. This started a real native-driver `Animated.spring`
      with no actual native module behind it under Jest, which left the
      RNTL test renderer in a corrupted state (`render()` on the *next* test
      returned a null tree, `console.error`'d "overlapping act() calls",
      and unrelated later tests failed to find elements that were
      definitely being rendered) — a known category of RN-testing pitfall.
      Confirmed via inspection that `fireEvent.press` alone never
      synthesizes `pressIn`/`pressOut` in this testing library anyway, so
      the tests were rewritten to use plain presses only, relying on that
      plus direct code-reading (`onPress`/`onPressIn`/`onPressOut` are
      separate props with no shared logic) to verify navigation-timing
      correctness — per this iteration's own instructions, this is the
      documented "not practically testable without excessive mocking,
      rely on the navigation-correctness tests" fallback, not a gap.
      Separately, all `fireEvent.press` calls in the new tests were changed
      to `await fireEvent.press(...)` (matching the pre-existing test's
      style) after discovering un-awaited presses caused the same kind of
      act()-scope leakage across tests even without any animation involved.
    - Verified `npx tsc --noEmit` clean, full suite **26/26 suites, 225/225
      tests** (222 baseline + 3 new; no existing test modified, skipped, or
      renamed).
    - A code-review subagent independently reviewed the diff: confirmed
      `activeAnimationsRef`'s per-testID overwrite-on-each-press pattern
      can't leak (RN's `Animated.Value` only tracks one active animation at
      a time; starting a new spring implicitly interrupts the previous one,
      and `.stop()` on an already-finished animation is a safe no-op),
      confirmed the per-card (not shared) lock granularity is correct and
      race-free (RN's press dispatch is synchronous on the JS thread, so the
      ref read/write in `handleCardPress` can't be torn), confirmed the
      800ms re-arm window can't realistically drop a legitimate tap,
      confirmed `onPress`/`onPressIn`/`onPressOut` are genuinely decoupled
      so navigation timing is unaffected, confirmed no hard-limit
      violations (no new deps, no `any`/`ts-ignore`, no native/config files
      touched, no test weakened), and confirmed the tests are
      non-tautological and the test file's documented pressIn/pressOut
      workaround is a reasonable, honestly-labeled engineering tradeoff
      rather than a false claim of animation coverage. Two non-blocking
      nits raised (unbounded `rearmTimeoutsRef` growth until unmount at 4
      cards max — harmless; the `as Record<string, Animated.Value>` cast on
      `Object.fromEntries` is a mild type-assertion smell, not unsafe) —
      left as-is, not required. **Approved.**
    - Commit: see `git log` on `overnight-improvements`, message `loop: add
      a subtle press animation to HomeScreen's feature cards`.

## Pure-Logic Module Inventory (for future iterations)
Modules with pure/mostly-pure logic, current test coverage, and possible gaps:

| Module | Purpose | Existing tests | Possible future edge cases |
|---|---|---|---|
| `src/coloring/floodFill.ts` | Flood-fill fill algorithm on RGBA buffer | `__tests__/coloring/floodFill.test.ts` (10 tests as of iteration 9) — now also covers out-of-range seed coordinates, the tolerance-exact-boundary case, and the 1x1-image case | no further named gaps identified; a "fully-filled image, no border at all" case would be redundant with the existing no-op/re-tap tests (same code path) |
| `src/coloring/base64.ts` | Dependency-free base64 decoder | `__tests__/coloring/base64.test.ts` | invalid/malformed base64 input (non-multiple-of-4 length without padding), empty string, whitespace-only input |
| `src/coloring/palette.ts` | Static color palette data (`display`/`fill`/`nameKey` per entry) | indirectly covered via `__tests__/coloring/ColoringScreen.test.tsx`'s palette-label tests (iteration 15) | could still add a smoke test asserting no duplicate `fill` values, valid RGBA ranges, and that every `nameKey` resolves to a non-empty string in both languages |
| `src/puzzle/puzzleGrid.ts` | Board sizing, grid dimensions, piece rects, row grouping, shuffle-with-guaranteed-non-identity | `__tests__/puzzle/puzzleGrid.test.ts` (34 tests as of iteration 6) — now also covers `groupPiecesIntoRows`'s ragged-final-row and shorter-than-`cols` cases | `computePuzzleBoardSize`'s "insets exceed window entirely" case assessed in iteration 4: judged equivalent in code-path terms to the existing "floors to the minimum size when the window is very small" test; not treated as a real gap. No further known gaps in this module as of iteration 6. |
| `src/quiz/filterQuestions.ts` | Age-range filter | `__tests__/quiz/filterQuestions.test.ts` | already well covered (in-range, boundary-inclusive, empty-result) |
| `src/quiz/loadQuestions.ts` | JSON parsing/validation of `questions.json`, image URI resolution | `__tests__/quiz/loadQuestions.test.ts` | re-audited iteration 23: duplicate option IDs, `minAge > maxAge` rejection, and neither-`text`-nor-`image` are all now actually covered (this row was stale) — only "option `text` present but missing one language key" remains genuinely untested |
| `src/quiz/quizSession.ts` | Session building (shuffle + slice to 20), score/finish state machine | `__tests__/quiz/quizSession.test.ts` (10 tests as of iteration 3) — now covers fewer-than-20-eligible, 0-eligible, already-finished no-op, and normal score/advance paths | well covered now; no further gaps identified in this module |
| `src/quiz/shuffle.ts` | Fisher-Yates shuffle | `__tests__/quiz/shuffle.test.ts` | empty array, single-element array, custom deterministic `rng` producing a known permutation |
| `src/storage/folderAccess.ts` | SAF folder helpers: `leafNameOf`, `findChildUri`, `ensureContentStructure` | `__tests__/storage/folderAccess.test.ts` (10 tests as of iteration 23) — now includes a dedicated `describe('leafNameOf', ...)` block covering unencoded/partially-encoded URIs, no-slash input, and the trailing-slash case (documented: returns `''`, not the segment before it) | well covered now; no further gaps identified in this module |
| `src/storage/folderMigration.ts` | Copy+verify+delete folder migration, `isSameOrNestedWithin` same/nested detection | `__tests__/storage/folderMigration.test.ts` (10 tests as of iteration 4) — covers same-folder, real nesting both directions, the `primary:` volume-root boundary, and (as of iteration 4) the sibling-prefix-name non-nested case | well covered now; no further gaps identified in this module |
| `src/storage/folderPathDisplay.ts` | SAF URI → human-readable path | `__tests__/storage/folderPathDisplay.test.ts` (7 tests, added iteration 2) — covers primary/non-primary volumes, malformed encoding, missing `/tree/` marker, empty path after volume, fully empty input, doubled-slash collapsing | well covered now; could add a Windows-style/UNC-ish edge case if one is ever reported, but not a known real-world SAF shape |
| `src/storage/profileStore.ts` | AsyncStorage get/save profile with JSON parse guard | `__tests__/storage/profileStore.test.ts` — now also covers the optional `pictureUri` field round-tripping both when set and when absent (iteration 28) | corrupted/non-JSON stored value (should return `null`, not throw) — verify covered |
| `src/storage/profilePicture.ts` | `resolveProfilePictureUri`: graceful existence check for an optional local profile-picture URI, never throws | `__tests__/storage/profilePicture.test.ts` (4 tests, added iteration 28) — null/undefined/empty input, existing file, missing file, rejected filesystem check | new module, fully covered on introduction; no known gaps |
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
**Iteration 30 priority**: Phase 4 item 5 (optional child profile picture)
is now fully closed out — both the Settings picker UI and the HomeScreen
display wiring landed in iteration 29 (see Current Status for full detail).
This should NOT be re-treaded without new evidence (e.g. a real device
review surfacing an actual visual problem — see Visual Review Required
below for what specifically needs eyes-on confirmation).

With every Phase 4 fast-follow item now closed (item 1: home card press
animations, iteration 24; item 3: palette completeness, iteration 25; item
4: coloring usability confirm+undo, iterations 26-27; item 4's empty-state
half, closed with no fix needed, iteration 28; item 5: profile picture,
iteration 29), **iteration 30 should start a fresh pass looking for the
next-highest-value gap**, the same way iteration 21 (home card polish) and
iteration 23 (this profile-picture item) were originally discovered — reread
the original spec/brief against the app's current real behavior (not
assumptions) across screens not recently touched (Onboarding, Quiz, Video),
looking specifically for: any remaining screen-fit risk on short/narrow
landscape devices this codebase hasn't already ruled out with real math: any
accessibility gap (missing accessibilityLabel/hitSlop) on a control added
before iteration 12's labeling sweep; or any other genuinely real (not
manufactured) usability/safety gap for a 2-8 year old. If nothing new turns
up, Phase 4 can be considered complete and iteration 30 should say so
explicitly and pick a maintenance-quality task (e.g. a direct-coverage test
for a currently untested pure function, following the established pattern
from iterations 8/10/18/19 etc.) rather than inventing unnecessary UI churn.

Iteration 28 closed out both of its own brief's parts — see Current Status
for full detail (Part A: `flexWrap` fix for the coloring toolbar row,
commit `a1af79a`; Part B: empty-state confirmation, no fix needed, plus the
profile-picture data-layer slice, commit `a7c905a`). Neither should be
re-treaded without new evidence — Part A's toolbar-wrap fix specifically
should not be revisited unless a real device review finds an actual visual
problem with 2-row wrapping (see Visual Review Required), and Part B's
empty-state conclusion should not be re-investigated without new evidence
per the same standard iteration 20/22/etc. have all used.

Iteration 27 closed out the flood-fill-undo slice of Phase 4 item 4 — see
Current Status for full detail (one commit, single-level undo, no
confirmation dialog needed since it's cheap/reversible unlike
clear-drawing). It should not be re-treaded without new evidence (e.g. a
real device review surfacing a specific problem with the new Undo
button's sizing/wording, or a request for multi-level undo).

Iteration 26 closed out the `clear-drawing` confirmation slice of Phase 4
item 4 (coloring usability) — see Current Status for full detail. It
should not be re-treaded without new evidence (e.g. a real device review
surfacing a specific problem with the new Alert.alert dialog's wording,
sizing, or timing).

Iteration 24 closed out Phase 4 item 1 (home card press animations) — see
Current Status / Completed #21 for full detail. It should not be re-treaded
without new evidence.

Iteration 25 closed out Phase 4 item 3 (color palette exhaustiveness) — see
Current Status for full detail. Genuine gaps were found and closed (light/
pastel, dark-beyond-black, skin-tone-friendly), 12 -> 17 colors, one commit.
It should not be re-treaded without new evidence (e.g. a real device review
surfacing a specific problem with one of the 5 new swatches).

**Iteration 26 should pick up Phase 4 item 4 (coloring usability)**: the
brief that introduced this iteration's task named this as the next fallback
— accidental fills, a reset/undo confirmation before destructive actions,
a way to clear/deselect the current color, and friendly empty states.
Before implementing anything, read `src/coloring/ColoringScreen.tsx` fully
(already read this iteration — the `clear-drawing` button currently clears
ALL pen strokes with a single tap and NO confirmation, which is exactly the
"accidental destructive action" risk category the brief warns about for a
2-8 year old audience prone to mis-taps) and check whether flood-fill taps
have any equivalent problem (a mis-tap flood-fills a whole region instantly
with no undo at all — worth deciding whether an undo affordance is in scope
or too large for one iteration; if too large, scope down to just the
`clear-drawing` confirmation, which is a small, safe, well-bounded slice).
Also check for a "friendly empty state" gap: what does the coloring canvas
show before the very first tap on a page with no fillable regions or before
any tool is used — likely nothing needed since the source photo itself is
always visible, but verify by reading the render logic rather than
assuming. If, after investigation, none of item 4's sub-items turn out to
be a genuine gap, fall through to Phase 4 item 5 (optional child profile
picture) per iteration 23's ordering — only start it if a safe first slice
can be fully scoped AND completed in one iteration, otherwise write a
scoped plan into this section instead of half-building it.

Iteration 20 closed out the progress-dots overflow question definitively
(see Technical Decisions: NOT a genuine risk, given the app's landscape-only
lock — no code change needed, one documenting test added). It should not be
re-investigated without new evidence.

Iteration 21 closed out the quiz completion screen's missing-actions gap
(Phase 3/4's "positive completion screen" item) — see Current Status for
full detail. It should not be re-treaded without new evidence.

Iteration 22 closed out the touch-target sweep across
coloring/puzzle/video/settings/onboarding galleries AND the long-deferred
`AgePicker.tsx` check — see Current Status for full detail (4 commits:
`4e13e3a`, `3b6155b`, `5669899`, `030ec1d`). It should not be re-treaded
without new evidence. `VideoPlayerScreen.tsx`'s retry button was checked
and found already borderline-adequate (~44px) with no clear gap.
`OnboardingScreen.tsx` was specifically double-checked (it defines its own
language-pill/folder-button styles separately from `SettingsScreen.tsx`,
NOT a shared style object — worth remembering for any future screen-parity
assumption) and fixed to match.

Iteration 23 closed out both items its own brief suggested checking:
`HomeScreen.tsx`'s four feature cards are confirmed comfortably oversized
(52px emoji + bold label + padding, no fix needed), and the Pure-Logic
Module Inventory was re-audited fresh against each module's *current* test
file rather than the table's own (partly stale) wording — closing
`leafNameOf`'s zero-direct-coverage gap and correcting the table's
`loadQuestions.ts` row, which had claimed 3 gaps that were already closed in
earlier iterations. It should not be re-treaded without new evidence.

**Iteration 23's honest finding for iteration 24 to act on**: the Pure-Logic
Module Inventory is now, for the first time, essentially fully closed except
for two small, genuinely low-value remaining items (do not force either into
a full iteration on their own without checking for something better first):
- `src/quiz/loadQuestions.ts`: "option `text` present but missing one
  language key" (e.g. `{ en: 'Cat' }` with no `de`) is still untested,
  though `isBilingualText`'s existing logic already correctly rejects it
  (the whole option — and therefore the whole question — is dropped by
  `isValidOption`/`isValidQuestion`, verified by inspection, just not by a
  dedicated test).
- `src/storage/profileStore.ts`: "corrupted/non-JSON stored value" is still
  untested, though the function's own `try { JSON.parse } catch { return
  null }` is trivially correct by inspection.

Given both remaining pure-logic gaps are now small and low-marginal-value,
iteration 24 was directed to **switch focus to the ORIGINAL SPEC's Phase 4
items** per this iteration's brief's fallback ordering — item 1 below is now
DONE (iteration 24, see Completed #21 / Current Status); items 2-3 are the
still-open fallback ordering for iteration 25+ (see the iteration-25 pointer
at the top of this section, which restates item 2 as the next pick):
1. ~~Phase 4 item 1 (home card press animations)~~ — **done, iteration 24.**
2. **Phase 4 item 3/4 (color palette exhaustiveness)** — verify the
   current 12-color `PALETTE` in `src/coloring/palette.ts` against the
   spec's exhaustive category list (basic/light/dark/warm/cool/
   skin-tone-friendly/neutral) rather than assuming 12 is enough; only
   add colors if a category is genuinely missing (remember any new color
   needs both an EN+DE `nameKey` per iteration 15's established pattern).
3. **Phase 4 item 5 (optional child profile picture)** — bigger feature;
   only start if a safe first slice can be fully scoped AND completed in
   one iteration, otherwise just write a scoped plan into this Next section
   for a future iteration rather than half-building it.

Still-open, deliberately deferred real-device check (unchanged from
iteration 19, still cannot be verified by this loop — see Visual Review
Required): iteration 18's age-tiered wrong-answer feedback + Try Again
action's two-button footer on a real Galaxy S22.

Secondary/fallback candidates (if the above turns out to need no code
change): visual polish follow-ups for iteration 17's quiz celebration,
deferred deliberately to keep that diff focused on correctness/safety first
(per the iteration brief's guidance to prioritize correctness over visual
complexity):
- The current celebration is a single static 🎉 + short text bubble that
  pops/fades. Possible small, still-Animated-API-only enhancements if this
  is picked up: a couple of small animated "sparkle" glyphs (e.g. ✨) drifting
  outward from the bubble on independent `Animated.Value`s, or a slight
  rotation/wiggle on the emoji itself. Keep the same hard constraints:
  bounded duration (~1-2s), no looping, `Animated` API only, cleaned up on
  unmount, `pointerEvents="none"`, positioned outside the flex layout.
- Consider whether the celebration bubble's position (currently pinned to
  the top of the column, over the question card) is the best spot on a real
  device — this was a "seems safe" choice made without visual verification;
  see the Visual Review Required entry below for what to actually check on
  a Galaxy S22.
- Re-examine whether `QuestionRenderer.tsx`'s static feedbackEmoji at
  `feedbackRow` (still unanimated, unchanged this iteration) should also
  get a small pop-in treatment for visual consistency with the new overlay
  bubble, once the overlay's real-device look is confirmed good — deferred
  to avoid two rounds of animation-tuning in one iteration.
- **Unchanged from iteration 10** (still open, still small/optional): the
  `navigation.navigate(...)` call sites in `RootNavigator.tsx` and
  `HomeScreen.tsx` remain untyped against `RootStackParamList` (see
  Completed #13 and Technical Decisions) — a custom-typed wrapper around
  each render prop's `navigation` argument would close this; judged
  low-value enough to keep deferring.
- If none of the above are fruitful, continue the general Phase 2/3 sweep:
  the touch-target/motion-safety/screen-fit scan pattern used in iterations
  15-16 could be repeated against any newer screens, and the
  `AgePicker.tsx` minor touch-target check noted in iteration 16 (still
  "likely fine but unmeasured") remains open.

<details><summary>Iteration 17's original plan (now implemented — kept for
reference/audit trail, not actionable anymore)</summary>

Iteration 17 priority (DONE, see Completed #19): **begin Phase 3 item 1, a
joyful/brief/cancellable correct-answer celebration in the quiz flow.** This
was scoped but deliberately NOT started in iteration 16 (out of that
iteration's normal scope alongside the two already-completed improvements)
— the plan below is concrete and ready to execute:
- **Where to hook in**: `src/quiz/QuestionRenderer.tsx` is the file that
  renders the correct/incorrect feedback today (the static 🎉 emoji + `<Text>`
  banner using `t('quizCorrect')`, around lines 197-201, driven by the
  existing `optionCorrect`/`correctMark` styling at ~lines 91-138/310-345 and
  the `feedbackCorrectText`/`feedbackIncorrectText` styles at ~lines
  379-385) — NOT `QuizScreen.tsx`. Scoring itself happens later, in
  `src/quiz/quizSession.ts`'s `answerCurrentQuestion` (lines 28-39), called
  from `QuizScreen.tsx`'s `handleNext` (lines 111-114) when the child taps
  "Next" — `handleSelect` (`QuizScreen.tsx:107`) only sets
  `selectedOptionId` and does not itself score. The correct place to trigger
  a celebration is `QuestionRenderer.tsx`, keyed off its existing
  `hasAnswered && isCorrect`-style condition (whatever local prop/derived
  value already drives the current static 🎉 banner) — do NOT move scoring
  or restructure `QuizScreen`'s flow.
- **No animation API is in use anywhere in this codebase today** — a
  repo-wide grep (iteration 16) found zero uses of `Animated`,
  `useAnimatedStyle`, `withTiming`, `withSpring`, `Reanimated`,
  `LayoutAnimation`, `setInterval`, or `requestAnimationFrame` in `src/`.
  Use React Native's built-in `Animated` API (`import { Animated } from
  'react-native'` — already available, no new dependency) rather than
  reanimated (not installed, and the hard limits forbid new dependencies).
  A `useRef(new Animated.Value(...)).current` + `Animated.sequence(...)` or
  a single `Animated.spring`/`Animated.timing` pulse (e.g. scale 1 → 1.15 →
  1, or a brief fade-in) triggered in a `useEffect` keyed on the
  correct-answer condition is the standard, minimal pattern.
- **Hard-limit compliance to build in from the start**: keep the animation
  brief (a few hundred ms, not a long/looping sequence — must be
  non-flashing per the hard limits), clean it up on unmount (call
  `.stop()` on the `Animated.CompositeAnimation` returned by
  `.start()`/`.stop()` in the `useEffect` cleanup — same discipline as this
  app's existing effect-cleanup patterns elsewhere, e.g. the
  `cancelled`-flag guards in `QuizScreen`/`ColoringScreen`), and must NOT
  block or delay the child's ability to tap "Next" — the celebration should
  play alongside the existing UI, never gate/disable the Next button or
  auto-advance on a timer (there is currently no `setTimeout`-driven
  auto-advance anywhere in the quiz flow; do not introduce one, since a
  forced-wait timer could itself become a "blocks navigation" hard-limit
  violation for an impatient or accidentally-double-tapping child).
- **No new i18n strings are needed** — the existing `t('quizCorrect')` text
  stays; this is a purely visual/motion addition layered on top of it.
- **Test plan**: extend `QuestionRenderer.test.tsx` (not a new file) with a
  test that selects a correct option and asserts the animation actually
  starts (e.g. via `Animated.Value`'s tracked value using
  `jest.spyOn`/reading `_value`, or by asserting the relevant `Animated.View`
  renders) — avoid a real-time-based assertion (no `jest.advanceTimersByTime`
  race against a genuine timing-dependent animation, per the hard limits'
  "no arbitrary sleeps or timing-dependent tests").
- **Minor, much smaller optional check to bundle in if time remains**: this
  iteration's touch-target scan flagged `src/components/AgePicker.tsx`'s
  field/option rows as "likely fine" (padding-only sizing, no explicit
  fixed height) but not explicitly measured/tested the way
  `ColoringScreen`'s swatches now are — a quick follow-up could add an
  explicit `minHeight: 48`-equivalent style/test if inspection shows any
  row falling short, though nothing found so far indicates an actual gap.
- **Optional smaller follow-up (unchanged from iteration 10)**: the
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
</details>

## Visual Review Required
- **Iteration 29's optional profile picture (Settings picker + HomeScreen
  avatar)** — a genuinely new two-screen feature, source-verified and unit-
  tested but never seen rendered on a real device by this loop:
  - **Screens**: Settings (new "Profile Picture" card: circular preview or
    placeholder, "Choose a picture"/"Remove picture" buttons, `testID`s
    `settings-picture-preview`/`settings-picture-placeholder`/
    `settings-picture-choose`/`settings-picture-remove`) and its modal
    (`ProfilePicturePicker`, opened by "Choose a picture", listing the
    "pictures" folder's photos as 100x100 thumbnails); Home (small circular
    avatar or fallback-initial placeholder next to the greeting badge,
    `testID`s `home-avatar-image`/`home-avatar-placeholder`).
  - **Expected behavior**: Settings starts with a plain placeholder circle
    (no picture set). Tapping "Choose a picture" opens a modal listing
    photos from the same folder the Photo Puzzle already uses; tapping one
    closes the modal and shows it as the preview in Settings (NOT yet
    saved — the title bar/Save button state shouldn't change based on this
    alone). Pressing "Save changes" persists it; going to Home should then
    show that same picture as a small circular avatar next to the child's
    name. Pressing "Remove picture" in Settings + Save should revert Home
    back to the initial-letter placeholder. Specifically check: (1) the
    picker modal's thumbnails are a reasonable tap size and the Cancel
    button visibly closes it without picking anything; (2) the Home avatar
    is genuinely small/unobtrusive and does NOT visually crowd the
    settings gear icon on the opposite side of the header; (3) the header
    row's height doesn't visibly grow compared to before this iteration
    (should be imperceptible — the avatar was sized specifically to stay
    under the existing header budget, see Technical Decisions' `AVATAR_SIZE`
    math) and the 4 feature cards below it still fit with zero scrolling
    on the smallest available test device.
  - **Why flagged**: this is the single largest UI surface added in one
    iteration recently — two screens, a new modal, new touch targets — and
    while every individual layout claim was hand-verified against real
    style values (padding/border math) and covered by unit tests, none of
    it has been seen actually rendered. The `AVATAR_SIZE`/`headerReserve`
    screen-fit math specifically deserves a real-device check even though
    it was independently re-verified by a code-review subagent, per this
    loop's standing policy that layout math this codebase treats as
    "confidently safe" still occasionally warrants a look when a header's
    actual visual height changes for the first time in many iterations.
  - **EN+DE check**: "Choose a picture"/"Bild auswählen", "Remove
    picture"/"Bild entfernen", the modal's title "Choose a profile
    picture"/"Profilbild auswählen", and the "Profile Picture"/"Profilbild"
    card label — check none of these wrap awkwardly or get clipped in
    German (typically the longer-text language in this app).
  - **Ages affected**: this is a parent-facing setup feature (Settings) plus
    a small always-on child-facing decorative element (Home avatar) — all
    ages 2-8 see the Home avatar if a parent sets one; only a parent
    interacts with the Settings picker itself.
- **Iteration 28's coloring toolbar `flexWrap` fix** (layout change to the
  same toolbar row iteration 27's Undo button lives in — source-verified,
  math-checked, but never seen rendered on a real device by this loop):
  - **Screen**: Coloring (`coloring-toolbar-row` testID, the row containing
    Fill/Pen/conditional Undo/conditional Clear drawing above the palette
    strip).
  - **Expected behavior**: on any normal/typical landscape phone width, all
    visible buttons (2 in the common case, up to 4 after both a flood-fill
    tap and a pen stroke) should still fit on one line exactly as before —
    `flexWrap: 'wrap'` should have zero visible effect in this case. On a
    narrow-landscape device (or with German selected, since its button text
    runs longer), if 4 buttons genuinely can't fit on one line, they should
    now cleanly drop the overflowing button(s) to a second line rather than
    clipping off-screen or making any button unreachable/untappable.
    Confirm the wrapped second line (if one ever occurs on the test device)
    doesn't visually collide with the palette strip directly below it.
  - **Why flagged**: the underlying overflow risk was judged genuine but
    estimation-sensitive (hand-computed text-width math, not a measured
    pixel count — see Technical Decisions) — a real device is the only way
    to confirm both that the common case is visually unchanged and that
    wrapping (if it ever triggers) looks acceptable rather than merely
    "not broken."
  - **EN+DE check**: German is the more overflow-prone case (longer button
    text) — specifically worth checking on the narrowest available test
    device.
  - **Ages affected**: all ages 2-8 using the coloring screen — this is a
    layout-safety fix, not a new feature; nothing changes about what the
    buttons do.
- **Iteration 27's flood-fill Undo button** (new toolbar button, new toolbar
  row layout — source-verified but never seen rendered on a real device by
  this loop):
  - **Screen**: Coloring (`undo-fill` testID button, same toolbar row as
    "Fill"/"Pen"/"Clear drawing" above the palette strip — only visible
    right after a flood-fill tap, and only until used once or a new photo
    loads).
  - **Expected behavior**: with the Fill tool active (the default), tap
    inside the photo to flood-fill a region. An "↩️ Undo" button should
    appear in the toolbar row. Tapping it should instantly revert that
    fill (the photo/previous coloring state reappears) and the Undo button
    should disappear again — a single use, not repeatable without another
    fill first. Confirm the toolbar row doesn't wrap/overflow oddly with
    up to 4 buttons visible at once (Fill, Pen, Undo, Clear drawing all
    showing together, e.g. after both a fill and a pen stroke) — this is a
    plausible-from-source but real-device-unverified layout combination.
  - **EN+DE check**: switch to German and repeat — the button should read
    "↩️ Rückgängig".
  - **Ages affected**: all ages 2-8 using the coloring screen's fill tool
    — recovers from an accidental mis-tap flood-fill, the gap iteration 26
    flagged as still open for this age range.
- **Iteration 26's clear-drawing confirmation dialog** (new interaction —
  a native `Alert.alert` dialog, source-verified but never seen rendered
  on a real device by this loop):
  - **Screen**: Coloring (`clear-drawing` testID button, the toolbar row
    above the palette strip — only visible once at least one pen stroke
    has been drawn).
  - **Expected behavior**: draw at least one pen stroke (switch to the
    pen tool, drag a finger across the canvas), then tap "Clear drawing".
    A native confirmation dialog should pop up titled "Clear picture?"
    with the body text "This will erase your drawing." and two buttons,
    "Cancel" and "Clear". Tapping "Cancel" (or dismissing the dialog, e.g.
    Android back button) must leave every existing stroke on the canvas
    untouched. Tapping "Clear" must wipe all pen strokes and make the
    "Clear drawing" button itself disappear (it only renders when
    strokes exist). Confirm the dialog cannot be double-triggered by a
    fast double-tap on "Clear drawing" (should show once, not stack two
    dialogs).
  - **EN+DE check**: switch the app to German first and repeat the same
    flow — the dialog should read "Bild löschen?" / "Das löscht dein
    Bild." with buttons "Abbrechen" / "Löschen"; confirm neither string
    reads as awkward machine-translated German and that the tone feels
    calm/factual rather than alarming for a young child.
  - **Ages affected**: all ages 2-8 who use the coloring screen's pen
    tool — this specifically protects a child's already-drawn pen strokes
    from being lost to an accidental single tap, the exact risk this
    iteration's brief called out for this age range. (Flood-fill taps are
    NOT covered by this dialog — see the `Next` section's iteration 27
    priority for that still-open, deliberately-deferred gap.)
- **Iteration 25's expanded coloring palette** (5 new swatches, 12 -> 17
  total — a real layout change to a horizontal scroll strip, not a
  logic-only change, so a real-device check is warranted):
  - **Screen**: Coloring (`coloring-palette` testID, the horizontal
    swatch strip in the footer below the toolbar buttons).
  - **Expected new swatches**: 5 new circular swatches appended after the
    existing 12, in this order — a pale sky-blue pastel (Light Blue /
    Hellblau), a dark navy (Navy / Marineblau), then three skin tones from
    lightest to deepest (Light Skin / Helle Haut, Medium Skin / Mittlere
    Haut, Deep Skin / Dunkle Haut). Confirm each renders the correct fill
    color (no swapped/mislabeled swatches) and that tapping each one
    correctly fills/paints in that exact color (not an adjacent one).
  - **EN+DE check**: with a screen reader or long-press/inspect, confirm
    each new swatch's accessibility label reads the correct localized
    name in both languages ("Light Blue"/"Hellblau", "Navy"/"Marineblau",
    "Light Skin"/"Helle Haut", "Medium Skin"/"Mittlere Haut", "Deep
    Skin"/"Dunkle Haut") and that none of the new German wording reads as
    awkward or machine-translated in context.
  - **Small-screen / screen-fit check**: on a Galaxy S22 in landscape (the
    app's locked orientation for this screen), confirm the now-longer
    horizontal swatch strip still scrolls smoothly with no vertical growth
    and, critically, that the canvas above it has NOT shrunk or been
    pushed off-screen — the strip is a `horizontal` `ScrollView` and the
    canvas sizing math (`CANVAS_RESERVED_HEIGHT`) doesn't depend on
    palette length, so no regression is expected, but this is exactly the
    kind of layout claim that deserves a real look rather than trusting
    source inspection alone.
  - **Ages affected**: all ages 2-8 — every child using the Coloring
    screen sees the palette; the skin-tone additions in particular matter
    most for children old enough to intentionally color in a person's
    skin (roughly 4-8), while the pastel/navy additions broaden creative
    options for the whole range.
- **Iteration 24's home-card press animation** (new interaction feedback,
  no layout change — needs a real-device feel-check for animation timing,
  which source inspection alone can't confirm):
  - **Screen**: Home (the very first screen after onboarding, `home-card-*`
    testIDs on the 4 feature cards — Coloring/Quiz/Photo Puzzle/Videos).
  - **Expected behavior**: pressing down on any card should make it
    visually "squish" inward slightly (scale to ~0.95) almost instantly,
    then spring back to full size the moment the finger lifts (or the
    press is released/cancelled by dragging off the card) — a quick,
    springy, non-jarring feel, not a slow/mushy shrink-and-grow. The card's
    outer size/position must NOT visibly shift or reflow at any point
    (only the emoji+label inside appears to scale) and no flashing/
    flickering should be visible. Tapping (not holding) a card should
    navigate to its screen immediately — there should be no perceptible
    delay waiting for the squish animation to finish before the next
    screen appears.
  - **Interaction steps**: from Home, press and hold a finger down on each
    of the 4 cards one at a time (don't release immediately) to see the
    press-in squish and confirm it looks smooth/springy rather than
    stuttery; then do a normal quick tap on a card and confirm the
    destination screen appears without any felt delay; then try a rapid
    double-tap on the same card and confirm only one navigation happens
    (not two screens stacking, and not a confusing double-flicker).
  - **Ages affected**: all ages 2-8 — this is the very first interactive
    screen after onboarding, so first-impression feel matters across the
    whole age range; younger children (2-4) are more likely to press-and-
    hold or double-tap uncertainly, which is exactly the guarded double-tap
    scenario above.
  - **Small-screen check**: purely a `transform: scale` on existing content
    with no size/layout change, so no new Galaxy S22 screen-fit risk is
    expected (confirmed by source inspection — `transform` doesn't
    participate in Yoga's layout pass) — but the animation's real-device
    *feel* (spring stiffness/duration, whether 0.95 reads as "subtle" vs.
    "too much"/"too little" at actual screen density) genuinely cannot be
    verified from source alone and needs a real device or simulator check.
- **Iteration 22's touch-target sizing changes** (mostly invisible
  `hitSlop`-only changes, but two spots grow real, visible layout — worth a
  quick look, lower priority than the iteration 21 item below since the
  size increases here are small and the invisible-hitSlop parts by
  definition have zero visual delta):
  - **`AgePicker`'s modal age-option rows** (Onboarding and Settings, tap
    the age field to open): each of the 7 rows grows from ~42px to a firm
    48px tall (`minHeight` + centered text) — the modal as a whole grows by
    ~42px total. Expected: still comfortably fits centered on a landscape
    screen with room to spare, no scrolling, no clipping against the
    screen edges; rows should look slightly more spacious/easier to tap,
    not cramped or oddly spaced.
  - **`VideoGallery`'s video list rows**: each row grows from one tight
    line of text (~17px) to a firm 48px with the filename vertically
    centered. Expected: the list (a `FlatList`, intentionally scrollable —
    this is not a "child-facing screen requires scrolling" violation, it's
    a browsable list by design) should look like a normal, comfortably
    spaced list of tappable rows, not oversized or with odd empty space
    around short filenames.
  - **hitSlop-only changes** (zero visual delta expected, included here
    only for completeness): `AgePicker`'s closed field; the three gallery
    retry buttons; `SettingsScreen`'s/`OnboardingScreen`'s language pills
    and folder-change buttons. Nothing should look different at all for
    any of these — only the tappable area (which isn't visually rendered)
    changes. A quick check that no adjacent control now feels "too easy to
    mis-tap" would still be worthwhile, corroborating this iteration's
    source-level overlap analysis with a real thumb/finger.
  - **Ages affected**: all ages 2-8; touch-target sizing matters most for
    the youngest end of the range with less precise motor control.
  - **Needs real-device confirmation**: yes, but low urgency — the source-
    level math and sibling-overlap analysis were independently re-verified
    by a code-review subagent, so this is a corroboration check, not a
    known-risky change.
- **Iteration 21's quiz completion screen "Play Again" / "Home" buttons**
  (new visible UI, real layout risk — needs a genuine device/simulator
  check, not just source inspection):
  - **Screen**: `QuizScreen`'s completion ("isFinished") screen — the
    `🎉` emoji + star row + score-text card that already appears when a
    quiz session ends, now followed by a row of two new buttons.
  - **Expected behavior**: below the existing score card, a horizontal row
    with a green/mint "Play Again" button and a blue "Home" button, each with
    a bold white label, rounded corners, and a drop shadow matching the
    app's existing button style (same visual family as the Retry buttons
    elsewhere). Both buttons should look easily tappable (not cramped
    against each other or the card above) and the WHOLE screen — card plus
    both buttons — must fit without any scrolling or clipping, even in
    landscape on a short screen.
  - **Interaction steps**: play a quiz to completion (any score, including
    intentionally answering everything wrong to check the 0-score case).
    Tap "Play Again" — confirm the screen immediately shows a new first
    question (not the same one necessarily, since the session reshuffles),
    with the score/progress visibly reset. Play to completion a second time
    and tap "Play Again" again to confirm it still works after a repeat.
    Separately, from a fresh completion screen, tap "Home" — confirm it
    returns to the app's home screen (the four feature cards), not just a
    "back" pop to the wrong place. Try rapidly double-tapping each button
    (as fast as possible) — confirm nothing double-fires: "Play Again"
    shouldn't visibly flicker/skip a question, and "Home" shouldn't attempt
    to navigate twice or throw a navigation warning.
  - **EN+DE check**: switch the app language to German in Settings, replay
    a quiz to completion, and confirm the buttons read "Nochmal spielen" and
    "Start" — both should look natural and fit within the button without
    wrapping awkwardly or being truncated.
  - **Small-screen check (the real open question)**: on a Galaxy S22 (or
    equivalent short-landscape device/emulator), confirm the completion
    screen's card + button row together still fit entirely within the
    visible area with no scrolling, clipping, or overlap with the native
    header — this could not be measured precisely from source alone (a
    code-review subagent flagged it as "plausible but tight enough to
    warrant an actual check," see Current Status). If it doesn't fit,
    the fix is most likely reducing `spacing.lg` margin between the card and
    button row, or reducing `scoreCard`'s padding, not removing either
    button.
  - **Ages affected**: all ages 2-8 — this is the end of every quiz session
    for every child using the app, so it's a high-traffic screen; the
    tap-target sizing (`minHeight`/`minWidth: 48`) particularly matters for
    the youngest (2-4) end of the range with less precise motor control.
  - **Needs real-device confirmation**: yes, both the screen-fit question
    above and the general "does this feel good to tap for a small child"
    question — this loop can run automated tests but cannot see or touch a
    real screen.
- **Iteration 19's quiz progress-dots accessibility label** (no new visible
  UI — included here for completeness/audit trail, not because a sighted
  visual check is expected to find anything):
  - **Screen**: `QuizScreen` while a question is showing, rendered via
    `QuestionRenderer.tsx` — the existing small progress-dots row above the
    question card (`quiz-progress`, present since before this loop; visually
    unchanged by this iteration).
  - **Expected behavior**: purely non-visual. With a screen reader (TalkBack)
    enabled, focusing the dots row should announce "Question 2 of 5" (or the
    German equivalent, "Frage 2 von 5") as ONE spoken item — not silence, and
    not N separate unlabeled items read one after another. Visually,
    absolutely nothing should look different from before this iteration (no
    new text, no resized dots, no layout shift).
  - **Interaction steps**: enable TalkBack/VoiceOver, open the Quiz screen,
    swipe/focus onto the progress-dots row (above the question card), and
    listen for the announcement; then answer a question wrong, press "Try
    Again", and re-focus the row — it should announce the SAME "Question 1
    of N" (not "2 of N") since a retry doesn't advance.
  - **EN+DE check**: switch the app language in Settings and repeat with a
    screen reader in each language; confirm "Question X of Y" / "Frage X von
    Y" both sound natural read aloud.
  - **Small-screen check**: on a Galaxy S22 in landscape, visually confirm
    the dots row still looks exactly as it did before this iteration (no
    diff expected) — see the separate, still-open Next-section item about
    whether the dots row itself scales safely up to 20 questions, which is a
    distinct, larger concern this iteration deliberately did not touch.
  - **Ages affected**: all ages 2-8, but specifically matters for
    screen-reader-dependent users of any age in that range; sighted children
    are unaffected by this change (nothing changed for them to see).
- **Iteration 18's age-tiered wrong-answer feedback + "Try Again" action**
  (new visible UI, same screen as iteration 17's celebration above):
  - **Screen**: `QuizScreen` while a question is showing, rendered via
    `QuestionRenderer.tsx` — the feedback row below the answer grid, only
    when the tapped answer is WRONG (the correct-answer path is unchanged
    from iteration 17).
  - **Expected behavior, ages 2-4**: after tapping a wrong option, the
    feedback row shows "Good try! Let's try again." (English) /
    "Gut versucht! Versuchen wir's noch mal." (German) plus TWO small
    buttons side by side: a yellow "Retry"/"Erneut versuchen" button
    (`quiz-retry-answer`) and the pre-existing coral "Next"/"Weiter" button
    (`quiz-next`), both slightly smaller/more compact than the single
    full-size Next button shown on a correct answer.
  - **Expected behavior, ages 5-8**: identical layout/actions, but the
    wording is "Nice try! Take another look." (English) / "Netter Versuch!
    Schau noch mal genau hin." (German) — a touch less babyish than the
    2-4 wording.
  - **Which tier a real device shows depends on the child's profile age**
    (set during onboarding, `Profile.age`, 2-8) — to check both tiers on
    one device, change the profile's age via Settings (if editable) or
    re-run onboarding with a different age, then redo the wrong-answer flow.
  - **Interaction steps**: open Quiz → tap a WRONG answer → confirm the new
    wording (age-appropriate) and both buttons appear → tap "Retry"
    (`quiz-retry-answer`) → confirm the feedback row disappears, the wrong
    highlight/X-mark clears, and the answer grid is tappable again (the
    correct option's green checkmark, if still visible, is unchanged
    pre-existing behavior, not new) → pick the CORRECT option this time →
    confirm the normal "Correct!" + celebration + single Next button
    appears, exactly as before → tap Next → confirm the quiz advances
    normally and the end-of-quiz score reflects only ONE point for that
    question (not zero, not two).
  - **Potential visual concerns to check specifically**:
    1. Do the two side-by-side buttons (Retry + Next) fit comfortably in the
       feedback row's existing height without wrapping awkwardly or looking
       cramped, especially with the longer 5-8 wording next to them on a
       narrower device?
    2. Does the feedback text (`numberOfLines={2}`, `adjustsFontSizeToFit`)
       shrink gracefully rather than clipping if the row is tight?
    3. Is the "Retry" button visually distinct enough from "Next" (yellow vs
       coral) that a young child can tell they do different things, without
       needing to read the words?
    4. Confirm nothing scrolls on this screen at any point in this flow on a
       real Galaxy S22 (landscape) — the whole screen was already built to
       avoid scrolling, and this iteration only changed auto-sized footer
       content, not the flexed layout above it, but this is unverified on a
       real device.
  - **EN + DE check**: confirm both English and German wordings above render
    without wrapping past 2 lines or getting clipped, and that "Retry"
    (`retry` i18n key, reused — already used elsewhere in the app) reads
    naturally as a button label in this new context in both languages.
  - **Small-screen check**: Galaxy S22, landscape (this app's target device)
    — this is the primary device to verify against per the standing brief.
  - **Ages affected**: all ages 2-8 (every child sees a wrong-answer
    feedback row eventually); the wording specifically differs at the
    4/5 age boundary.
- **Iteration 17's quiz correct-answer celebration** (new visible UI —
  needs real-device confirmation, unlike most recent iterations' invisible
  accessibility-only changes):
  - **Screen**: `QuizScreen` while a question is showing, rendered via
    `QuestionRenderer.tsx` (not the end-of-quiz score screen — unchanged).
  - **Expected behavior**: when the child taps an answer option that is
    correct, in addition to the pre-existing green highlight + checkmark on
    the option and the "Correct!"/`quizCorrect` text + static 🎉 in the
    feedback row below, a NEW small white rounded bubble (🎉 emoji + "Yay!
    ⭐" in English / "Juhu! ⭐" in German) pops in near the TOP of the screen
    (over the question card area), holds for under a second, then fades out
    — total animation time ~1.4 seconds, no looping, nothing to tap to
    dismiss it.
  - **Interaction steps to trigger it**: open Quiz from the home screen →
    answer any question by tapping the option that matches
    `question.correctOptionId` → the bubble should appear immediately,
    overlapping the top of the question card, then disappear on its own
    within ~1.5s. Tapping a WRONG answer should show no bubble at all (only
    the existing red highlight + "Try again!" text). Tapping "Next"
    immediately (before the ~1.4s animation finishes) should work exactly
    as before — the bubble should not need to finish or be dismissed first.
  - **Potential visual concerns to check specifically**:
    1. Does the bubble visually overlap/obscure the question image or
       question text underneath it in a way that looks broken (it's
       absolutely positioned over the question card, not beside it) —
       this was a from-code judgment call, not verified on a real screen.
    2. Does the bubble's small font size (16px text / 26px emoji) render
       legibly and not clipped inside its own rounded border on a real
       device's actual DPI?
    3. Does the pop-in/fade-out feel "brief and joyful" rather than jarring
       or distracting for a 2-3 year old — this is inherently subjective
       and worth a literal "does this look nice" gut-check.
    4. Confirm no visible flash/flicker (the fade-out is a plain opacity
       timing, should be smooth, but real-device frame timing under
       `useNativeDriver: true` should be watched once).
  - **EN + DE check**: confirm both "Yay! ⭐" (English) and "Juhu! ⭐"
    (German) render correctly (no missing-glyph boxes for the star emoji on
    the target device/font) and fit inside the bubble without wrapping or
    clipping (`numberOfLines={1}` is set, so an overly long font-scale
    setting could in theory truncate — unlikely given how short both
    strings are, but worth a glance).
  - **Small-screen check**: on the Galaxy S22 in landscape (this app's only
    supported orientation), confirm the bubble never gets clipped off the
    top edge of the screen and never causes the screen to need scrolling —
    it's `position: 'absolute'` and outside the flex layout specifically to
    prevent this, but that reasoning has not been confirmed on a real
    device/emulator (none was available in this environment).
  - **Ages affected**: all ages 2-8 that use the Quiz feature (the
    celebration has no age gating — it fires identically for every child
    profile).
- Iteration 16's two changes are both invisible on-screen: the
  `palette.test.ts` addition is test-only (no production code changed), and
  the `hitSlop` addition on `ColoringScreen`'s palette swatches only
  extends the tappable (not visible) area — no rendering/layout change. No
  visual review strictly needed. Recommended (not required) real-device
  check: on the Galaxy S22, with a small child's finger/thumb, confirm the
  palette swatches (especially the edge ones adjoining the "Clear" button
  and the scroll boundary) now feel comfortably tappable without
  accidentally triggering horizontal scroll or missing the target.
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
- **Iteration 28 Part A: coloring toolbar row screen-fit — investigated and
  closed with a defensive `flexWrap` fix (unlike iteration 20's dots row,
  which needed no fix at all).** Full investigation (definitive; do not
  re-investigate without new evidence — e.g. a real device review actually
  finding wrapped buttons in practice):
  - Applied the same method iteration 20 used for the quiz progress-dots
    row: compute a real worst-case content width, compare it against this
    landscape-locked app's realistic landscape-width range, and only fix if
    the math shows genuine risk.
  - Worst case: up to 4 toolbar buttons visible together (Fill, Pen,
    conditional Undo — reachable any time after a flood-fill tap per
    iteration 27 — and conditional Clear drawing — reachable any time a pen
    stroke exists per iteration 26; the two are independent, confirmed by
    an existing test, so both together is a real reachable state, not a
    theoretical one). German strings run longest (`clearDrawing`:
    "Zeichnung löschen", no emoji, longest of the four). Estimated ~8.5px
    per character at the default ~14pt bold RN `Text` size, plus each
    button's real `paddingHorizontal: spacing.md` (16px/side),
    `borderWidth: 2` (2px/side), and `spacing.sm` (8px) inter-button gaps:
    roughly **565-600px** of row content, plus the footer container's own
    `paddingHorizontal: spacing.md` (32px) — call it **~600-630px** total
    against the window width.
  - Confirmed `RootNavigator.tsx` still locks orientation to `LANDSCAPE`
    (unchanged since iteration 20's investigation), so the binding
    dimension is landscape width, typically 600-900dp for a normal phone —
    the same range iteration 20 used.
  - **Why this is a genuinely different conclusion from iteration 20's**:
    iteration 20's dots row needed a known, exact 364px against a
    600-900px range — a 240-500+px margin, comfortably safe with no
    realistic failure mode. This toolbar row's ~600-630px need against the
    same 600-900px range is a much tighter, estimation-sensitive margin:
    (a) RN `Text` width can't be measured precisely without real device
    font metrics — unlike the dots row's fixed numeric `width`/`margin`
    style values, this estimate has real error bars; (b) real device
    safe-area insets (notches/cutouts in landscape) can consume an
    additional ~40-50px combined on some phones, which iteration 20's dots
    row didn't need to account for given its much larger margin; (c) the
    low end of the 600-900px landscape-width range is uncomfortably close
    to the ~600-630px estimate even before insets. This is not "confidently
    safe" the way the dots row was — it's "plausibly at risk on some real
    narrow-landscape device," which per this iteration's own instructions
    ("if the math shows a genuine overflow/wrap risk, apply the smallest
    safe layout fix... if the math shows it's safe, add a test that pins
    down the safe conclusion... do not manufacture a fix if none is
    needed") called for a fix, not just a documenting test.
  - **Fix chosen and why**: `flexWrap: 'wrap'` + `gap: spacing.sm` on the
    toolbar row container (replacing per-button `marginRight:
    spacing.sm`), rather than a horizontal `ScrollView` (the pattern
    already used for the palette strip directly below). A `ScrollView` was
    considered and rejected: the palette's scroll-to-see-more-colors is an
    optional/browsable affordance, but Fill/Pen/Undo/Clear are core
    controls — hiding any of them behind an undiscovered horizontal scroll
    for a 2-8 year old would risk exactly the kind of "essential control
    unreachable without a hidden gesture" problem this app's other design
    choices (e.g. always-visible retry buttons, no auto-advance timers)
    consistently avoid. `flexWrap` keeps every button visible and tappable
    at all times, just possibly on two lines instead of one — zero
    downside in the common (fits-on-one-line) case, and a strictly better
    failure mode than either clipping or hiding behind scroll in the rare
    case it's needed.
  - Also noted (found while reading `QuestionRenderer.tsx`'s existing
    comment about a puzzle-board `flexWrap` float-precision issue from an
    earlier iteration, in case it applied here too): that prior concern was
    specifically about `flexWrap` producing uneven row breaks for a strict
    equal-width grid of many small cells under floating-point Yoga layout
    math — a different problem from a handful of variable-width buttons in
    a simple toolbar row, where wrapping to a second line has no such
    precision-sensitive grid to break. Confirmed this prior lesson does not
    apply here before proceeding.
  - Verified via `git stash` that the new pinning test fails for the right
    reason (`coloring-toolbar-row` testID / `flexWrap` absent) against the
    pre-fix source and passes after the fix.
  - A code-review subagent independently reviewed and approved with no
    required changes (see Current Status for the full review summary).
- **Iteration 28 Part B: `ColoringScreen`'s empty-state handling — confirmed
  fully closed, no gap.** `displayImage = filledImage ?? image` was traced
  against every path through the `[imageUri, retryToken]`-keyed load effect:
  decode success sets `image`; decode returning falsy OR any thrown error
  (including the initial byte read) sets `imageLoadFailed`. There is no
  path leaving `image` permanently `null` while `imageLoadFailed` stays
  `false` — the only window where `displayImage` is `null` is the brief
  moment between mount and the async decode resolving (a normal loading
  flash, not a stuck/error state requiring its own friendly message). This
  closes Phase 4 item 4 for good; do not re-open without new evidence (e.g.
  a real device report of a genuinely stuck blank canvas).
- **Iteration 20: quiz progress-dots row large-session-count overflow —
  investigated and closed as NOT a genuine risk.** Full investigation
  (this is the definitive answer; do not re-investigate in a future
  iteration without new evidence):
  - `src/quiz/quizSession.ts`'s `SESSION_LENGTH` is 20 (`buildSession`
    slices the shuffled eligible-question list to at most 20). This is not
    a rare edge case: `sample-content/quiz/questions.json` has exactly 20
    questions eligible (by `minAge`/`maxAge`) for every one of ages 2
    through 7 (counted directly: 20, 20, 20, 20, 20, 20, 0 for ages 2-8),
    so a full 20-question session is the everyday case, not a worst case.
  - `src/quiz/QuestionRenderer.tsx`'s progress row (`progressRow` style,
    ~line 383) renders one `View` per question in a plain
    `flexDirection: 'row'` with `justifyContent: 'center'`, no `flexWrap`,
    no max-width/overflow style. Each dot (`progressDot`) is 14x14 with
    `marginHorizontal: spacing.xs / 2` (2px/side, `spacing.xs` = 4 from
    `theme/tokens.ts`); the current dot (`progressDotCurrent`) is
    18x18. Worst case at 20 dots: 19 x (14+4) + 1 x (18+4) = 342 + 22 =
    **364px** total row width — a real, computed number, not an estimate.
  - The decisive fact: this app is **landscape-only**.
    `src/navigation/RootNavigator.tsx` locks orientation to `LANDSCAPE` via
    `expo-screen-orientation` and only then reveals the app shell
    (`setProfile(...)` runs after the landscape lock's `await` resolves) —
    the quiz screen cannot be reached before that lock takes effect. So the
    row's binding dimension is the device's **landscape width**, not its
    portrait width. Even a narrow ~320-412dp-portrait-width phone has a
    landscape width in the 600-900dp range for any normal phone aspect
    ratio — comfortably (200-500px) above the 364px this row needs, with
    room to spare even accounting for `scrollContent`'s `spacing.md` (16px)
    padding on each side. There is no realistic phone on which this row
    would overflow or force ugly wrapping.
  - One acknowledged, pre-existing, unrelated edge case surfaced while
    verifying this (found by the code-review subagent, not a new issue):
    `RootNavigator.tsx`'s landscape-lock call has a `.catch()` that only
    logs a warning — if `lockAsync` itself rejected on some real device,
    the app would proceed unconstrained (effectively portrait-capable)
    without the developer/user being told beyond a console warning. This
    is an existing, separate robustness gap in the orientation-lock code
    itself (not the progress-dots row), noted here for visibility but out
    of scope for this iteration's dots investigation.
  - Conclusion: no production code change. Added one test instead —
    `__tests__/quiz/QuestionRenderer.test.tsx`, `describe('progress
    indicator', ...)`, "renders all 20 dots at the real maximum session
    length without the row exceeding a landscape-safe width budget" —
    which renders 20 dots, asserts all 20 (and no 21st) exist, sums each
    dot's actual flattened `width + marginHorizontal*2`, and asserts the
    total is `< 500` (comfortably above the real 364px so it isn't flaky,
    comfortably below any real landscape width so a genuine regression —
    e.g. dot size or margin growing significantly, or `SESSION_LENGTH`
    growing well past 20 — would fail it). A code-review subagent
    independently re-verified the landscape-lock code path, the pixel
    arithmetic, the threshold's tautology-resistance (it doesn't hardcode
    the source constants or the exact 364 result), and confirmed only the
    test file changed. Approved with no changes.
  - Investigated but explicitly NOT pursued this iteration as a follow-on
    (see Next): `src/quiz/QuizScreen.tsx`'s quiz-completion screen
    (`state.isFinished` branch, ~line 82-102) shows a static star-rating
    score card with **no actions at all** — no button to retry the quiz or
    return home. The only way off that screen today is React Navigation's
    native header back button (the quiz screen has `headerShown: true`
    with a default back arrow, confirmed in `RootNavigator.tsx`), which
    does work for "return home" but is not an explicit, encouraging,
    child-facing action, and there is no "play again" action at all. This
    is a real, unclaimed gap (Phase 3/4's "positive completion screen"
    item) — see Next for why it was deliberately deferred to its own
    iteration rather than rushed in alongside this iteration's
    investigation.
- Iteration 16: ran a fast Explore-agent scan across the three secondary
  candidates named in this iteration's brief before picking one. Findings,
  for future iterations' reference:
  - **Touch-target sizing**: only `ColoringScreen.tsx`'s 44x44 palette
    swatches were found under the ~48x48 guideline (fixed this iteration
    via `hitSlop`). `PieceCountPicker.tsx`'s tiny 12x12 `miniGridCell` is a
    decorative preview element inside a 64px-tall `optionRow`, not itself a
    separate tap target — not a real gap. `AgePicker.tsx`'s field/option
    rows use padding-only sizing with no explicit min-height guard; likely
    fine given text + padding, but not explicitly measured/tested (left as
    an optional item in `Next`).
  - **Motion safety**: the entire `src/` tree has zero animation code today
    (no `Animated`/`Reanimated`/`LayoutAnimation`/manual
    `setInterval`/`requestAnimationFrame` usage anywhere) — motion safety is
    not a live risk, but also means Phase 3's celebration feature (see
    `Next`) will be the app's first animation, so its brevity/cleanup/
    non-blocking properties need to be built in from scratch rather than
    copied from an existing convention.
  - **Galaxy S22 screen-fit**: `QuestionRenderer.tsx` already wraps in a
    `ScrollView` with an explicit code comment describing it as a
    documented "safety net" for short screens (pre-existing, from earlier
    iterations' quiz-layout work). `PuzzleScreen.tsx` also has two
    `ScrollView`s (loading state and main view) with no explanatory
    comment — not confirmed as a problem, just unannotated; worth a quick
    on-device check but not picked as this iteration's fix since nothing
    concrete indicated an actual overflow bug. `OnboardingScreen`/
    `SettingsScreen` use `ScrollView` for their forms, which is expected.
    `HomeScreen`/`VideoGallery`/`ColoringGallery`/`PuzzleGallery` have no
    `ScrollView` and nothing was found stacking large fixed-height content
    that would risk overflow on a small screen.
  - Chose touch-target sizing as this iteration's secondary fix (smallest,
    most concrete, directly continues iteration 15's palette-swatch
    accessibility work) and deferred Phase 3's celebration feature to a
    scoped `Next` plan rather than starting it, since implementing a new
    animation pattern (the app's first) plus its test coverage was judged
    likely to exceed one iteration's safe scope alongside the two
    improvements already completed.
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
