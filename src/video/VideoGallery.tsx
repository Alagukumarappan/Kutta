import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '../i18n/LanguageContext';

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

    FileSystem.StorageAccessFramework.readDirectoryAsync(videosFolderUri)
      .then((entries: string[]) => {
        if (!cancelled) setVideos(entries.filter(isVideoFile));
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
        >
          <Text>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (videos === null) return <View testID="video-gallery-loading" style={insetStyle} />;

  if (videos.length === 0) {
    return (
      <View style={insetStyle}>
        <Text>{t('emptyVideos')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={videos}
      keyExtractor={(uri) => uri}
      contentContainerStyle={insetStyle}
      renderItem={({ item }) => (
        <Pressable testID={`video-item-${item}`} onPress={() => onSelect(item)}>
          <Text>{fileNameFromUri(item)}</Text>
        </Pressable>
      )}
    />
  );
}
