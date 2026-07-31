import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '../i18n/LanguageContext';
import { AddFilesButton } from '../components/AddFilesButton';
import { pruneMissingFileReferences } from '../storage/fileReferenceStore';
import { colors, spacing, elevation, getActivityPalette, EmptyStatePanel, RaisedCard } from '../design-system';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const GALLERY_COLUMNS = 3;

function isImageFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Coloring's recognizable accent (see getActivityPalette in
// src/design-system/tokens.ts) — used for this gallery's tile border/ring so
// it reads as "the Coloring screen" at a glance, matching the accent
// ColoringScreen itself now carries for its toolbar/palette chrome.
const accent = getActivityPalette('coloring');

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
  // Bumped on Retry (or after adding individually-picked files) to force a
  // fresh load attempt even when coloringFolderUri itself hasn't changed.
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setImages(null);

    Promise.all([
      FileSystem.StorageAccessFramework.readDirectoryAsync(coloringFolderUri).then((entries) =>
        entries.filter(isImageFile)
      ),
      // Files the parent added individually (outside the configured
      // folder) via AddFilesButton — pruneMissingFileReferences silently
      // drops any that have since become unreachable rather than throwing,
      // so it never causes this Promise.all to reject on its own.
      pruneMissingFileReferences('coloring'),
    ])
      .then(([folderImages, extraImages]) => {
        if (cancelled) return;
        const merged = [...folderImages, ...extraImages.filter((uri) => !folderImages.includes(uri))];
        setImages(merged);
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
      <View testID="coloring-gallery-error" style={[styles.centeredMessage, insetStyle]}>
        <Text style={styles.errorText}>{t('loadError')}</Text>
        <RaisedCard
          testID="coloring-gallery-retry"
          onPress={() => setRetryToken((n) => n + 1)}
          color={accent.accent}
          borderColor={accent.accentDark}
          tilt="compact"
          accessibilityLabel={t('retry')}
          style={styles.retryCard}
        >
          <View testID="coloring-gallery-retry-target" style={styles.retryCardInner}>
            <Text style={styles.retryText}>{t('retry')}</Text>
          </View>
        </RaisedCard>
      </View>
    );
  }

  if (images === null) return <View testID="coloring-gallery-loading" style={[{ flex: 1 }, insetStyle]} />;

  return (
    <View style={[styles.screen, insetStyle]}>
      <View style={styles.headerRow}>
        <AddFilesButton
          testID="coloring-gallery-add"
          label={t('addColoringPicture')}
          contentType="coloring"
          mimeType="image/*"
          onAdded={() => setRetryToken((n) => n + 1)}
          compact
        />
      </View>
      {images.length === 0 ? (
        <EmptyStatePanel
          testID="coloring-gallery-empty"
          emoji="🎨"
          title={t('emptyColoringTitle')}
          message={t('emptyColoring')}
        />
      ) : (
        <FlatList
          data={images}
          keyExtractor={(uri) => uri}
          numColumns={GALLERY_COLUMNS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <RaisedCard
              testID={`coloring-item-${item}`}
              onPress={() => onSelect(item)}
              color={colors.surface}
              borderColor={accent.accentDark}
              tilt="compact"
              style={styles.tile}
            >
              <Image source={{ uri: item }} style={styles.tileImage} resizeMode="cover" />
            </RaisedCard>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  // Thin header row that right-aligns the compact Add button above the
  // list, instead of the button itself acting as a prominent CTA. The
  // AddFilesButton itself is a component shared across every gallery
  // screen (Coloring/Puzzle/Video), so it stays as-is here — only this
  // row's own spacing is restyled onto the new token scale.
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingBottom: spacing.sm,
  },
  row: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
  },
  tileImage: {
    flex: 1,
  },
  centeredMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  errorText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  retryCard: {
    alignSelf: 'center',
    ...elevation.level2,
  },
  retryCardInner: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    minHeight: 48,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
  },
});
