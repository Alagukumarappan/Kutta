import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '../i18n/LanguageContext';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

function isImageFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function PuzzleGallery({
  picturesFolderUri,
  onSelect,
}: {
  picturesFolderUri: string;
  onSelect: (imageUri: string) => void;
}) {
  const { t } = useLanguage();
  const [images, setImages] = useState<string[] | null>(null);

  useEffect(() => {
    FileSystem.StorageAccessFramework.readDirectoryAsync(picturesFolderUri).then((entries) => {
      setImages(entries.filter(isImageFile));
    });
  }, [picturesFolderUri]);

  if (images === null) return <View testID="puzzle-gallery-loading" />;

  if (images.length === 0) {
    return (
      <View>
        <Text>{t('emptyPictures')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={images}
      keyExtractor={(uri) => uri}
      renderItem={({ item }) => (
        <Pressable testID={`puzzle-item-${item}`} onPress={() => onSelect(item)}>
          <Image source={{ uri: item }} style={{ width: 100, height: 100 }} />
        </Pressable>
      )}
    />
  );
}
