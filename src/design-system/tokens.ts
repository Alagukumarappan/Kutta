// Kutta's new visual identity, built for iteration 1 of the complete
// redesign (see REDESIGN_PROGRESS.md). This is a DELIBERATELY separate
// module from `src/theme/tokens.ts`: that file is the OLD palette/spacing
// system every existing screen (Home, Quiz, Coloring, Puzzle, Video,
// Settings, Onboarding) still imports and renders with today, and this
// iteration's brief is explicit that redesigning those screens is OUT OF
// SCOPE — only the shared foundation they'll be migrated onto, one screen
// at a time, in later iterations. Editing the old file's `colors` export in
// place would have silently reskinned every existing screen (and risked
// clashing with hand-tuned pairings like `optionCorrect`/`optionIncorrect`
// backgrounds) without any of the deliberate, reviewed screen-level redesign
// work those screens still need — so nothing under `src/theme/` is touched
// here. `computeResponsiveRectSize`/`clamp` (pure layout math with no visual
// opinion) are re-exported from there instead of duplicated, since they're
// unrelated to "visual identity" and every consumer should keep sharing one
// implementation.
import { Platform } from 'react-native';

export { clamp, computeResponsiveRectSize, type EdgeInsets, ZERO_INSETS } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
//
// A completely new hue set (no relation to the old coral/sky/sun/mint/pink/
// periwinkle/orange system) built around three ideas: (1) a warm, playful
// "candy/aurora" brand family for anything a child interacts with directly,
// (2) a distinct, memorable accent per activity so a child can recognize
// Coloring/Quiz/Puzzle/Video by color alone before they can read the label,
// and (3) a separate, deliberately calmer, more muted family for the
// parent-facing Settings surface — same shape (ink/bg/accent/border) but
// desaturated so Settings reads as "the grown-up screen", not another toy.
export const colors = {
  // Base surfaces (child-facing screens)
  canvas: '#FFF9F2', // warm cloud-white app background
  surface: '#FFFFFF',
  surfaceRaised: '#FFFEFC',
  surfaceSunk: '#F3ECFB', // recessed/lavender-tinted panel, for layering depth under raised cards
  overlayScrim: 'rgba(36, 27, 58, 0.55)', // plum-tinted backdrop instead of flat black

  // Ink (text)
  ink: '#241B3A',
  inkMuted: '#6B6180',

  // Brand core — the playful triad + two supporting hues used across CTAs,
  // badges, and decorative accents that aren't tied to one specific activity.
  bubblegum: '#FF4FA3',
  bubblegumDark: '#D22E7C',
  bubblegumSoft: '#FFE1F0',
  violet: '#7C5CFC',
  violetDark: '#5A3AD1',
  violetSoft: '#EAE3FF',
  jade: '#00C9A7',
  jadeDark: '#00997E',
  jadeSoft: '#DFF9F3',
  marigold: '#FFB100',
  marigoldDark: '#E08E00',
  marigoldSoft: '#FFF1D2',
  sky: '#3AC7F0',
  skyDark: '#1D9DC7',
  skySoft: '#DEF6FE',
  berry: '#FF5A5F', // errors / "incorrect" feedback
  berryDark: '#D93C41',
  berrySoft: '#FFE3E4',
  lemon: '#FFE066', // small highlight accents (badges, sparkles); also Camera's activity accent
  lemonDark: '#E0BE3D',
  lemonSoft: '#FFF6D9',
  // A fresh green, distinct from jade's teal -- the last of the six brand
  // hues (bubblegum/violet/jade/marigold/sky/lemon) was already claimed by
  // an earlier activity, so Memory Match needed a genuinely new one rather
  // than reusing `berry` (reserved for error/"incorrect" feedback
  // elsewhere in the app, not available for a normal activity accent).
  grass: '#5FBF57',
  grassDark: '#3D9636',
  grassSoft: '#E3F5DE',

  // Neutrals
  line: '#E4DCF5',
  disabledBg: '#ECE7F5',
  disabledBorder: '#D6CDEA',
  disabledText: '#9C93AE',
  white: '#FFFFFF',
  black: '#000000',

  // Calmer, muted parent-facing palette (Settings and other
  // parent/confirmation surfaces). Same role-shape as the child palette
  // above (background/surface/ink/accent/border) but desaturated so it
  // reads as a distinct, quieter "grown-up" register rather than a fifth
  // toy color.
  parent: {
    background: '#F4F6F7',
    surface: '#FFFFFF',
    ink: '#31424B',
    inkMuted: '#66787F',
    accent: '#3E7C86',
    accentDark: '#2C5C64',
    accentSoft: '#E3EEEF',
    border: '#DCE4E6',
  },
} as const;

