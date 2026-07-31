import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, Modal, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { AddFilesButton } from '../components/AddFilesButton';
import { pruneMissingFileReferences } from '../storage/fileReferenceStore';
import { removeGalleryItems } from '../storage/galleryRemoval';
import {
  getPuzzleDifficulty,
  savePuzzleDifficulty,
  type PuzzleDifficulty,
} from '../storage/puzzleDifficultyStore';
import { colors, spacing, radii, elevation, getActivityPalette, RaisedCard, EmptyStatePanel } from '../design-system';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

// Puzzle's recognizable per-activity accent (see REDESIGN_PROGRESS.md /
// getActivityPalette) — carried through onto every tile's border here so
// the gallery already reads as "puzzle" before a child taps into it.
const PUZZLE_PALETTE = getActivityPalette('puzzle');
const TILE_SIZE = 128;
const GRID_COLUMNS = 4;
const DIFFICULTY_OPTIONS: readonly PuzzleDifficulty[] = [4, 6, 9, 12];

function isImageFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function PuzzleGallery({
  picturesFolderUri,
  onSelect,
}: {
  picturesFolderUri: string;
  onSelect: (imageUri: string, difficulty: PuzzleDifficulty) => void;
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
  // attempt even when picturesFolderUri itself hasn't changed.
  const [retryToken, setRetryToken] = useState(0);

  // Long-press-to-multi-select-and-remove — same pattern as
  // ColoringGallery. Entering this mode never affects navigation
  // (onSelect); a tile tap while selecting toggles selection instead, and
  // reverts to normal tap-to-open the moment the selection empties out.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

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
  }, [picturesFolderUri, retryToken]);

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
      onSelect(uri, difficulty);
    }
  }

  function handleCancelSelection() {
    setSelectionMode(false);
    setSelectedUris(new Set());
  }

  function handleRemoveSelected() {
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
            const { failedCount } = await removeGalleryItems('puzzle', uris, referencedUris);
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
              onAdded={() => setRetryToken((n) => n + 1)}
              compact
            />
          </>
        )}
      </View>

      <Modal visible={difficultyModalVisible} transparent animationType="fade" onRequestClose={() => setDifficultyModalVisible(false)}>
        <Pressable style={styles.difficultyModalOverlay} onPress={() => setDifficultyModalVisible(false)}>
          <View style={styles.difficultyModalCard}>
            {DIFFICULTY_OPTIONS.map((option) => (
              <Pressable
                key={option}
                testID={`puzzle-difficulty-option-${option}`}
                onPress={() => handleSelectDifficulty(option)}
                style={[styles.difficultyOptionRow, option === difficulty && styles.difficultyOptionRowSelected]}
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
        <EmptyStatePanel testID="puzzle-gallery-empty" emoji="🧩" title={t('emptyPictures')} />
      ) : (
        <FlatList
          data={images}
          keyExtractor={(uri) => uri}
          numColumns={GRID_COLUMNS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
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
              >
                <>
                  <Image source={{ uri: item }} style={styles.tileImage} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
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
