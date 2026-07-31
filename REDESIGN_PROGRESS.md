# Kutta Complete Redesign

## Design Direction

A completely new visual identity, built in `src/design-system/` (deliberately
separate from the legacy `src/theme/tokens.ts`, which is no longer imported by
any screen after this loop — every screen now consumes the new system).

**Palette.** Replaces the old coral/sky/sun/mint/pink/periwinkle/orange system
entirely with a new "candy/aurora" brand family: `bubblegum` (magenta/pink),
`violet`, `jade`, `marigold`, plus supporting `sky`, `berry` (errors/incorrect
feedback) and `lemon` (small highlight accents) — each with a `*Dark` border
shade and a `*Soft` tint for containers/badges. Each major activity has its
own recognizable accent via `getActivityPalette()`: **Coloring → bubblegum,
Quiz → violet, Puzzle → jade, Video → marigold**. A base warm-cloud
background (`canvas`) and deep plum-navy ink replace the old cream/slate-blue
pairing. A separate, deliberately calmer/desaturated `colors.parent` family
(muted teal accent, cool grey-blue ink) is used for Settings, wrapped in its
own `parentPaperTheme` (a local `PaperProvider` scoped to that screen) — so
Settings reads as "the grown-up screen," not a fifth toy color.

**Depth system.** Five `elevation` presets (`level1`-`level5`), each an
ink-tinted (not flat-black) shadow + Android `elevation` pairing, for a warm
"lifted paper" look. A standardized `surfaceWash` (two-tone light-over-dark
overlay) generalizes the ad hoc highlight/shadow trick every screen used to
hand-tune separately.

**Typography.** A weight/size-only hierarchy (`display` down to `caption`,
plus `button`/`buttonSmall`) using only the platform default font — no new
font dependency.

**Spacing/radii.** Wider scales than the old system (`spacing.xxl: 48`,
`radii.pill: 999` for fully-rounded CTAs).

**Animation language.** RN's built-in `Animated` API only — `react-native-reanimated`
is listed in `package.json` but still isn't wired into babel/Jest, confirmed
multiple times across this and prior sessions; forcing it through was judged
not worth the risk. Three spring presets: `pressGentle` (every tap),
`popBouncy` (reveals/pop-ins), `celebrate` (bigger bounce, celebration
moments only, always bounded/auto-resolving). A shared `useTiltPress` hook
(perspective+rotateX+rotateY+lift+scale) backs every pressable component.

**Touch targets.** Bumped to Material's 48dp minimum, with `comfortable` (56)
and `primaryCTA` (64) presets for the biggest controls.

**One new dependency**: `react-native-paper` (MIT, v5.15.3) — explicitly
authorized by the developer as a free/zero-royalty UI foundation, specifically
to avoid any licensing/attribution risk for a Play Store release. No other
dependency was added anywhere in this redesign.

## Completed Screens

| Screen | Files | Commit |
|---|---|---|
| Design system foundation | `src/design-system/*` (new), `App.tsx` (PaperProvider wiring) | `09535a8` |
| Home | `src/home/HomeScreen.tsx` | `181e7f9` |
| Video Gallery | `src/video/VideoGallery.tsx` | `08e93f2` |
| Video Player | `src/video/VideoPlayerScreen.tsx` | `f8b027f` |
| Puzzle (screen + gallery) | `src/puzzle/PuzzleScreen.tsx`, `src/puzzle/PuzzleGallery.tsx` | `6a7f959` |
| Onboarding | `src/onboarding/OnboardingScreen.tsx`, `src/components/AgePicker.tsx` (additive `variant` prop) | `27d8dee` |
| Coloring (screen + gallery) | `src/coloring/ColoringScreen.tsx`, `src/coloring/ColoringGallery.tsx` | `40bbb04` |
| Settings | `src/settings/SettingsScreen.tsx`, `src/settings/ProfilePicturePicker.tsx` | `e5cd30d` |
| Quiz (question/answer/feedback) | `src/quiz/QuestionRenderer.tsx` | `f4b70d9` |
| Quiz (completion screen) | `src/quiz/QuizScreen.tsx` | `4d0970b` |

All 10 commits are local-only on `complete-animated-redesign`, nothing pushed.
**Final combined verification: `npx tsc --noEmit` clean, 41/41 suites, 412/412 tests passing.**

**Update**: `QuizScreen.tsx`'s completion screen (score card + Play
Again/Home) was redesigned in a follow-up iteration, commit `4d0970b` — now
uses `RaisedCard`/`RaisedPrimaryButton`/`RaisedSecondaryButton` matching
`QuestionRenderer.tsx`'s violet quiz accent, with a spring pop-in entrance
and a score-tier emoji badge (🏆/🌟/🎉, always warm, never neutral/negative).
Reshuffle/double-fire-guard/navigation logic confirmed unchanged.

## Shared Components

All new, under `src/design-system/` (barrel-exported via `index.ts`):

- **`paperTheme.ts`** — `paperTheme` (child-facing MD3 theme, wired into
  `App.tsx`'s `PaperProvider`) and `parentPaperTheme` (calmer variant, used
  locally by Settings).
