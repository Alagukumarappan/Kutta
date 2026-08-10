import React, { useState } from 'react';
import { View, Text, FlatList, Image, Pressable, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { TakePhotoButton } from '../components/TakePhotoButton';
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
  GradientScreenBackground,
} from '../design-system';

const GALLERY_COLUMNS = 3;

// Same FlatList "flex + numColumns incomplete last row" fix ColoringGallery/
// PuzzleGallery/VideoGallery each already use — an incomplete last row's
// real tiles would otherwise stretch to fill the row's full width instead of
// their normal 1/3 share.
const GALLERY_FILLER_PREFIX = '__camera-gallery-filler__';

function isGalleryFiller(uri: string): boolean {
  return uri.startsWith(GALLERY_FILLER_PREFIX);
}

function withRowFillers(images: string[]): string[] {
  const remainder = images.length % GALLERY_COLUMNS;
  if (remainder === 0) return images;
  const fillerCount = GALLERY_COLUMNS - remainder;
  const fillers = Array.from({ length: fillerCount }, (_, i) => `${GALLERY_FILLER_PREFIX}${i}`);
  return [...images, ...fillers];
}

// Every camera photo is a reference (see useSelectableGallery's optional
// folderUri) — this filter is only ever exercised for the folder-listing
// half, which never runs here, but the hook still needs one for its shared
// signature. Accepts anything: a photo persisted by TakePhotoButton has no
// guaranteed extension convention to filter on.
function acceptAny(): boolean {
  return true;
}

// Camera's recognizable accent (see getActivityPalette) — used for this
// gallery's tile border/ring so it reads as "the Camera screen" at a glance,
// matching every other gallery's own per-activity accent.
const accent = getActivityPalette('camera');

export function CameraGallery() {
  const { t, language } = useLanguage();
  // Shown with headerShown:false (see RootNavigator), so this screen has to
  // account for insets.top itself, same as every other activity gallery.
  const insets = useSafeAreaInsets();
  const insetStyle = {
    paddingTop: insets.top,
    paddingLeft: insets.left,
    paddingRight: insets.right,
    paddingBottom: insets.bottom,
  };
  const {
    items: photos,
    selectionMode,
    selectedUris,
    removing,
    retry,
    toggleSelected,
    handleLongPress,
    handleCancelSelection,
    handleRemoveSelected,
  } = useSelectableGallery(undefined, 'camera', acceptAny);

  // No "activity" screen to navigate to for a camera photo — tapping one
  // just opens it bigger, inline, rather than going anywhere.
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  function handleTilePress(uri: string) {
    if (selectionMode) {
      toggleSelected(uri);
    } else {
      setViewerUri(uri);
    }
  }

  if (photos === null) {
    return (
      <GradientScreenBackground style={insetStyle}>
        <LoadingPanel testID="camera-gallery-loading" color={accent.accent} messageColor={colors.ink} message={t('galleryLoading')} />
      </GradientScreenBackground>
    );
  }

  return (
    <GradientScreenBackground style={[styles.screen, insetStyle]}>
      <View style={styles.headerRow}>
        {selectionMode ? (
          <View testID="camera-gallery-selection-bar" style={styles.selectionBar}>
            <Text style={styles.selectionCount}>
              {tFormat('gallerySelectedCount', language, { count: selectedUris.size })}
            </Text>
            <View style={styles.selectionActions}>
              <Pressable
                testID="camera-gallery-cancel-selection"
                onPress={handleCancelSelection}
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
                style={styles.selectionCancelButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.selectionCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                testID="camera-gallery-remove-selected"
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
          <TakePhotoButton onTaken={retry} />
        )}
      </View>
      {photos.length === 0 ? (
        <EmptyStatePanel
          testID="camera-gallery-empty"
          emoji="📷"
          title={t('emptyCameraTitle')}
          message={t('emptyCamera')}
        />
      ) : (
        <FlatList
          data={withRowFillers(photos)}
          keyExtractor={(uri) => uri}
          numColumns={GALLERY_COLUMNS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            if (isGalleryFiller(item)) {
              return <View testID={`camera-item-filler-${item}`} style={styles.tile} />;
            }
            const isSelected = selectedUris.has(item);
            return (
              <RaisedCard
                testID={`camera-item-${item}`}
                onPress={() => handleTilePress(item)}
                onLongPress={() => handleLongPress(item)}
                color={colors.surface}
                borderColor={isSelected ? accent.accent : accent.accentDark}
                tilt="compact"
                style={styles.tile}
                selected={selectionMode ? isSelected : undefined}
              >
                <>
                  <Image testID={`camera-item-image-${item}`} source={{ uri: item }} style={styles.tileImage} resizeMode="cover" />
                  {selectionMode && (
                    <View
                      testID={`camera-item-check-${item}`}
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

      {/* Tapping a photo opens this bigger, inline version -- there's no
          "activity" for a camera photo the way ColoringScreen etc. are for
          their galleries, so this is a Modal, not a navigated screen. Same
          tap-outside-to-close shape as the coloring reference thumbnail's
          zoom overlay: the backdrop's own Pressable closes it, and the
          photo is wrapped in its own nested Pressable so a tap ON the
          photo doesn't also reach (and dismiss via) the backdrop beneath
          it. */}
      {viewerUri && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setViewerUri(null)}
        >
          <Pressable
            testID="camera-viewer-backdrop"
            style={styles.viewerBackdrop}
            onPress={() => setViewerUri(null)}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <Pressable testID="camera-viewer" onPress={() => {}} style={styles.viewerCard}>
              <Image
                testID="camera-viewer-image"
                source={{ uri: viewerUri }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </GradientScreenBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
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
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCard: {
    width: '90%',
    height: '90%',
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...elevation.level3,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
});
