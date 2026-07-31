import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '../i18n/LanguageContext';
import { spacing } from '../theme/tokens';
import { EmptyState } from '../components/EmptyState';
import { AddFilesButton } from '../components/AddFilesButton';
import { pruneMissingFileReferences } from '../storage/fileReferenceStore';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm'];

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
      <View testID="video-gallery-error" style={insetStyle}>
        <Text>{t('loadError')}</Text>
        <Pressable
          testID="video-gallery-retry"
          onPress={() => setRetryToken((n) => n + 1)}
          accessibilityRole="button"
          accessibilityLabel={t('retry')}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <Text>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (videos === null) return <View testID="video-gallery-loading" style={insetStyle} />;

  return (
    <View style={[{ flex: 1 }, insetStyle]}>
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
        <EmptyState testID="video-gallery-empty" emoji="🎥" message={t('emptyVideos')} />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(uri) => uri}
          renderItem={({ item }) => (
            <Pressable testID={`video-item-${item}`} onPress={() => onSelect(item)} style={styles.videoRow}>
              <Text>{fileNameFromUri(item)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Thin header row that right-aligns the compact Add button above the
  // list, instead of the button itself acting as a prominent CTA.
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingBottom: spacing.sm,
  },
  // Rows are rendered back-to-back with no gap/separator, so a `hitSlop`
  // fix (as used for the isolated retry button above) would make adjacent
  // rows' tap zones overlap. A real minHeight instead grows the row itself,
  // pushing later rows down rather than creating an invisible overlap.
  videoRow: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
});
