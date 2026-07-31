import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { AddFilesButton } from '../components/AddFilesButton';
import { pruneMissingFileReferences } from '../storage/fileReferenceStore';
import { removeGalleryItems } from '../storage/galleryRemoval';
import {
  colors,
  spacing,
  radii,
  typography,
  touchTarget,
  getActivityPalette,
  RaisedCard,
  RaisedPrimaryButton,
  EmptyStatePanel,
  LoadingPanel,
} from '../design-system';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm'];

// Video's recognizable per-activity accent (see REDESIGN_PROGRESS.md /
// getActivityPalette) — used across the row cards, the error card's border,
// and the retry CTA so this screen reads as "the video one" at a glance.
const palette = getActivityPalette('video');

function isVideoFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function fileNameFromUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  return decoded.substring(decoded.lastIndexOf('/') + 1);
}

export function VideoGallery({
  videosFolderUri,
  onSelect,
}: {
  videosFolderUri: string;
  onSelect: (videoUri: string) => void;
}) {
  const { t, language } = useLanguage();
  // Shown with headerShown:true (see RootNavigator), so the native header
  // already covers the top inset — only left/right/bottom are ours to
  // handle here (a notch or gesture-nav bar sits at one of the sides in this
  // landscape-only app).
  const insets = useSafeAreaInsets();
  const insetStyle = {
    paddingLeft: insets.left,
    paddingRight: insets.right,
    paddingBottom: insets.bottom,
  };
  const [videos, setVideos] = useState<string[] | null>(null);
  // Which currently-displayed videos came from an individual "+" pick
  // (fileReferenceStore) rather than the configured folder — needed at
  // removal time so removeGalleryItems knows whether to drop just the
  // reference or actually delete the real file. See galleryRemoval.ts.
  const [referencedUris, setReferencedUris] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  // Bumped on Retry (or after adding/removing files) to force a fresh load
  // attempt even when videosFolderUri itself hasn't changed.
  const [retryToken, setRetryToken] = useState(0);

  // Long-press-to-multi-select-and-remove — same pattern as
  // ColoringGallery/PuzzleGallery. Entering this mode never affects
  // navigation (onSelect); a tap while selecting toggles selection instead,
  // and reverts to normal tap-to-open the moment the selection empties out.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setVideos(null);

    Promise.all([
      FileSystem.StorageAccessFramework.readDirectoryAsync(videosFolderUri).then((entries: string[]) =>
        entries.filter(isVideoFile)
      ),
      // Videos the parent added individually (outside the configured
      // folder) via AddFilesButton — pruneMissingFileReferences silently
      // drops any that have since become unreachable rather than throwing,
      // so it never causes this Promise.all to reject on its own.
      pruneMissingFileReferences('video'),
    ])
      .then(([folderVideos, extraVideos]) => {
        if (cancelled) return;
        const merged = [...folderVideos, ...extraVideos.filter((uri) => !folderVideos.includes(uri))];
        setVideos(merged);
        setReferencedUris(new Set(extraVideos));
      })
      .catch(() => {
        // The SAF grant may have been revoked, the folder deleted externally,
        // or an SD card unmounted — surface a retry state instead of leaving
        // an unhandled rejection and a permanently blank loading screen.
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [videosFolderUri, retryToken]);

  function toggleSelected(uri: string) {
    setSelectedUris((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) {
        next.delete(uri);
      } else {
        next.add(uri);
      }
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }

  function handleLongPress(uri: string) {
    setSelectionMode(true);
    setSelectedUris((prev) => new Set(prev).add(uri));
  }

  function handleRowPress(uri: string) {
    if (selectionMode) {
      toggleSelected(uri);
    } else {
      onSelect(uri);
    }
  }

  function handleCancelSelection() {
    setSelectionMode(false);
    setSelectedUris(new Set());
  }

  function handleRemoveSelected() {
    const uris = Array.from(selectedUris);
    if (uris.length === 0) return;

    Alert.alert(
      t('galleryRemoveConfirmTitle'),
      t('galleryRemoveConfirmBody'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('galleryRemove'),
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            const { failedCount } = await removeGalleryItems('video', uris, referencedUris);
            setRemoving(false);
            setSelectionMode(false);
            setSelectedUris(new Set());
            if (failedCount > 0) {
              Alert.alert(t('galleryRemoveError'));
            }
            setRetryToken((n) => n + 1);
          },
        },
      ],
      { cancelable: true }
    );
  }

  if (error) {
    return (
      <View testID="video-gallery-error" style={[styles.centered, insetStyle]}>
        <RaisedCard color={colors.surface} borderColor={palette.accentDark} elevationLevel="level2" style={styles.errorCardOuter}>
          <View style={styles.errorCardInner}>
            <Text style={styles.errorText}>{t('loadError')}</Text>
            <RaisedPrimaryButton
              testID="video-gallery-retry"
              label={t('retry')}
              onPress={() => setRetryToken((n) => n + 1)}
              color={palette.accent}
              textColor={colors.ink}
              accessibilityLabel={t('retry')}
            />
          </View>
        </RaisedCard>
      </View>
    );
  }

  if (videos === null) {
    return (
      <View style={[styles.container, insetStyle]}>
        <LoadingPanel testID="video-gallery-loading" color={palette.accent} message={t('galleryLoading')} />
      </View>
    );
  }

  return (
    <View style={[styles.container, insetStyle]}>
      <View style={styles.headerRow}>
        {selectionMode ? (
          <View testID="video-gallery-selection-bar" style={styles.selectionBar}>
            <Text style={styles.selectionCount}>
              {tFormat('gallerySelectedCount', language, { count: selectedUris.size })}
            </Text>
            <View style={styles.selectionActions}>
              <Pressable
                testID="video-gallery-cancel-selection"
                onPress={handleCancelSelection}
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
                style={styles.selectionCancelButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.selectionCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                testID="video-gallery-remove-selected"
                onPress={handleRemoveSelected}
                disabled={removing}
                accessibilityRole="button"
                accessibilityLabel={t('galleryRemove')}
                style={[styles.selectionRemoveButton, removing && styles.selectionRemoveButtonDisabled]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.selectionRemoveText}>{t('galleryRemove')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <AddFilesButton
            testID="video-gallery-add"
            label={t('addVideo')}
            contentType="video"
            mimeType="video/*"
            onAdded={() => setRetryToken((n) => n + 1)}
            compact
          />
        )}
      </View>
      {videos.length === 0 ? (
        <EmptyStatePanel
          testID="video-gallery-empty"
          emoji="🎥"
          title={t('emptyVideosTitle')}
          message={t('emptyVideos')}
        />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(uri) => uri}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = selectedUris.has(item);
            return (
              <RaisedCard
                testID={`video-item-${item}`}
                onPress={() => handleRowPress(item)}
                onLongPress={() => handleLongPress(item)}
                color={palette.accentSoft}
                borderColor={isSelected ? palette.accent : palette.accentDark}
                tilt="compact"
                elevationLevel="level2"
                style={styles.videoRow}
                accessibilityLabel={fileNameFromUri(item)}
              >
                <View style={styles.videoRowContent}>
                  {selectionMode && (
                    <View
                      testID={`video-item-check-${item}`}
                      style={[styles.selectionBadge, isSelected && styles.selectionBadgeChecked]}
                    >
                      {isSelected && <Text style={styles.selectionBadgeMark}>✓</Text>}
                    </View>
                  )}
                  <Text style={styles.videoEmoji}>🎬</Text>
                  <Text style={styles.videoLabel} numberOfLines={1}>
                    {fileNameFromUri(item)}
                  </Text>
                </View>
              </RaisedCard>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    padding: spacing.md,
  },
  // Thin header row that right-aligns the compact Add button above the
  // list, instead of the button itself acting as a prominent CTA. While in
  // multi-select mode, this same row swaps to the selection bar instead.
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  selectionBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionCount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  selectionCancelButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  selectionCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  selectionRemoveButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.berry,
  },
  selectionRemoveButtonDisabled: {
    opacity: 0.5,
  },
  selectionRemoveText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  // Cards are rendered with real vertical spacing between them (marginBottom)
  // rather than a hitSlop/negative-margin trick, so growing the tap target
  // can never make adjacent rows' hit zones overlap — same reasoning the
  // previous plain-row implementation used for its `minHeight`, just carried
  // over onto the new card shape.
  videoRow: {
    minHeight: touchTarget.minimum,
    marginBottom: spacing.sm,
  },
  videoRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  videoEmoji: {
    fontSize: 22,
    marginRight: spacing.sm,
  },
  videoLabel: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.ink,
  },
  selectionBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.inkMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  selectionBadgeChecked: {
    backgroundColor: palette.accent,
    borderColor: palette.accentDark,
  },
  selectionBadgeMark: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  errorCardOuter: {
    width: '100%',
    maxWidth: 420,
  },
  errorCardInner: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
