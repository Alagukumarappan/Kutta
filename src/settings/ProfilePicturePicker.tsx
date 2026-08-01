import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, Image, Modal, StyleSheet, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { useLanguage } from '../i18n/LanguageContext';
import { colors, radii, spacing, elevation, withAlpha, LoadingPanel } from '../design-system';

// Grid layout for the thumbnail list — 3 columns reads as a proper "picture
// grid" (per this redesign's brief) instead of the previous single-column
// scrolling list, and fits comfortably within this modal's fixed
// maxWidth/maxHeight (see `card`/`list` styles below).
const GRID_COLUMNS = 3;

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

function isImageFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// A modal picker for the optional Home-screen profile picture, opened from
// SettingsScreen. Deliberately mirrors ColoringGallery/PuzzleGallery's
// established folder-listing pattern (same SAF `readDirectoryAsync` call,
// same loading/error/empty states, same Retry affordance) rather than
// inventing a new one — this app already has exactly one correct way to
// list images out of a granted content folder. Lists the SAME "pictures"
// folder PuzzleGallery already uses (`folderUris.pictures` in
// RootNavigator), so this needs zero new permissions and zero new
// dependencies (no image-picker/camera library).
export function ProfilePicturePicker({
  visible,
  picturesFolderUri,
  onSelect,
  onClose,
}: {
  visible: boolean;
  // Optional: during onboarding, the parent hasn't picked a content folder
  // yet (and even once they have, ensureContentStructure only creates the
  // real "pictures" subfolder at Save time) — so there is nothing to list
  // yet. When omitted, this picker skips the folder grid/loading/error
  // states entirely and offers only "Browse anywhere", which needs no
  // folder at all.
  picturesFolderUri?: string;
  onSelect: (imageUri: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [images, setImages] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  // Bumped on Retry to force a fresh load attempt even when
  // picturesFolderUri itself hasn't changed (e.g. a transient failure).
  const [retryToken, setRetryToken] = useState(0);
  // Guards a double-tap on a thumbnail (or two different thumbnails in
  // quick succession) from calling onSelect more than once for a single
  // "open picker, pick one" interaction — the parent closes the modal on
  // the first selection, but that close isn't synchronous with the tap. A
  // ref (not state) is required here: two `onPress` calls dispatched back
  // to back (a real double-tap) both run before a `setState`-driven flag
  // would have re-rendered, so state alone can't block the second one.
  const selectingRef = useRef(false);
  // Separate busy flag for the "Browse anywhere" button below — it opens
  // expo-document-picker (the same pattern AddFilesButton uses, but
  // single-select since a profile picture is exactly one image) rather
  // than tapping a thumbnail from the folder list. Guarded the same way:
  // a ref for the synchronous double-tap block, plus state to visually
  // disable the button while the native picker is open. Deliberately NOT
  // reset in the reopen effect below like selectingRef is — its own
  // try/finally already clears it after every single getDocumentAsync
  // call, so it can never be left stuck true across a reopen.
  const browsingRef = useRef(false);
  const [browsing, setBrowsing] = useState(false);

  // Re-list every time the modal is (re-)opened, not just when
  // picturesFolderUri changes — content can change between opens (a photo
  // added/removed from outside the app) and this is cheap to re-run.
  useEffect(() => {
    if (!visible) return;
    selectingRef.current = false;

    if (!picturesFolderUri) {
      // No folder to list (see the prop's own doc comment) — leave images
      // as null and skip the SAF call entirely; the render below treats a
      // missing picturesFolderUri as "no grid section" rather than
      // rendering null as an infinite loading spinner.
      setError(false);
      setImages(null);
      return;
    }

    let cancelled = false;
    setError(false);
    setImages(null);

    FileSystem.StorageAccessFramework.readDirectoryAsync(picturesFolderUri)
      .then((entries) => {
        if (!cancelled) setImages(entries.filter(isImageFile));
      })
      .catch(() => {
        // The SAF grant may have been revoked, the folder deleted
        // externally, or an SD card unmounted — surface a retry state
        // instead of leaving an unhandled rejection and a permanently
        // blank modal.
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, picturesFolderUri, retryToken]);

  function handleSelect(uri: string) {
    if (selectingRef.current) return;
    selectingRef.current = true;
    // A file picked here can disappear between this list and the moment it
    // is actually rendered elsewhere (e.g. a race with external deletion) —
    // that failure mode is already handled at *display* time by
    // resolveProfilePictureUri (see src/storage/profilePicture.ts), which
    // gracefully falls back to no-picture rather than a broken image. This
    // picker only needs to hand back the URI the child tapped, not
    // re-verify it.
    onSelect(uri);
  }

  async function handleBrowseAnywhere() {
    if (browsingRef.current || selectingRef.current) return;
    browsingRef.current = true;
    setBrowsing(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        multiple: false,
        copyToCacheDirectory: false,
      });
      if (!result.canceled && result.assets.length > 0) {
        handleSelect(result.assets[0].uri);
      }
    } catch {
      // Mirrors AddFilesButton's error handling — a picker failure (e.g. a
      // misbehaving external file provider) surfaces as a friendly alert
      // instead of crashing this modal.
      Alert.alert(t('profilePictureBrowseError'));
    } finally {
      browsingRef.current = false;
      setBrowsing(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('profilePicturePickerTitle')}</Text>

          {picturesFolderUri && error && (
            <View testID="profile-picture-picker-error" style={styles.stateBox}>
              <Text style={styles.stateText}>{t('loadError')}</Text>
              <Pressable
                testID="profile-picture-picker-retry"
                onPress={() => setRetryToken((n) => n + 1)}
                accessibilityRole="button"
                accessibilityLabel={t('retry')}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
              >
                <Text style={styles.retryText}>{t('retry')}</Text>
              </Pressable>
            </View>
          )}

          {picturesFolderUri && !error && images === null && (
            <View testID="profile-picture-picker-loading" style={styles.stateBox}>
              <LoadingPanel color={colors.parent.accent} message={t('galleryLoading')} />
            </View>
          )}

          {picturesFolderUri && !error && images !== null && images.length === 0 && (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>{t('emptyPictures')}</Text>
            </View>
          )}

          {picturesFolderUri && !error && images !== null && images.length > 0 && (
            <FlatList
              testID="profile-picture-picker-list"
              data={images}
              keyExtractor={(uri) => uri}
              style={styles.list}
              numColumns={GRID_COLUMNS}
              columnWrapperStyle={styles.gridRow}
              renderItem={({ item, index }) => (
                <Pressable
                  testID={`profile-picture-item-${item}`}
                  onPress={() => handleSelect(item)}
                  accessibilityRole="button"
                  // Deliberately a generic, index-based label rather than
                  // the raw filename — a photo's filename can itself carry
                  // personal metadata (e.g. "birthday-party-grandma.jpg")
                  // that has no business being read aloud by a screen
                  // reader, matching this feature's "don't leak personal
                  // metadata beyond the URI itself" constraint.
                  accessibilityLabel={`${t('profilePictureChoose')} ${index + 1}`}
                  style={styles.thumbWrap}
                >
                  <Image source={{ uri: item }} style={styles.thumb} />
                </Pressable>
              )}
            />
          )}

          <Pressable
            testID="profile-picture-picker-browse-anywhere"
            onPress={handleBrowseAnywhere}
            disabled={browsing}
            style={({ pressed }) => [
              styles.browseButton,
              browsing && styles.browseButtonDisabled,
              pressed && !browsing && styles.pressedSubtle,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('profilePictureBrowseAnywhere')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.browseButtonText}>{t('profilePictureBrowseAnywhere')}</Text>
          </Pressable>

          <Pressable
            testID="profile-picture-picker-cancel"
            onPress={onClose}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressedSubtle]}
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    // This is exactly `colors.parent.ink` at 50% alpha (the parent-register
    // equivalent of `colors.overlayScrim`'s plum-tinted child-facing
    // backdrop) — expressed via the shared `withAlpha` helper instead of a
    // hand-typed rgba() literal that happened to already match it.
    backgroundColor: withAlpha(colors.parent.ink, 0.5),
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.parent.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.parent.border,
    padding: spacing.md,
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    ...elevation.level3,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.parent.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  stateBox: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  stateText: {
    color: colors.parent.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  retryText: {
    color: colors.parent.accentDark,
    fontWeight: '700',
    fontSize: 16,
  },
  list: {
    maxHeight: 320,
  },
  // A real 3-column picture grid (per this redesign's brief), replacing the
  // previous single-column scrolling list — sized by percentage width
  // (rather than a fixed px thumb) so it stays correct if `card`'s maxWidth
  // ever changes.
  gridRow: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  thumbWrap: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.parent.border,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  browseButton: {
    marginTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.parent.accent,
    ...elevation.level1,
  },
  browseButtonDisabled: {
    backgroundColor: colors.disabledBg,
    shadowOpacity: 0,
    elevation: 0,
  },
  browseButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  cancelButton: {
    marginTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.parent.border,
  },
  cancelButtonText: {
    color: colors.parent.ink,
    fontWeight: '700',
    fontSize: 16,
  },
  // Same calm, non-bouncy pressed feedback as SettingsScreen's own
  // `pressedSubtle` — a plain opacity dip via Pressable's `pressed` render
  // prop, no Animated driver.
  pressedSubtle: {
    opacity: 0.75,
  },
});