- **`useTiltPress.ts`** — the shared press/tilt animation hook.
- **`AnimatedPressable.tsx`** — reusable "tilt and lift" pressable wrapper.
  Used directly (not via `RaisedCard`) wherever a component needs `flex:1`
  fill behavior the static-panel `RaisedCard` path can't provide (e.g. Quiz's
  answer options, Onboarding's language pills/folder button).
- **`SurfaceWash.tsx`** — the generalized two-tone light/dark overlay.
- **`RaisedCard.tsx`** — 3D-feeling raised card base; renders as a static
  panel when no `onPress` is given. Used for gallery tiles, Home's activity
  cards, Onboarding's field cards, Puzzle's preview/piece-count panels.
- **`Buttons.tsx`** — `RaisedPrimaryButton`/`RaisedSecondaryButton`, built on
  react-native-paper's `Button`.
- **`CelebrationOverlay.tsx`** — generalized Modal pop-in feedback pattern.
  Used as-is by Puzzle's completion overlay. Quiz's feedback overlay reuses
  its button components and wash proportions but keeps its own `Modal` shell,
  since it needs a correct-answer text/image reveal slot `CelebrationOverlay`
  doesn't expose.
- **`EmptyStatePanel.tsx`** — icon/emoji + title + message + optional action.
  Adopted by Coloring, Puzzle, and Video galleries.

## Animation Inventory

- **Press tilt/lift** (`useTiltPress`): `pressGentle` spring, perspective+rotateX+rotateY+translateY+scale, native-driver only, stopped on unmount/disabled transitions. Used everywhere via `AnimatedPressable`/`RaisedCard`/`Buttons`.
- **Card/panel pop-in** (`CelebrationOverlay`, Puzzle completion, Quiz feedback card): `popBouncy` spring + opacity timing (220ms), reset on hide.
- **Celebration bubble** (Quiz, `tone="success"`): `celebrate` spring, 900ms hold, 320ms fade-out, bounded/auto-resolving.
- **Empty-state bounce** (`EmptyStatePanel`): slow looping translateY bounce, stopped on unmount.
- **Settings banners**: deliberately calm `Animated.timing` fade-only (no spring/bounce) for migrating/error states — parent-facing screens use restrained motion per the brief.
- **Puzzle piece pop / progress dots / mark badges / palette swatch pop / toolbar press**: all pre-existing from an earlier session, preserved with identical logic, only recolored onto the new palette where applicable.