// Per-activity identity: one accent family per major activity so each card,
// gallery header, and in-activity chrome can carry a consistent, recognizable
// color without every screen re-picking hues by hand.
export type ActivityId = 'coloring' | 'quiz' | 'puzzle' | 'video' | 'tictactoe' | 'camera' | 'memoryMatch';

export interface ActivityPalette {
  accent: string;
  accentDark: string;
  accentSoft: string;
  // The text color that reads accessibly ON TOP of `accent` (e.g. a Home
  // card's label/tagline sitting directly on the accent fill). Contrast-
  // audited per WCAG AA against each `accent` hue below (see
  // src/design-system/tokens.test.ts): white clears 3:1 (the bar for
  // large/bold label text) on the two darker/more saturated hues
  // (bubblegum, violet), but falls drastically short on the three
  // lighter/higher-luminance ones (jade ~2.1:1, marigold ~1.8:1, sky
  // ~2.0:1) — those three use `colors.ink` instead, which clears both the
  // 3:1 (label) and 4.5:1 (smaller tagline text) thresholds comfortably
  // against a light background. This is a per-hue decision, not a fixed
  // "always white" or "always dark" rule, precisely because accent colors
  // span such a wide luminance range.
  onAccentText: string;
}

const ACTIVITY_PALETTES: Record<ActivityId, ActivityPalette> = {
  coloring: {
    accent: colors.bubblegum,
    accentDark: colors.bubblegumDark,
    accentSoft: colors.bubblegumSoft,
    onAccentText: colors.white,
  },
  quiz: {
    accent: colors.violet,
    accentDark: colors.violetDark,
    accentSoft: colors.violetSoft,
    onAccentText: colors.white,
  },
  puzzle: {
    accent: colors.jade,
    accentDark: colors.jadeDark,
    accentSoft: colors.jadeSoft,
    onAccentText: colors.ink,
  },
  video: {
    accent: colors.marigold,
    accentDark: colors.marigoldDark,
    accentSoft: colors.marigoldSoft,
    onAccentText: colors.ink,
  },
  // `sky` was the one brand hue not yet claimed by an activity — a natural
  // fit for the newest card added after Video.
  tictactoe: {
    accent: colors.sky,
    accentDark: colors.skyDark,
    accentSoft: colors.skySoft,
    onAccentText: colors.ink,
  },
  // `lemon` was previously only a small highlight-accent color (badges,
  // sparkles) — the one brand hue left unclaimed by any activity, and a
  // natural, cheerful fit for Camera.
  camera: {
    accent: colors.lemon,
    accentDark: colors.lemonDark,
    accentSoft: colors.lemonSoft,
    onAccentText: colors.ink,
  },
  memoryMatch: {
    accent: colors.grass,
    accentDark: colors.grassDark,
    accentSoft: colors.grassSoft,
    onAccentText: colors.ink,
  },
};

// Pure lookup, unit-tested like the rest of this file's helpers — kept as a
// function (not a plain object index) so call sites get a typo-proof API and
// a single documented place this mapping lives.
export function getActivityPalette(activity: ActivityId): ActivityPalette {
  return ACTIVITY_PALETTES[activity];
}

// Converts a 6-digit hex color (e.g. from `colors` above) to an rgba(...)
// string at the given alpha, for the soft tinted washes/highlights used to
// fake depth on raised surfaces (see RaisedCard's SurfaceWash). Pure string
// math, no RN dependency, so it's unit-testable the same way
// `clamp`/`computeResponsiveRectSize` already are in `src/theme/tokens.ts`.
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    throw new Error(`withAlpha expects a 6-digit hex color, got "${hex}"`);
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

// ---------------------------------------------------------------------------
// Spacing & radii
// ---------------------------------------------------------------------------
// A wider scale than the old theme/tokens.ts (which stops at `xl: 32`) to
// give the new, more layered/3D-inspired compositions (overlapping shapes,
// generous card padding, large CTAs) room to breathe.
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 12,
  md: 18,
  lg: 26,
  xl: 32,
  xxl: 40,
  pill: 999,
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
// Deliberately no `fontFamily` beyond the platform default (System on iOS,
// the Roboto-backed "sans-serif*" family on Android) — no new font
// dependency, per this iteration's hard limits. The hierarchy instead comes
// entirely from size/weight/letterSpacing, which is enough to give a strong,
// consistent visual rhythm across headings, body copy, and buttons.
export const typography = {
  display: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -0.5 },
  h1: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.25 },
  h2: { fontSize: 24, fontWeight: '800' as const, letterSpacing: 0 },
  h3: { fontSize: 20, fontWeight: '700' as const, letterSpacing: 0 },
  body: { fontSize: 17, fontWeight: '600' as const, letterSpacing: 0 },
  bodySmall: { fontSize: 15, fontWeight: '600' as const, letterSpacing: 0 },
  caption: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.1 },
  button: { fontSize: 19, fontWeight: '800' as const, letterSpacing: 0.2 },
  buttonSmall: { fontSize: 16, fontWeight: '800' as const, letterSpacing: 0.2 },
} as const;

