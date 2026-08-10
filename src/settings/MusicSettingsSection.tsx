import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useLanguage } from '../i18n/LanguageContext';
import { useMusic } from '../music/MusicContext';
import { colors, radii, spacing, elevation, typography } from '../design-system';

// The Music card, shared byte-for-byte between OnboardingScreen and
// SettingsScreen (not two separate implementations) — so the two screens
// can never visually drift apart on this section the way Onboarding's own
// profile-picture handling once did. Styled to match Settings' existing
// Profile Picture card exactly (same card/label/button tokens).
export function MusicSettingsSection() {
  const { t } = useLanguage();
  const { muted, customTrackUri, toggleMuted, setCustomTrackUri, useDefaultTrack } = useMusic();
  const [picking, setPicking] = useState(false);
  // Synchronous double-tap guard, matching AddFilesButton/ProfilePicturePicker's
  // established convention: `picking` state alone only disables the button on
  // the NEXT render, too late to stop a real double-tap from opening the
  // native picker twice.
  const pickingRef = useRef(false);

  async function handleChooseMusic() {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        await setCustomTrackUri(asset.uri, asset.name);
      }
    } catch {
      Alert.alert(t('musicPickError'));
    } finally {
      pickingRef.current = false;
      setPicking(false);
    }
  }

  return (
    <View testID="music-settings-section" style={styles.card}>
      <Text style={styles.label}>{t('settingsMusicTitle')}</Text>
      <View style={styles.row}>
        <Pressable
          testID="music-mute-toggle"
          onPress={toggleMuted}
          accessibilityRole="button"
          accessibilityLabel={muted ? t('musicUnmuteLabel') : t('musicMuteLabel')}
          style={({ pressed }) => [styles.muteButton, pressed && styles.pressedSubtle]}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.muteButtonText}>{muted ? '🔇' : '🔊'}</Text>
        </Pressable>

        <View style={styles.buttons}>
          <Pressable
            testID="music-choose-button"
            onPress={handleChooseMusic}
            disabled={picking}
            accessibilityRole="button"
            accessibilityLabel={t('musicChooseButton')}
            style={({ pressed }) => [
              styles.chooseButton,
              picking && styles.chooseButtonDisabled,
              pressed && !picking && styles.pressedSubtle,
            ]}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={styles.chooseButtonText}>{t('musicChooseButton')}</Text>
          </Pressable>

          {customTrackUri && (
            <Pressable
              testID="music-use-default"
              onPress={useDefaultTrack}
              accessibilityRole="button"
              accessibilityLabel={t('musicUseDefault')}
              style={({ pressed }) => [styles.useDefaultButton, pressed && styles.pressedSubtle]}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <Text style={styles.useDefaultButtonText}>{t('musicUseDefault')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.parent.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.parent.border,
    padding: spacing.xs,
    marginBottom: spacing.xs,
    ...elevation.level1,
  },
  label: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.parent.inkMuted,
    marginBottom: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  muteButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.parent.accentSoft,
    borderWidth: 1,
    borderColor: colors.parent.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteButtonText: {
    fontSize: 22,
  },
  buttons: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chooseButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.parent.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  chooseButtonDisabled: {
    backgroundColor: colors.disabledBg,
  },
  chooseButtonText: {
    color: colors.white,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: '700',
  },
  useDefaultButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.parent.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  useDefaultButtonText: {
    color: colors.parent.accent,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: '700',
  },
  pressedSubtle: {
    opacity: 0.75,
  },
});
