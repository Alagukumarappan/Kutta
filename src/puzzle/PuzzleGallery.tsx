import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { AddFilesButton } from '../components/AddFilesButton';
import { useSelectableGallery } from '../components/useSelectableGallery';
import {
  getPuzzleDifficulty,
  savePuzzleDifficulty,
  type PuzzleDifficulty,
} from '../storage/puzzleDifficultyStore';
import {
  colors,
  spacing,
  radii,
  elevation,
  getActivityPalette,
  RaisedCard,
  EmptyStatePanel,
  LoadingPanel,
  GradientScreenBackground,
} from '../design-system';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

// Puzzle's recognizable per-activity accent (see REDESIGN_PROGRESS.md /
// getActivityPalette) — carried through onto every tile's border here so
// the gallery already reads as "puzzle" before a child taps into it.
const PUZZLE_PALETTE = getActivityPalette('puzzle');
// Matches ColoringGallery's own grid exactly (3 responsive columns filling
// the row width, not a fixed 128px tile in 4 columns) — this used to be its
// own, different-looking grid; unifying it means a parent sees the same
// "3 pictures per row" shape in every gallery, not just Coloring's.
const GRID_COLUMNS = 3;
const DIFFICULTY_OPTIONS: readonly PuzzleDifficulty[] = [4, 6, 9, 12];

function isImageFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// FlatList's `numColumns` combined with a `flex: 1` tile (needed so each
// tile fills an even 1/3 share of the row's width) has a well-known side
// effect on an INCOMPLETE last row: with fewer than GRID_COLUMNS items in
// the final row, each one's `flex: 1` expands to fill the ENTIRE row width
// instead of just its own 1/3 share — see the identical fix already applied
// to ColoringGallery.tsx. Padding the data with invisible, non-tappable
// filler entries up to a multiple of GRID_COLUMNS keeps every real tile
// locked to its normal 1/3-width slot.
const GALLERY_FILLER_PREFIX = '__puzzle-gallery-filler__';

function isGalleryFiller(uri: string): boolean {
  return uri.startsWith(GALLERY_FILLER_PREFIX);
}

function withRowFillers(images: string[]): string[] {
  const remainder = images.length % GRID_COLUMNS;
  if (remainder === 0) return images;
  const fillerCount = GRID_COLUMNS - remainder;
  const fillers = Array.from({ length: fillerCount }, (_, i) => `${GALLERY_FILLER_PREFIX}${i}`);
  return [...images, ...fillers];
}

