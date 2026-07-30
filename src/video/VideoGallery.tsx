import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
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
  const [videos, setVideos] = useState<string[] | null>(null);

  useEffect(() => {
    FileSystem.StorageAccessFramework.readDirectoryAsync(videosFolderUri).then((entries: string[]) => {
      setVideos(entries.filter(isVideoFile));
    });
  }, [videosFolderUri]);

  if (videos === null) return <View testID="video-gallery-loading" />;

  if (videos.length === 0) {
    return (
      <View>
        <Text>{t('emptyVideos')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={videos}
      keyExtractor={(uri) => uri}
      renderItem={({ item }) => (
        <Pressable testID={`video-item-${item}`} onPress={() => onSelect(item)}>
          <Text>{fileNameFromUri(item)}</Text>
        </Pressable>
      )}
    />
  );
}
