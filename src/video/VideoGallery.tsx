import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '../i18n/LanguageContext';
import { AddFilesButton } from '../components/AddFilesButton';
import { pruneMissingFileReferences } from '../storage/fileReferenceStore';
import {
  colors,
  spacing,
  typography,
  touchTarget,
  getActivityPalette,
  RaisedCard,
  RaisedPrimaryButton,
  EmptyStatePanel,
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
  const { t } = useLanguage();
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
  const [error, setError] = useState(false);
  // Bumped on Retry to force a fresh load attempt even when
  // videosFolderUri itself hasn't changed (e.g. a transient failure).
  const [retryToken, setRetryToken] = useState(0);

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

  if (videos === null) return <View testID="video-gallery-loading" style={insetStyle} />;

  return (
    <View style={[styles.container, insetStyle]}>
      <View style={styles.headerRow}>
        <AddFilesButton
          testID="video-gallery-add"
          label={t('addVideo')}
          contentType="video"
          mimeType="video/*"
          onAdded={() => setRetryToken((n) => n + 1)}
          compact
        />
      </View>
      {videos.length === 0 ? (
        <EmptyStatePanel testID="video-gallery-empty" emoji="🎥" title={t('emptyVideos')} />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(uri) => uri}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <RaisedCard
              testID={`video-item-${item}`}
              onPress={() => onSelect(item)}
              color={palette.accentSoft}
              borderColor={palette.accentDark}
              tilt="compact"
              elevationLevel="level2"
              style={styles.videoRow}
              accessibilityLabel={fileNameFromUri(item)}
            >
              <View style={styles.videoRowContent}>
                <Text style={styles.videoEmoji}>🎬</Text>
                <Text style={styles.videoLabel} numberOfLines={1}>
                  {fileNameFromUri(item)}
                </Text>
              </View>
            </RaisedCard>
          )}
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
  // list, instead of the button itself acting as a prominent CTA.
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
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
