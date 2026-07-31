import React, { useRef, useState } from 'react';
import { Pressable, Text, StyleSheet, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useLanguage } from '../i18n/LanguageContext';
import { addFileReferences, type FileReferenceContentType } from '../storage/fileReferenceStore';
import { colors, radii, spacing, shadow } from '../theme/tokens';

// Lets a parent add individual images/videos to a card's gallery from
// anywhere on the device (not just the configured content folder), via the
// system file picker in multi-select mode. Selected files are persisted as
// lightweight references (fileReferenceStore.ts) — the actual bytes stay
// wherever the parent picked them from; nothing is copied or uploaded.
export function AddFilesButton({
  testID,
  label,
  contentType,
  mimeType,
  onAdded,
}: {
  testID: string;
  label: string;
  contentType: FileReferenceContentType;
  mimeType: string;
  onAdded: () => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  // Guards against a rapid double-tap opening the native picker twice
  // (and thus firing two overlapping addFileReferences writes) — the
  // `busy` state above already disables the Pressable visually, but a very
  // fast second tap can land before the first re-render commits, so this
  // ref is the actual synchronous guard.
  const inFlightRef = useRef(false);

  async function handlePress() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: mimeType,
        multiple: true,
        copyToCacheDirectory: false,
      });
      if (!result.canceled && result.assets.length > 0) {
        await addFileReferences(
          contentType,
          result.assets.map((asset) => asset.uri)
        );
        onAdded();
      }
    } catch {
      Alert.alert(t('addFilesError'));
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.button, busy && styles.buttonDisabled]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sky,
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
    elevation: 0,
    shadowOpacity: 0,
  },
  text: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
