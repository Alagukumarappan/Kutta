import React from 'react';
import { Text, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { colors, spacing, GradientScreenBackground } from '../design-system';

// Shown for the brief window between app launch and the profile-load
// resolving (see RootNavigator). This is the ONLY screen the app ever shows
// in the manifest's default (unlocked) orientation, before JS locks the
// screen to portrait — so it's deliberately simple and centers cleanly
// either way.
//
// Migrated off the old, separate `../theme/tokens` module (this was the
// last screen still on it) onto the new design system's shared
// `GradientScreenBackground` (sky/skyDark), for full consistency with every
// other screen. The tagline and spinner both sit directly on the gradient
// (not a card), so both use `colors.ink` rather than the old theme's own
// `colors.ink`/`colors.coral` (tuned for that theme's flat cream
// background): ink clears 5.2:1-8.2:1 against sky/skyDark, comfortably
// above the 4.5:1 the tagline text needs, while a light color like white or
// the old coral brand accent falls to as low as ~1:1-2:1 in the same range.
export function SplashScreen() {
  const { t } = useLanguage();

  return (
    <GradientScreenBackground style={styles.screen} testID="splash-screen">
      <Image
        testID="splash-logo"
        source={require('../../assets/splash-icon.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Kutta"
      />
      <Text style={styles.tagline}>{t('splashTagline')}</Text>
      <ActivityIndicator size="large" color={colors.ink} style={styles.spinner} />
    </GradientScreenBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  logo: {
    width: 240,
    height: 160,
    marginBottom: spacing.md,
  },
  tagline: {
    fontSize: 16,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  spinner: {
    marginTop: spacing.sm,
  },
});
