import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { AddFilesButton } from '../components/AddFilesButton';
import { useSelectableGallery } from '../components/useSelectableGallery';
import { ColoringGalleryTileImage } from './ColoringGalleryTileImage';
import { pruneStaleDerivedImages } from './lineArtCache';
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

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const GALLERY_COLUMNS = 3;

// FlatList's `numColumns` combined with a `flex: 1` tile (see `styles.tile`
// below — needed so each tile fills an even 1/3 share of the row's width)
// has a well-known side effect on an INCOMPLETE last row: with only 1 or 2
// items in a row of 3 columns, `columnWrapperStyle`'s flex row still only
// contains those 1-2 real children, so each one's `flex: 1` expands to fill
// the ENTIRE row width instead of just its own 1/3 share — visibly
// stretching (and, combined with `aspectRatio: 1`, growing much taller
// too). Padding the data with invisible, non-tappable filler entries up to
// a multiple of GALLERY_COLUMNS keeps every real tile locked to its normal
// 1/3-width slot, the same fix FlatList's own docs recommend for this exact
// "flex + numColumns" interaction.
const GALLERY_FILLER_PREFIX = '__coloring-gallery-filler__';

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
  } = useSelectableGallery(coloringFolderUri, 'coloring', isImageFile, (uris) => {
    pruneStaleDerivedImages(uris).catch(() => {
      // Best-effort housekeeping -- a failed sweep just means stale derived
      // files linger a little longer, never a user-visible failure.
    });
  });

  function handleTilePress(uri: string) {
    if (selectionMode) {
      toggleSelected(uri);
    } else {
      onSelect(uri);
    }
  }

  if (error) {
    return (
      <GradientScreenBackground>
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
      </GradientScreenBackground>
    );
  }

  if (images === null) {
    return (
      <GradientScreenBackground style={insetStyle}>
        <LoadingPanel testID="coloring-gallery-loading" color={accent.accent} messageColor={colors.ink} message={t('galleryLoading')} />
      </GradientScreenBackground>
    );
  }

  return (
    <GradientScreenBackground style={[styles.screen, insetStyle]}>
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
          data={withRowFillers(images)}
          keyExtractor={(uri) => uri}
          numColumns={GALLERY_COLUMNS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            if (isGalleryFiller(item)) {
              return <View testID={`coloring-item-filler-${item}`} style={styles.tile} />;
            }
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
                  <ColoringGalleryTileImage
                    testID={`coloring-item-image-${item}`}
                    uri={item}
                    style={styles.tileImage}
                  />
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
    </GradientScreenBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
  // Sits directly on the sky gradient background (not a card). `colors.ink`
  // is used rather than `colors.white` here: white only clears ~2:1-3.1:1
  // against sky/skyDark (well under the 4.5:1 this 16px/700 text needs),
  // while `colors.ink` clears 5.2:1-8.2:1 across the same range — the same
  // per-hue reasoning tokens.ts's `ActivityPalette.onAccentText` already
  // documents for sky (see getActivityPalette's comment).
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
  // Same "direct on the gradient, not a card" reasoning as selectionCount
  // above — `colors.ink` reads reliably across the sky/skyDark range,
  // unlike `colors.white`.
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
  // Reads from the activity palette's contrast-audited `onAccentText`
  // instead of a hard-coded white (same reasoning as PuzzleGallery's own
  // retry label) — for coloring's bubblegum accent that resolves to white
  // anyway, so nothing changes visually here; it just can't silently drift
  // if the accent hue is ever re-tuned.
  retryText: {
    fontSize: 17,
    fontWeight: '800',
    color: accent.onAccentText,
  },
});
