import React from 'react';
import { View, Text, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { colors, spacing } from '../theme/tokens';

// Shown for the brief window between app launch and the profile-load
// resolving (see RootNavigator). This is the ONLY screen the app ever shows
// in the manifest's default (unlocked) orientation, before JS locks the
// screen to portrait — so it's deliberately simple and centers cleanly
// either way.
export function SplashScreen() {
  const { t } = useLanguage();

  return (
    <View style={styles.screen} testID="splash-screen">
      <Image
        testID="splash-logo"
        source={require('../../assets/splash-icon.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Kutta"
      />
      <Text style={styles.tagline}>{t('splashTagline')}</Text>
      <ActivityIndicator size="large" color={colors.coral} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
