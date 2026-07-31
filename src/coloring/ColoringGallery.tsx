import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '../i18n/LanguageContext';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

function isImageFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function ColoringGallery({
  coloringFolderUri,
  onSelect,
}: {
  coloringFolderUri: string;
  onSelect: (imageUri: string) => void;
}) {
  const { t } = useLanguage();
  // Shown with headerShown:true (see RootNavigator), so the native header
  // already covers the top inset — only left/right/bottom are ours to
  // handle (a notch or gesture-nav bar sits at one of the sides in this
  // landscape-only app).
  const insets = useSafeAreaInsets();
  const insetStyle = {
    paddingLeft: insets.left,
    paddingRight: insets.right,
    paddingBottom: insets.bottom,
  };
  const [images, setImages] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  // Bumped on Retry to force a fresh load attempt even when
  // coloringFolderUri itself hasn't changed (e.g. a transient failure).
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setImages(null);

    FileSystem.StorageAccessFramework.readDirectoryAsync(coloringFolderUri)
      .then((entries) => {
        if (!cancelled) setImages(entries.filter(isImageFile));
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
  }, [coloringFolderUri, retryToken]);

  if (error) {
    return (
      <View testID="coloring-gallery-error" style={insetStyle}>
        <Text>{t('loadError')}</Text>
        <Pressable
          testID="coloring-gallery-retry"
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

  if (images === null) return <View testID="coloring-gallery-loading" style={insetStyle} />;

  if (images.length === 0) {
    return (
      <View style={insetStyle}>
        <Text>{t('emptyColoring')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={images}
      keyExtractor={(uri) => uri}
      contentContainerStyle={insetStyle}
      renderItem={({ item }) => (
        <Pressable testID={`coloring-item-${item}`} onPress={() => onSelect(item)}>
          <Image source={{ uri: item }} style={{ width: 100, height: 100 }} />
        </Pressable>
      )}
    />
  );
}
