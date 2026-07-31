// The MD3 (Material Design 3) theme handed to react-native-paper's
// <PaperProvider> (wired up in App.tsx). Everything here is derived from
// `./tokens.ts` — this file's only job is translating our own palette into
// the specific shape react-native-paper expects, so Paper's own components
// (Button, Surface, TextInput, etc. — used where the brief calls out that
// Paper "genuinely helps", per REDESIGN_PROGRESS.md) render with Kutta's
// identity instead of Paper's stock purple MD3 defaults.
import { MD3LightTheme, configureFonts, type MD3Theme } from 'react-native-paper';
import { colors, radii, systemFontFamily, typography } from './tokens';

// Maps our own weight-based `typography` scale onto MD3's named type-scale
// variants, keeping the platform-default font family (no new font
// dependency) but giving every variant OUR sizing/weight instead of Paper's
// stock Roboto-based scale. Only the variants this app is likely to actually
// exercise via Paper components (buttons, card titles/subtitles, body text,
// labels) are listed — configureFonts fills in everything else from MD3's
// own default typescale, so no variant is ever left unconfigured.
const fontConfig = {
  displayLarge: { fontFamily: systemFontFamily, fontWeight: typography.display.fontWeight, fontSize: typography.display.fontSize },
  headlineLarge: { fontFamily: systemFontFamily, fontWeight: typography.h1.fontWeight, fontSize: typography.h1.fontSize },
  headlineMedium: { fontFamily: systemFontFamily, fontWeight: typography.h2.fontWeight, fontSize: typography.h2.fontSize },
  titleLarge: { fontFamily: systemFontFamily, fontWeight: typography.h3.fontWeight, fontSize: typography.h3.fontSize },
  bodyLarge: { fontFamily: systemFontFamily, fontWeight: typography.body.fontWeight, fontSize: typography.body.fontSize },
  bodyMedium: { fontFamily: systemFontFamily, fontWeight: typography.bodySmall.fontWeight, fontSize: typography.bodySmall.fontSize },
  labelLarge: { fontFamily: systemFontFamily, fontWeight: typography.button.fontWeight, fontSize: typography.button.fontSize },
  labelMedium: { fontFamily: systemFontFamily, fontWeight: typography.buttonSmall.fontWeight, fontSize: typography.buttonSmall.fontSize },
} as const;

export const paperTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: radii.md / 4, // Paper multiplies `roundness` by fixed factors internally; /4 keeps its default-radius controls (e.g. Button) close to our own `radii.md`
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.bubblegum,
    onPrimary: colors.white,
    primaryContainer: colors.bubblegumSoft,
    onPrimaryContainer: colors.bubblegumDark,

    secondary: colors.violet,
    onSecondary: colors.white,
    secondaryContainer: colors.violetSoft,
    onSecondaryContainer: colors.violetDark,

    tertiary: colors.jade,
    onTertiary: colors.white,
    tertiaryContainer: colors.jadeSoft,
    onTertiaryContainer: colors.jadeDark,

    error: colors.berry,
    onError: colors.white,
    errorContainer: colors.berrySoft,
    onErrorContainer: colors.berryDark,

    background: colors.canvas,
    onBackground: colors.ink,
    surface: colors.surface,
    onSurface: colors.ink,
    surfaceVariant: colors.surfaceSunk,
    onSurfaceVariant: colors.inkMuted,

    outline: colors.line,
    outlineVariant: colors.disabledBorder,

    inverseSurface: colors.ink,
    inverseOnSurface: colors.white,
    inversePrimary: colors.bubblegumSoft,

    elevation: {
      level0: 'transparent',
      level1: colors.surface,
      level2: colors.surfaceRaised,
      level3: colors.surfaceSunk,
      level4: colors.surfaceSunk,
      level5: colors.surfaceSunk,
    },
  },
};

// A calmer variant of the same theme shape, for the parent-facing Settings
// surface — swaps in `colors.parent`'s muted family instead of the playful
// child-facing brand colors, while keeping the same roundness/fonts so
// Paper components still feel like the same app, just in its "grown-up
// register". Not wired up anywhere yet (Settings itself isn't redesigned
// this iteration) — provided now so the Settings redesign iteration can
// wrap just that screen's subtree in a nested <PaperProvider theme={...}>
// without having to invent this mapping from scratch.
export const parentPaperTheme: MD3Theme = {
  ...paperTheme,
  colors: {
    ...paperTheme.colors,
    primary: colors.parent.accent,
    onPrimary: colors.white,
    primaryContainer: colors.parent.accentSoft,
    onPrimaryContainer: colors.parent.accentDark,
    background: colors.parent.background,
    onBackground: colors.parent.ink,
    surface: colors.parent.surface,
    onSurface: colors.parent.ink,
    onSurfaceVariant: colors.parent.inkMuted,
    outline: colors.parent.border,
  },
};
