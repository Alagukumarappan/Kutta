import React from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { AddFilesButton } from '../components/AddFilesButton';
import { useSelectableGallery } from '../components/useSelectableGallery';
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
  // Shown with headerShown:false (see RootNavigator — every activity
  // screen dropped the native header/back-button in favor of the device's
  // own hardware/gesture back), so this screen now has to account for
  // insets.top itself too, the same way HomeScreen (also headerShown:
  // false) already does.
  const insets = useSafeAreaInsets();
  const insetStyle = {
    paddingTop: insets.top,
    paddingLeft: insets.left,
    paddingRight: insets.right,
    paddingBottom: insets.bottom,
  };
  const {
    items: images,
    error,
    selectionMode,
    selectedUris,
    removing,
    retry,
    toggleSelected,
    handleLongPress,
    handleCancelSelection,
    handleRemoveSelected,
  } = useSelectableGallery(coloringFolderUri, 'coloring', isImageFile);

  function handleTilePress(uri: string) {
    if (selectionMode) {
      toggleSelected(uri);
    } else {
      onSelect(uri);
    }
  }

  if (error) {
    return (
      <View testID="coloring-gallery-error" style={[styles.centeredMessage, insetStyle]}>
        <Text style={styles.errorText}>{t('loadError')}</Text>
        <RaisedCard
          testID="coloring-gallery-retry"
          onPress={retry}
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
            onAdded={retry}
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
                // Only meaningful once multi-select mode is actually
                // active — outside it, this tile has no "selected" concept
                // at all, so `selected` is omitted entirely (not `false`)
                // to leave its accessibilityState untouched.
                selected={selectionMode ? isSelected : undefined}
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
