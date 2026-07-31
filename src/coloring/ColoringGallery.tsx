import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, Alert, StyleSheet } from 'react-native';
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
  elevation,
  getActivityPalette,
  EmptyStatePanel,
  LoadingPanel,
  RaisedCard,
} from '../design-system';

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
  const { t, language } = useLanguage();
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
  // Which currently-displayed images came from an individual "+" pick
  // (fileReferenceStore) rather than the configured folder — needed at
  // removal time so removeGalleryItems knows whether to drop just the
  // reference or actually delete the real file. See galleryRemoval.ts.
  const [referencedUris, setReferencedUris] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  // Bumped on Retry (or after adding/removing files) to force a fresh load
  // attempt even when coloringFolderUri itself hasn't changed.
  const [retryToken, setRetryToken] = useState(0);

  // Long-press-to-multi-select-and-remove. Entering this mode never affects
  // navigation (onSelect) — a tile tap while selecting toggles selection
  // instead of opening the picture, and reverts to normal tap-to-open the
  // moment the selection empties out.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

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
        setReferencedUris(new Set(extraImages));
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

  function handleTilePress(uri: string) {
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

  async function handleRemoveSelected() {
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
            const { failedCount } = await removeGalleryItems('coloring', uris, referencedUris);
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

  if (images === null) {
    return (
      <View style={[{ flex: 1 }, insetStyle]}>
        <LoadingPanel testID="coloring-gallery-loading" color={accent.accent} message={t('galleryLoading')} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, insetStyle]}>
      <View style={styles.headerRow}>
        {selectionMode ? (
          <View testID="coloring-gallery-selection-bar" style={styles.selectionBar}>
            <Text style={styles.selectionCount}>
              {tFormat('gallerySelectedCount', language, { count: selectedUris.size })}
            </Text>
            <View style={styles.selectionActions}>
              <Pressable
                testID="coloring-gallery-cancel-selection"
                onPress={handleCancelSelection}
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
                style={styles.selectionCancelButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.selectionCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                testID="coloring-gallery-remove-selected"
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
            testID="coloring-gallery-add"
            label={t('addColoringPicture')}
            contentType="coloring"
            mimeType="image/*"
            onAdded={() => setRetryToken((n) => n + 1)}
            compact
          />
        )}
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
          renderItem={({ item }) => {
            const isSelected = selectedUris.has(item);
            return (
              <RaisedCard
                testID={`coloring-item-${item}`}
                onPress={() => handleTilePress(item)}
                onLongPress={() => handleLongPress(item)}
                color={colors.surface}
                borderColor={isSelected ? accent.accent : accent.accentDark}
                tilt="compact"
                style={styles.tile}
              >
                <>
                  <Image source={{ uri: item }} style={styles.tileImage} resizeMode="cover" />
                  {selectionMode && (
                    <View
                      testID={`coloring-item-check-${item}`}
                      style={[styles.selectionBadge, isSelected && styles.selectionBadgeChecked]}
                    >
                      {isSelected && <Text style={styles.selectionBadgeMark}>✓</Text>}
                    </View>
                  )}
                </>
              </RaisedCard>
            );
          }}
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
  // row's own spacing is restyled onto the new token scale. While in
  // multi-select mode, this same row swaps to the selection bar instead.
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  selectionBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.inkMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionBadgeChecked: {
    backgroundColor: accent.accent,
    borderColor: accent.accentDark,
  },
  selectionBadgeMark: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
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
