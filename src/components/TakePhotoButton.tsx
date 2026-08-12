import React, { useRef, useState } from 'react';
import { Pressable, Text, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '../i18n/LanguageContext';
import { addFileReferences, persistPickedFile } from '../storage/fileReferenceStore';
import { radii, spacing, shadow } from '../theme/tokens';
import { colors } from '../design-system';

// Opens the phone's own native camera app (via expo-image-picker's
// launchCameraAsync) rather than building a custom in-app camera screen —
// no live preview/zoom/flash controls to reinvent, and it's an interaction
// every parent already knows. The captured photo is copied into this app's
// own durable storage (persistPickedFile -- the same helper AddFilesButton
// already uses for picked images) before being referenced, so it can't
// silently vanish if the OS reclaims the picker's own cache copy later.
export function TakePhotoButton({ onTaken }: { onTaken: () => void }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  // Synchronous double-tap guard, matching AddFilesButton's established
  // convention -- `busy` state alone only disables the button on the NEXT
  // render, too late to stop a real double-tap from opening the native
  // camera twice.
  const inFlightRef = useRef(false);

  async function handlePress() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('cameraPermissionError'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images' });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const persistedUri = await persistPickedFile(asset.uri, asset.fileName ?? undefined);
        await addFileReferences('camera', [persistedUri]);
        onTaken();
      } else if (result.canceled) {
        // The native camera's own post-capture review screen requires an
        // explicit tap on its checkmark/confirm button to keep the shot —
        // pressing back (or a hardware/gesture back) at that screen is
        // reported here identically to backing out before ever taking a
        // picture at all (both are `canceled: true`, with no way to tell
        // them apart from this result alone). Without this, a parent who
        // pressed back thinking the photo was already saved got zero
        // feedback and just found an unchanged, empty gallery — this
        // makes the actual behavior (back cancels, the checkmark confirms)
        // explicit instead of silently discarding the shot.
        Alert.alert(t('cameraPhotoCancelledHint'));
      }
    } catch {
      Alert.alert(t('cameraPhotoError'));
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Pressable
      testID="take-photo-button"
      onPress={handlePress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={t('cameraTakePhoto')}
      accessibilityState={{ busy }}
      style={[styles.button, busy && styles.buttonDisabled]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={[styles.text, busy && styles.textDisabled]}>{t('cameraTakePhoto')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Same "opaque white pill with a dark ink outline" shape as
  // AddFilesButton, for the same reason: this sits directly on the sky
  // gradient background with no card behind it, where a saturated brand
  // fill would fail contrast.
  button: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    ...shadow,
    elevation: 2,
  },
  buttonDisabled: {
    backgroundColor: colors.disabledBg,
    borderColor: colors.disabledBorder,
    elevation: 0,
    shadowOpacity: 0,
  },
  text: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: 'bold',
  },
  textDisabled: {
    color: colors.disabledText,
  },
});