## Remaining Screens
All 7 user-facing screens plus the quiz completion screen are redesigned. What's left is polish, not missing coverage:
- Native `Alert.alert` usages for destructive confirmations (Settings' folder-migration confirm, Coloring's clear-drawing confirm) remain OS-native by design — judged not worth the risk of a custom in-app modal for a critical confirmation path, but a future iteration could revisit this if a consistent custom dialog is wanted.
- No app-wide screen-transition animation was added (React Navigation's default stack transition is unchanged) — could be a future consistency iteration.

**Cross-screen consistency pass (post-redesign).** Since every screen above was redesigned independently by a separate session (all consuming the same `src/design-system/` foundation), a follow-up pass read every redesigned screen file side by side looking for drift, and fixed the 3 highest-value/lowest-risk findings:
- `PuzzleGallery.tsx`'s error/retry state was still a bare hitSlop-padded text link — the one gallery that hadn't been upgraded to the `RaisedCard`-based real->=48dp button `ColoringGallery.tsx`/`VideoGallery.tsx` both already use for the identical moment. Brought in line with its siblings (and updated the one test that had been asserting the old hitSlop-only implementation, mirroring `ColoringGallery.test.tsx`'s own "real tap target" assertion).
- `QuestionRenderer.tsx`'s correct-answer celebration bubble used hand-typed literal timings (200ms/900ms/300ms, friction:4) that had drifted from this doc's own Animation Inventory entry for that exact effect ("celebrate spring, 900ms hold, 320ms fade-out") and from `CelebrationOverlay.tsx`'s identical, already-token-based implementation of the same pattern. Now uses the shared `motion` tokens directly, so the two "correct answer" celebration effects in the app are driven by one documented source of truth again.
- `HomeScreen.tsx` and `ProfilePicturePicker.tsx` each had a hand-typed `rgba(...)` literal for a color exactly expressible via the existing (unit-tested, previously unused by any consumer) `withAlpha()` helper in `src/design-system/tokens.ts` — switched to it (byte-identical resulting color, just no longer a second hand-rolled copy of the same math).

Deliberately left untouched, and noted here for a future pass instead: Onboarding's and Settings' page titles both use an identical hand-tuned `fontSize: 22/fontWeight: '800'` (not a `typography` token) — consistent with EACH OTHER and tied to an existing Galaxy-S22-landscape screen-fit regression test, so it reads as a deliberate, reviewed exception rather than drift; QuestionRenderer's other already-numerically-correct spring configs (`speed:20/bounciness:6`, matching `motion.spring.popBouncy`) still use literals rather than the token object — safe to migrate later but out of scope for this pass to keep the diff minimal; and Settings' own plain-text-link error retries (e.g. `ProfilePicturePicker`'s own load-error state) intentionally keep their calmer, non-raised parent-register styling rather than adopting the child screens' `RaisedCard` treatment, per that screen's own documented "quick, unfussy controls" brief.

## Visual Review Required

**Home** — Open Home screen. Expect: cream background, 3 faint colored blur circles, pill header badge (avatar + greeting) top-left, circular settings button top-right, one row of 4 cards with Coloring visibly wider/hero-sized. Tap any card: brief 3D tilt+lift then navigate. Check EN+DE taglines render. Confirm no scrolling/clipping at S22 landscape height.

**Video Gallery/Player** — Video rows are now raised marigold-tinted tiles. Check tilt/press feels responsive with 2+ videos, error-state card is legible, player's RaisedCard frame doesn't crowd native playback controls, no color clash between marigold accent and native video chrome.

**Puzzle** — Board sits in a "recessed tray" with jade border and thicker piece separators; gallery is a 4-column tile grid. Check depth doesn't look cluttered at 4/6/9/12 pieces, gallery tiles fit landscape width comfortably, and `CelebrationOverlay`'s default bubblegum/violet buttons read acceptably against the jade board (this was a deliberate scope limit — the overlay component doesn't expose per-instance color overrides).

**Onboarding** — 2×2 card grid (Name/Age/Language/Folder) + Save button. Check it fits without scrolling (scrolling is allowed but not preferred), violet age-picker modal / jade language pills / marigold folder button / bubblegum name field read as coherent and parent-legible (not childish), German subtitle/labels don't wrap awkwardly in half-width cards.

**Coloring** — Toolbar buttons are now raised with active/neutral/danger variants (Clear is berry-tinted). Palette swatches enlarged to 56px with a strong selection ring. Gallery is a 3-column grid. Check toolbar button contrast when active, last-row tile stretching in the gallery grid (cosmetic), and whether the enlarged swatches/buttons ever force an unwanted 2-line toolbar wrap in the common case.

**Settings** — Now uses the calmer "parent" palette (muted teal/grey) with a locally-scoped `parentPaperTheme`. Picture picker is now a 3-column grid. Check the screen still fits without excessive scrolling (spacing was kept at the earlier session's tightened values), the parent palette reads clearly distinct from child screens, the picture grid fits inside the modal's `maxWidth:420`, banner fade-in and opacity-dip press feedback feel calm (not broken), and destructive berry styling on Remove/migration-error reads as intentional.

**Quiz** — Question card is a bordered/washed panel; answer options are large `AnimatedPressable` tiles with violet-soft (rest) / jade-soft (correct) / berry-soft (wrong) states, each with the tilt-and-lift press animation. Progress dots: violet (current) / jade (done) / lavender-grey (not yet). Feedback overlay: plum scrim, jade/berry-washed card, pill Retry/Next buttons. **Verify on an actual Galaxy S22 landscape device that nothing scrolls and the answer grid reads clearly at a glance for a 2-year-old** — this is the single most-used, most behavior-rich screen in the app.

**All screens**: every "Add"-button and retry/error-state touch target was re-verified at ≥48dp during each screen's own review pass. No screen's redesign added a new npm dependency beyond the one authorized `react-native-paper`. No `app.json`/`android/`/`ios/` files were touched anywhere in this loop.

## Morning Review

**Most significant visual changes**: every screen in the app now uses a
completely new "candy/aurora" color system with per-activity accent colors
(bubblegum/violet/jade/marigold), a shared 3D tilt-press animation language,
and raised/layered card surfaces replacing the old flat rectangles
everywhere. This is not a restyle — colors, shapes, depth, and composition
changed on every single screen.

**Screens completed**: Home, Onboarding, Quiz (question/answer/feedback
view), Coloring (screen + gallery), Puzzle (screen + gallery), Video
(gallery + player), Settings — all 7 user-facing screens plus the shared
foundation.

**Screens not yet completed**: none — all 7 screens plus the quiz completion
screen are redesigned. Remaining work is polish-tier (see Remaining Screens
above), not missing coverage.

**Commands to run locally**:
```
git checkout complete-animated-redesign
npm install   # picks up react-native-paper
npx tsc --noEmit
npm test -- --runInBand
npm run android   # or your usual device/emulator run command
```

**Potential visual issues to check first**: Quiz screen fit on a real S22
(flagged above as highest priority), Coloring's toolbar 1-line-vs-2-line
wrap in the common case, Puzzle's `CelebrationOverlay` default button colors
against the jade board.

**Recommended first screens to inspect**: Home (first impression, quickest to
verify), then Quiz (most complex/most-used, highest risk if something
regressed), then the rest in any order.

**This redesign lives entirely on `complete-animated-redesign`** — `master`
was never touched. Decide whether to merge, cherry-pick individual screens,
or discard after reviewing.
