import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Image } from 'react-native';
import * as FileSystem from 'expo-file-system';
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
  const [images, setImages] = useState<string[] | null>(null);

  useEffect(() => {
    FileSystem.StorageAccessFramework.readDirectoryAsync(coloringFolderUri).then((entries) => {
      setImages(entries.filter(isImageFile));
    });
  }, [coloringFolderUri]);

  if (images === null) return <View testID="coloring-gallery-loading" />;

  if (images.length === 0) {
    return (
      <View>
        <Text>{t('emptyColoring')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={images}
      keyExtractor={(uri) => uri}
      renderItem={({ item }) => (
        <Pressable testID={`coloring-item-${item}`} onPress={() => onSelect(item)}>
          <Image source={{ uri: item }} style={{ width: 100, height: 100 }} />
        </Pressable>
      )}
    />
  );
}