export function PuzzleGallery({
  picturesFolderUri,
  onSelect,
}: {
  picturesFolderUri: string;
  onSelect: (imageUri: string, difficulty: PuzzleDifficulty) => void;
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
  } = useSelectableGallery(picturesFolderUri, 'puzzle', isImageFile);

  // Remembered difficulty (piece count), loaded once on mount — see
  // puzzleDifficultyStore.ts. Defaults to 4 until the stored value resolves,
  // matching the "first time going the difficulty level should be 4"
  // requirement without blocking the rest of the gallery on this load.
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>(4);
  const [difficultyModalVisible, setDifficultyModalVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPuzzleDifficulty().then((stored) => {
      if (!cancelled) setDifficulty(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSelectDifficulty(next: PuzzleDifficulty) {
    setDifficulty(next);
    setDifficultyModalVisible(false);
    // Fire-and-forget: a failed write just means the next app open falls
    // back to the previous/default difficulty, not a broken gallery.
    savePuzzleDifficulty(next).catch(() => {});
  }

  function handleTilePress(uri: string) {
    if (selectionMode) {
      toggleSelected(uri);
    } else {
      onSelect(uri, difficulty);
    }
  }

  if (error) {
    // Matches ColoringGallery/VideoGallery's own error-state treatment (a
    // raised, activity-accented retry control with a real >=48dp box)
    // rather than a bare hitSlop-padded text link — this gallery's error
    // state had drifted from its siblings despite all three consuming the
    // same design system.
    return (
      <GradientScreenBackground testID="puzzle-gallery-error" style={[styles.centeredMessage, insetStyle]}>
        <Text style={styles.errorText}>{t('loadError')}</Text>
        <RaisedCard
          testID="puzzle-gallery-retry"
          onPress={retry}
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
      </GradientScreenBackground>
    );
  }

  if (images === null) {
    return (
      <GradientScreenBackground style={[styles.screen, insetStyle]}>
        <LoadingPanel testID="puzzle-gallery-loading" color={PUZZLE_PALETTE.accent} messageColor={colors.ink} message={t('galleryLoading')} />
      </GradientScreenBackground>
    );
  }

  return (
    <GradientScreenBackground style={[styles.screen, insetStyle]}>
      <View style={styles.headerRow}>
        {selectionMode ? (
          <View testID="puzzle-gallery-selection-bar" style={styles.selectionBar}>
            <Text style={styles.selectionCount}>
              {tFormat('gallerySelectedCount', language, { count: selectedUris.size })}
            </Text>
            <View style={styles.selectionActions}>
              <Pressable
                testID="puzzle-gallery-cancel-selection"
                onPress={handleCancelSelection}
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
                style={styles.selectionCancelButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.selectionCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                testID="puzzle-gallery-remove-selected"
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
          <>
            <Pressable
              testID="puzzle-difficulty-picker"
              onPress={() => setDifficultyModalVisible(true)}
              style={styles.difficultyPill}
              accessibilityRole="button"
              accessibilityLabel={tFormat('puzzleDifficultyLabel', language, { count: difficulty })}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <Text style={styles.difficultyPillText}>{tFormat('puzzleDifficultyLabel', language, { count: difficulty })}</Text>
              <Text style={styles.difficultyPillChevron}>▾</Text>
            </Pressable>
            <AddFilesButton
              testID="puzzle-gallery-add"
              label={t('addPuzzlePicture')}
              contentType="puzzle"
              mimeType="image/*"
              onAdded={retry}
              compact
            />
          </>
        )}
      </View>

      <Modal visible={difficultyModalVisible} transparent animationType="fade" onRequestClose={() => setDifficultyModalVisible(false)}>
        <Pressable
          testID="puzzle-difficulty-modal-overlay"
          style={styles.difficultyModalOverlay}
          onPress={() => setDifficultyModalVisible(false)}
          accessibilityRole="button"
          accessibilityLabel={t('puzzleDifficultyModalCloseLabel')}
        >
          <View style={styles.difficultyModalCard}>
            {DIFFICULTY_OPTIONS.map((option) => (
              <Pressable
                key={option}
                testID={`puzzle-difficulty-option-${option}`}
                onPress={() => handleSelectDifficulty(option)}
                style={[styles.difficultyOptionRow, option === difficulty && styles.difficultyOptionRowSelected]}
                accessibilityRole="button"
                accessibilityLabel={tFormat('puzzleDifficultyOptionLabel', language, { count: option })}
                accessibilityState={{ selected: option === difficulty }}
              >
                <Text
                  style={[styles.difficultyOptionText, option === difficulty && styles.difficultyOptionTextSelected]}
                >
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      {images.length === 0 ? (
        <EmptyStatePanel
          testID="puzzle-gallery-empty"
          emoji="🧩"
          title={t('emptyPicturesTitle')}
          message={t('emptyPictures')}
        />
      ) : (
        <FlatList
          testID="puzzle-gallery-list"
          data={withRowFillers(images)}
          keyExtractor={(uri) => uri}
          numColumns={GRID_COLUMNS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (isGalleryFiller(item)) {
              return <View testID={`puzzle-item-filler-${item}`} style={styles.tile} />;
            }
            const isSelected = selectedUris.has(item);
            return (
              <RaisedCard
                testID={`puzzle-item-${item}`}
                onPress={() => handleTilePress(item)}
                onLongPress={() => handleLongPress(item)}
                tilt="compact"
                color={colors.surface}
                borderColor={isSelected ? PUZZLE_PALETTE.accent : PUZZLE_PALETTE.accentDark}
                elevationLevel="level2"
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
                      testID={`puzzle-item-check-${item}`}
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
  },
  // Thin header row that right-aligns the compact Add button above the
  // list, instead of the button itself acting as a prominent CTA. While in
  // multi-select mode, this same row swaps to the selection bar instead.
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  difficultyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: 44,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: PUZZLE_PALETTE.accentDark,
  },
  difficultyPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: PUZZLE_PALETTE.accentDark,
  },
  difficultyPillChevron: {
    fontSize: 12,
    fontWeight: '700',
    color: PUZZLE_PALETTE.accentDark,
  },
  difficultyModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlayScrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  difficultyModalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.sm,
    width: '100%',
    maxWidth: 260,
    ...elevation.level4,
  },
  difficultyOptionRow: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  difficultyOptionRowSelected: {
    backgroundColor: PUZZLE_PALETTE.accentSoft,
  },
  difficultyOptionText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  difficultyOptionTextSelected: {
    color: PUZZLE_PALETTE.accentDark,
  },
  selectionBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Sits directly on the sky gradient background (not a card). `colors.ink`
  // is used rather than `colors.white`: white only clears ~2:1-3.1:1
  // against sky/skyDark, well under the 4.5:1 this text needs, while
  // `colors.ink` clears 5.2:1-8.2:1 across the same range.
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
  grid: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
  },
  gridRow: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  // Same responsive, 3-per-row shape as ColoringGallery: each tile fills an
  // even 1/3 share of the row's width (flex: 1) and stays square
  // (aspectRatio: 1), well above the 48dp minimum touch target on any
  // real device width.
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
    backgroundColor: PUZZLE_PALETTE.accent,
    borderColor: PUZZLE_PALETTE.accentDark,
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
  // above.
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
