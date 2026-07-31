# Kutta Complete Redesign

## Design Direction

A completely new visual identity, built in `src/design-system/` (deliberately
separate from the existing `src/theme/tokens.ts`, which every current screen
still imports and renders with — see that file's own top-of-file comment for
why it wasn't edited in place).

**Palette.** Replaces the old coral/sky/sun/mint/pink/periwinkle/orange system
entirely with a new "candy/aurora" brand family: `bubblegum` (magenta/pink),
`violet`, `jade`, `marigold`, plus supporting `sky`, `berry` (errors/incorrect
feedback) and `lemon` (small highlight accents) — each with a `*Dark` border
shade and a `*Soft` tint for containers/badges. Each major activity gets its
own recognizable accent via `getActivityPalette()`: Coloring → bubblegum,
Quiz → violet, Puzzle → jade, Video → marigold. A base warm-cloud
background (`canvas`) and deep plum-navy ink replace the old cream/slate-blue
pairing. A separate, deliberately calmer/desaturated `colors.parent` family
(muted teal accent, cool grey-blue ink) exists for Settings and other
parent-facing surfaces, so that screen reads as "the grown-up screen" rather
than a fifth toy color — not wired into any screen yet, since Settings itself
isn't redesigned this iteration.

**Depth system.** Five `elevation` presets (`level1`-`level5`), each an
ink-tinted (not flat-black) shadow + Android `elevation` pairing, for a warm
"lifted paper" look instead of a harsh corporate drop-shadow. A standardized
`surfaceWash` (two-tone light-over-dark overlay) generalizes the ad hoc
highlight/shadow wash every existing screen (Home's `CardBackground`,
QuestionRenderer's question/feedback cards, Puzzle/Coloring's card washes)
had separately hand-tuned slightly different opacities for.

**Typography.** A weight/size-only hierarchy (`display` down to `caption`,
plus `button`/`buttonSmall`) using only the platform default font (System on
iOS, `sans-serif` on Android) — no new font dependency, per the hard limits.

**Spacing/radii.** Wider scales than the old system (`spacing.xxl: 48`,
`radii.pill: 999` for fully-rounded CTAs) to give the new, more layered
compositions room to breathe.

**Animation language.** RN's built-in `Animated` API only (still, deliberately
— see `motion`'s own comment in `tokens.ts` for why `react-native-reanimated`,
though listed in `package.json`, isn't actually wired into babel/Jest yet).
Three spring presets: `pressGentle` (no-overshoot, plays on every tap),
`popBouncy` (reveals/pop-ins), `celebrate` (bigger bounce, genuine celebration
moments only, always bounded/auto-resolving). A `tilt` preset pair
(`regular`/`compact`) captures the exact perspective+rotateX+rotateY+lift+scale
"3D press" recipe HomeScreen and QuestionRenderer each hand-rolled, now
generalized into one hook (`useTiltPress`) every new pressable component
shares.

**Touch targets.** Bumped from the old 44px (iOS HIG) baseline to Material's
48dp minimum, with `comfortable` (56) and `primaryCTA` (64) presets for the
biggest, most-tapped controls.

## Completed Screens
(none yet — this iteration is the shared foundation only, per its own scope)

## Shared Components

All new, under `src/design-system/` (barrel-exported via
`src/design-system/index.ts`):

- **`paperTheme.ts`** — `paperTheme` (MD3 theme wired into `PaperProvider` in
  `App.tsx`, wrapping the existing `SafeAreaProvider`/`RootNavigator` without
  disturbing them) and `parentPaperTheme` (the calmer Settings variant,
  ready for a future iteration to adopt).
- **`useTiltPress.ts`** — the shared press/tilt animation hook (see Animation
  Inventory below); every pressable component in this system builds on it
  instead of re-deriving the wiring.
- **`AnimatedPressable.tsx`** — the reusable "tilt and lift" pressable
  wrapper the brief called for: layout-only outer `Pressable` + animated
  inner `Animated.View`, disabled-state handling, cleanup on unmount.
- **`SurfaceWash.tsx`** — the generalized two-tone light/dark overlay.
- **`RaisedCard.tsx`** — the 3D-feeling raised card base (built on
  `AnimatedPressable` + `SurfaceWash`); renders as a static panel when no
  `onPress` is given.
- **`Buttons.tsx`** — `RaisedPrimaryButton`/`RaisedSecondaryButton`, built on
  react-native-paper's `Button` (ripple, accessibility, theming) plus this
  system's own press/lift animation and an explicit raised shadow, since
  Paper's flat MD3 buttons don't provide that depth on their own.
- **`CelebrationOverlay.tsx`** — generalizes the Modal-based pop-in
  feedback/celebration pattern from `QuestionRenderer`/`PuzzleScreen`: dimmed
  backdrop, springing card, optional bouncing emoji bubble (`tone="success"`),
  title/message, 1-2 action buttons.
- **`EmptyStatePanel.tsx`** — icon/emoji + title + message + optional action
  button, richer than the existing `src/components/EmptyState.tsx` (which
  stays as-is; screens keep using it until they're individually migrated).

## Animation Inventory

- **Press tilt/lift** (`useTiltPress`, used by `AnimatedPressable`,
  `RaisedCard`, `Buttons`): `pressGentle` spring (speed 40, bounciness 0) on
  press-in/press-out, driving perspective+rotateX+rotateY+translateY+scale —
  native-driver only, stopped on unmount and on `disabled` transitions.
- **Card/panel pop-in** (`CelebrationOverlay`): `popBouncy` spring (speed 20,
  bounciness 6) + opacity timing (220ms) on the outer card, stopped/reset
  whenever `visible` goes false.
- **Celebration bubble** (`CelebrationOverlay`, `tone="success"` only):
  `celebrate` spring (friction 4) pop-in, 900ms hold, 320ms fade-out —
  bounded, always auto-resolves, stopped on unmount/re-hide.
- **Empty-state bounce** (`EmptyStatePanel`): slow (900ms out/900ms in)
  looping translateY bounce on the emoji, stopped on unmount.

## Remaining Screens
Home, Onboarding, Quiz, Coloring, Puzzle, Video Gallery, Video Player,
Settings, all galleries, all modals/dialogs, all error/empty states — ALL
still pending; none were touched this iteration by design. Each should
migrate onto `src/design-system/` (tokens, `RaisedCard`, `Buttons`,
`AnimatedPressable`, `CelebrationOverlay`, `EmptyStatePanel`) one at a time
rather than hand-rolling the old per-screen patterns again.

## Visual Review Required
(to be filled in per screen, once each is redesigned)

## Morning Review
Iteration 1 (foundation) complete: new palette/typography/depth/animation
system built in `src/design-system/`, `PaperProvider` wired into `App.tsx`
with a custom MD3 theme, and 7 new reusable components (plus a shared
`useTiltPress` hook) added with focused tests. `src/theme/tokens.ts` and all
existing screens are untouched — the full pre-existing test suite still
passes unmodified. Next iteration should pick one screen (suggest: Home,
since it's the entry point and already has the most tilt/card precedent to
migrate) and rebuild it on top of this foundation.