export const systemFontFamily = Platform.select({ ios: 'System', android: 'sans-serif', default: undefined });

// ---------------------------------------------------------------------------
// Elevation (shadow/depth presets)
// ---------------------------------------------------------------------------
// An ink-tinted shadow color (instead of flat black) so shadows read as a
// warm, soft "lifted paper" effect rather than a harsh corporate drop-shadow.
// `elevation` is Android's own shadow approximation, kept alongside the
// iOS-style shadow* fields on every level (same dual-field convention
// `src/theme/tokens.ts`'s single `shadow` preset already established) so a
// spread of one of these objects behaves correctly on both platforms.
const shadowColor = '#3B2A55';

export const elevation = {
  level1: { shadowColor, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 1 },
  level2: { shadowColor, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 6, elevation: 3 },
  level3: { shadowColor, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 10, elevation: 5 },
  level4: { shadowColor, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8 },
  level5: { shadowColor, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.22, shadowRadius: 24, elevation: 12 },
} as const;

// Standardized opacities for the two-tone "light wash over the top, dark
// wash under the bottom" trick already used ad hoc across HomeScreen,
// QuestionRenderer, PuzzleScreen, and ColoringScreen (each hand-picked
// slightly different opacity values for the same effect) — RaisedCard and
// CelebrationOverlay both consume these instead of re-guessing new numbers.
export const surfaceWash = {
  highlightOpacity: 0.16,
  shadowOpacity: 0.08,
  highlightHeightPct: '55%',
  shadowHeightPct: '45%',
} as const;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------
// Durations (ms) and RN `Animated.spring` config presets, consolidating the
// hand-tuned values already scattered across HomeScreen/QuestionRenderer/
// PuzzleScreen/ColoringScreen (speed 40/bounciness 0 for gentle press
// feedback, speed 20/bounciness 6 for pop-ins, friction 4 for the bigger
// celebration bounce) into one shared, documented place. Deliberately still
// RN's built-in `Animated` API (not react-native-reanimated): reanimated 4 /
// react-native-worklets 0.10 are listed in package.json but a prior
// iteration's hands-on spike (see HomeScreen.tsx's cardScales comment)
// confirmed they aren't actually wired into babel.config.js or Jest yet, and
// forcing that through is a separate, riskier change than this foundation
// iteration's scope — RN's Animated already delivers every effect this
// system needs (spring, interpolate, perspective/rotate transforms) under
// useNativeDriver with zero new risk or dependency.
export const motion = {
  duration: {
    instant: 100,
    fast: 160,
    base: 220,
    slow: 320,
    celebration: 900,
  },
  spring: {
    // Press-in/press-out feedback: quick, no overshoot — plays on every
    // single tap, so it must stay calm rather than bouncy.
    pressGentle: { speed: 40, bounciness: 0 },
    // Reveals/pop-ins (a card, a badge, a feedback panel arriving): a touch
    // of bounce so it reads as "alive" without being distracting.
    popBouncy: { speed: 20, bounciness: 6 },
    // The bigger, more playful bounce reserved for genuine celebration
    // moments (a correct answer, a completed puzzle) — still bounded and
    // auto-resolving, never a looping/attention-grabbing animation.
    celebrate: { friction: 4 },
  },
} as const;

// Default "tilt and lift" press-feedback geometry, generalized from the
// exact recipe HomeScreen's cardTiltStyle/QuestionRenderer's optionTiltStyle
// established (perspective + rotateX + rotateY + a small lift + scale, all
// driven off one Animated.Value). `compact` is a gentler variant for smaller
// controls placed close together (matches QuestionRenderer's own
// "a smaller card reads a slightly larger rotation more strongly" reasoning
// for using 5deg/-3deg instead of Home's 6deg/-4deg on its answer options).
export const tilt = {
  regular: { pressedScale: 0.95, rotateXDeg: 6, rotateYDeg: -4, liftPx: 3, perspective: 900 },
  compact: { pressedScale: 0.95, rotateXDeg: 5, rotateYDeg: -3, liftPx: 2, perspective: 900 },
} as const;

// ---------------------------------------------------------------------------
// Touch targets
// ---------------------------------------------------------------------------
// Bumped from the old system's 44px baseline (iOS's HIG minimum) up to
// Material Design's 48dp minimum, since MD3 (via react-native-paper) is now
// this app's second design language alongside RN's own components, plus a
// couple of larger presets for the primary, most-tapped controls a young
// child uses (activity cards, the main CTA in a celebration overlay).
export const touchTarget = {
  minimum: 48,
  comfortable: 56,
  primaryCTA: 64,
  iconButton: 48,
} as const;
