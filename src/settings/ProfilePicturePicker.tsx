import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, Image, Modal, StyleSheet } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '../i18n/LanguageContext';
import { colors, radii, spacing, shadow } from '../theme/tokens';

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
  picturesFolderUri: string;
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

  // Re-list every time the modal is (re-)opened, not just when
  // picturesFolderUri changes — content can change between opens (a photo
  // added/removed from outside the app) and this is cheap to re-run.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setError(false);
    setImages(null);
    selectingRef.current = false;

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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('profilePicturePickerTitle')}</Text>

          {error && (
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

          {!error && images === null && <View testID="profile-picture-picker-loading" style={styles.stateBox} />}

          {!error && images !== null && images.length === 0 && (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>{t('emptyPictures')}</Text>
            </View>
          )}

          {!error && images !== null && images.length > 0 && (
            <FlatList
              testID="profile-picture-picker-list"
              data={images}
              keyExtractor={(uri) => uri}
              style={styles.list}
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
            testID="profile-picture-picker-cancel"
            onPress={onClose}
            style={styles.cancelButton}
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
    backgroundColor: 'rgba(45, 49, 66, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    ...shadow,
    elevation: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  stateBox: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  stateText: {
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  retryText: {
    color: colors.skyDark,
    fontWeight: 'bold',
    fontSize: 16,
  },
  list: {
    maxHeight: 320,
  },
  thumbWrap: {
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  thumb: {
    width: 100,
    height: 100,
  },
  cancelButton: {
    marginTop: spacing.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: colors.disabledBorder,
  },
  cancelButtonText: {
    color: colors.ink,
    fontWeight: 'bold',
    fontSize: 16,
  },
});
