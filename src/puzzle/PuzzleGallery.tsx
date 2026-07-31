import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '../i18n/LanguageContext';
import { AddFilesButton } from '../components/AddFilesButton';
import { pruneMissingFileReferences } from '../storage/fileReferenceStore';
import { colors, spacing, radii, elevation, getActivityPalette, RaisedCard, EmptyStatePanel } from '../design-system';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

// Puzzle's recognizable per-activity accent (see REDESIGN_PROGRESS.md /
// getActivityPalette) — carried through onto every tile's border here so
// the gallery already reads as "puzzle" before a child taps into it.
const PUZZLE_PALETTE = getActivityPalette('puzzle');
const TILE_SIZE = 128;
const GRID_COLUMNS = 4;

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
  // fresh load attempt even when picturesFolderUri itself hasn't changed.
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setImages(null);

    Promise.all([
      FileSystem.StorageAccessFramework.readDirectoryAsync(picturesFolderUri).then((entries) =>
        entries.filter(isImageFile)
      ),
      // Files the parent added individually (outside the configured
      // folder) via AddFilesButton — pruneMissingFileReferences silently
      // drops any that have since become unreachable rather than throwing,
      // so it never causes this Promise.all to reject on its own.
      pruneMissingFileReferences('puzzle'),
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
  }, [picturesFolderUri, retryToken]);

  if (error) {
    // Matches ColoringGallery/VideoGallery's own error-state treatment (a
    // raised, activity-accented retry control with a real >=48dp box)
    // rather than a bare hitSlop-padded text link — this gallery's error
    // state had drifted from its siblings despite all three consuming the
    // same design system.
    return (
      <View testID="puzzle-gallery-error" style={[styles.centeredMessage, insetStyle]}>
        <Text style={styles.errorText}>{t('loadError')}</Text>
        <RaisedCard
          testID="puzzle-gallery-retry"
          onPress={() => setRetryToken((n) => n + 1)}
          color={PUZZLE_PALETTE.accent}
          borderColor={PUZZLE_PALETTE.accentDark}
          tilt="compact"
          accessibilityLabel={t('retry')}
          style={styles.retryCard}
        >
          <View testID="puzzle-gallery-retry-target" style={styles.retryCardInner}>
            <Text style={styles.retryText}>{t('retry')}</Text>
          </View>
        </RaisedCard>
      </View>
    );
  }

  if (images === null) return <View testID="puzzle-gallery-loading" style={[styles.screen, insetStyle]} />;

  return (
    <View style={[styles.screen, insetStyle]}>
      <View style={styles.headerRow}>
        <AddFilesButton
          testID="puzzle-gallery-add"
          label={t('addPuzzlePicture')}
          contentType="puzzle"
          mimeType="image/*"
          onAdded={() => setRetryToken((n) => n + 1)}
          compact
        />
      </View>
      {images.length === 0 ? (
        <EmptyStatePanel testID="puzzle-gallery-empty" emoji="🧩" title={t('emptyPictures')} />
      ) : (
        <FlatList
          data={images}
          keyExtractor={(uri) => uri}
          numColumns={GRID_COLUMNS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <RaisedCard
              testID={`puzzle-item-${item}`}
              onPress={() => onSelect(item)}
              tilt="compact"
              color={colors.surface}
              borderColor={PUZZLE_PALETTE.accentDark}
              elevationLevel="level2"
              style={styles.tile}
            >
              <Image source={{ uri: item }} style={styles.tileImage} />
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
  },
  // Thin header row that right-aligns the compact Add button above the
  // list, instead of the button itself acting as a prominent CTA.
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  grid: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
  },
  gridRow: {
    columnGap: spacing.sm,
    marginBottom: spacing.sm,
  },
  // 128x128 (well above the 48dp minimum touch target) so each tile is both
  // a comfortable tap target and large enough for a 2-8 year old to
  // recognize the picture inside it at a glance.
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  tileImage: {
    width: '100%',
    height: '100%',
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
