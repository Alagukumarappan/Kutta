import React, { useRef, useState } from 'react';
import { Pressable, Text, StyleSheet, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useLanguage } from '../i18n/LanguageContext';
import { addFileReferences, type FileReferenceContentType } from '../storage/fileReferenceStore';
import { radii, spacing, shadow } from '../theme/tokens';
// Colors come from the NEW design-system palette, not `../theme/tokens`'s
// old one: this button is rendered directly on the shared sky gradient
// background (GradientScreenBackground) in all three galleries, and the old
// palette's `sky` (#3EC1D3) is so close to that gradient's own sky
// (#3AC7F0) that the pill was ~1.07:1 against it — effectively invisible,
// on the only control a parent has to add their own pictures/videos.
import { colors } from '../design-system';

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
  compact = false,
}: {
  testID: string;
  label: string;
  contentType: FileReferenceContentType;
  mimeType: string;
  onAdded: () => void;
  // Renders a small "+" pill instead of the full-label button — for
  // placement in a header row's top-right corner rather than as a
  // prominent CTA above the list. The full `label` is still exposed via
  // accessibilityLabel either way, so screen-reader users always get the
  // complete description even though the visible glyph shrinks to "+".
  // The visual box shrinks below the ~44x44 guideline in this mode, so
  // hitSlop below restores an effective tap target that meets it (same
  // convention as the gallery retry buttons).
  compact?: boolean;
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
        // Images need their raw bytes read later (ColoringScreen decodes
        // them via expo-file-system + Skia for flood-fill), and the content://
        // URI a picker hands back for an arbitrary photo (Google Photos,
        // a cloud-backed gallery app, etc.) isn't guaranteed to stay
        // reliably byte-readable that way — copying it into the app's own
        // cache directory up front sidesteps the original provider
        // entirely. Videos stay uncopied (referenced in place): they're
        // only ever streamed through expo-video's own player, never read
        // as raw bytes, and copying could mean duplicating a large file.
        // Trade-off: the OS can evict files from the cache directory under
        // storage pressure, which would make a previously-added picture
        // silently vanish on a later app restart — pruneMissingFileReferences
        // (fileReferenceStore.ts) already handles that gracefully by
        // quietly dropping the now-missing reference rather than erroring,
        // so this trades "picture never loads" for the much rarer "picture
        // disappears later," not a new failure mode.
        copyToCacheDirectory: mimeType.startsWith('image/'),
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
      // `disabled` above is already merged into accessibilityState.disabled
      // automatically by RN's own Pressable (verified against its source —
      // it always overlays the `disabled` prop onto whatever
      // accessibilityState is passed here), so this only needs to add the
      // one thing that ISN'T automatic: `busy`, so a screen reader can
      // announce that the file picker/write is in progress, not just that
      // the button is temporarily unavailable.
      accessibilityState={{ busy }}
      style={[styles.button, compact && styles.buttonCompact, busy && styles.buttonDisabled]}
      hitSlop={
        compact
          ? { top: 10, bottom: 10, left: 10, right: 10 }
          : { top: 8, bottom: 8, left: 8, right: 8 }
      }
    >
      <Text style={[styles.text, compact && styles.textCompact, busy && styles.textDisabled]}>
        {compact ? '+' : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // An opaque white pill with a dark ink outline and an ink glyph, rather
  // than a saturated brand fill with a white glyph: this control always sits
  // straight on the sky gradient (no card behind it), where every brand
  // accent hue lands under 2.5:1 and white text under 3.3:1. The ink outline
  // clears 5:1+ against the whole gradient, so the button's shape is
  // unmistakable, and ink-on-white keeps the glyph itself far above 4.5:1.
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
  // Visual box is intentionally under the 44x44 guideline — the larger
  // hitSlop above (10 on each side, giving an effective ~44x44 tap target)
  // is what keeps this accessible, matching the retry-button convention
  // used elsewhere in the galleries for small, isolated controls.
  buttonCompact: {
    minWidth: 32,
    minHeight: 32,
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginBottom: 0,
    borderRadius: radii.md,
    alignItems: 'center',
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
  // Without this the glyph kept its normal color on the light disabled
  // fill while the picker is open, so the button read as unchanged (and,
  // in the previous white-on-light-grey version, disappeared entirely).
  textDisabled: {
    color: colors.disabledText,
  },
  textCompact: {
    fontSize: 20,
    lineHeight: 22,
  },
});
