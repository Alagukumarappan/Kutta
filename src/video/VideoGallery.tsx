import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { AddFilesButton } from '../components/AddFilesButton';
import { useSelectableGallery } from '../components/useSelectableGallery';
import {
  colors,
  spacing,
  radii,
  typography,
  getActivityPalette,
  RaisedCard,
  RaisedPrimaryButton,
  EmptyStatePanel,
  LoadingPanel,
} from '../design-system';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm'];

// Same responsive, 3-per-row grid as ColoringGallery/PuzzleGallery — every
// gallery in the app now shares this exact shape instead of Video being its
// own single-column list of filename rows.
const GRID_COLUMNS = 3;

// Video's recognizable per-activity accent (see REDESIGN_PROGRESS.md /
// getActivityPalette) — used across the row cards, the error card's border,
// and the retry CTA so this screen reads as "the video one" at a glance.
const palette = getActivityPalette('video');

function isVideoFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Still used for each tile's accessibilityLabel — the redesigned grid no
// longer shows the filename as visible text (matching Coloring/Puzzle's
// image-only tiles), but a screen-reader user still needs SOME real name
// for the tile beyond "video", not just a generic label repeated for every
// tile in the folder.
function fileNameFromUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  return decoded.substring(decoded.lastIndexOf('/') + 1);
}

// FlatList's `numColumns` combined with a `flex: 1` tile (needed so each
// tile fills an even 1/3 share of the row's width) has a well-known side
// effect on an INCOMPLETE last row — see the identical fix already applied
// to ColoringGallery.tsx/PuzzleGallery.tsx. Padding the data with invisible,
// non-tappable filler entries up to a multiple of GRID_COLUMNS keeps every
// real tile locked to its normal 1/3-width slot.
const GALLERY_FILLER_PREFIX = '__video-gallery-filler__';

function isGalleryFiller(uri: string): boolean {
  return uri.startsWith(GALLERY_FILLER_PREFIX);
}

function withRowFillers(videos: string[]): string[] {
  const remainder = videos.length % GRID_COLUMNS;
  if (remainder === 0) return videos;
  const fillerCount = GRID_COLUMNS - remainder;
  const fillers = Array.from({ length: fillerCount }, (_, i) => `${GALLERY_FILLER_PREFIX}${i}`);
  return [...videos, ...fillers];
}

// A real, live preview frame — not a generic icon — using expo-video (an
// existing dependency, so this needs no new native module/rebuild the way
// a dedicated thumbnail-extraction library would). Plays for one tick and
// immediately pauses: expo-video only actually decodes/paints a frame once
// playback has started at least once, so a player left permanently paused
// from creation shows nothing at all. Muted throughout so this never
// produces a flash of audio from a tile the child hasn't tapped into yet.
function VideoThumbnail({ uri, testID }: { uri: string; testID?: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.play();
    p.pause();
  });
  return (
    <VideoView
      testID={testID}
      player={player}
      style={styles.tileVideo}
      nativeControls={false}
      contentFit="cover"
      surfaceType="textureView"
    />
  );
}

export function VideoGallery({
  videosFolderUri,
  onSelect,
}: {
  videosFolderUri: string;
  onSelect: (videoUri: string) => void;
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
    items: videos,
    error,
    selectionMode,
    selectedUris,
    removing,
    retry,
    toggleSelected,
    handleLongPress,
    handleCancelSelection,
    handleRemoveSelected,
  } = useSelectableGallery(videosFolderUri, 'video', isVideoFile);

  function handleRowPress(uri: string) {
    if (selectionMode) {
      toggleSelected(uri);
    } else {
      onSelect(uri);
    }
  }

  if (error) {
    return (
      <View testID="video-gallery-error" style={[styles.centered, insetStyle]}>
        <RaisedCard color={colors.surface} borderColor={palette.accentDark} elevationLevel="level2" style={styles.errorCardOuter}>
          <View style={styles.errorCardInner}>
            <Text style={styles.errorText}>{t('loadError')}</Text>
            <RaisedPrimaryButton
              testID="video-gallery-retry"
              label={t('retry')}
              onPress={retry}
              color={palette.accent}
              textColor={colors.ink}
              accessibilityLabel={t('retry')}
            />
          </View>
        </RaisedCard>
      </View>
    );
  }

  if (videos === null) {
    return (
      <View style={[styles.container, insetStyle]}>
        <LoadingPanel testID="video-gallery-loading" color={palette.accent} message={t('galleryLoading')} />
      </View>
    );
  }

  return (
    <View style={[styles.container, insetStyle]}>
      <View style={styles.headerRow}>
        {selectionMode ? (
          <View testID="video-gallery-selection-bar" style={styles.selectionBar}>
            <Text style={styles.selectionCount}>
              {tFormat('gallerySelectedCount', language, { count: selectedUris.size })}
            </Text>
            <View style={styles.selectionActions}>
              <Pressable
                testID="video-gallery-cancel-selection"
                onPress={handleCancelSelection}
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
                style={styles.selectionCancelButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.selectionCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                testID="video-gallery-remove-selected"
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
            testID="video-gallery-add"
            label={t('addVideo')}
            contentType="video"
            mimeType="video/*"
            onAdded={retry}
            compact
          />
        )}
      </View>
      {videos.length === 0 ? (
        <EmptyStatePanel
          testID="video-gallery-empty"
          emoji="🎥"
          title={t('emptyVideosTitle')}
          message={t('emptyVideos')}
        />
      ) : (
        <FlatList
          testID="video-gallery-list"
          data={withRowFillers(videos)}
          keyExtractor={(uri) => uri}
          numColumns={GRID_COLUMNS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          // Unlike a plain <Image> tile, each thumbnail here is a REAL
          // native video player (see VideoThumbnail) — FlatList's default
          // virtualization window (~21 items) would keep that many
          // decoders alive at once while scrolling a large folder. A
          // tighter window keeps only what's actually near the viewport
          // mounted, without giving up virtualization altogether.
          initialNumToRender={9}
          maxToRenderPerBatch={6}
          windowSize={3}
          renderItem={({ item }) => {
            if (isGalleryFiller(item)) {
              return <View testID={`video-item-filler-${item}`} style={styles.tile} />;
            }
            const isSelected = selectedUris.has(item);
            return (
              <RaisedCard
                testID={`video-item-${item}`}
                onPress={() => handleRowPress(item)}
                onLongPress={() => handleLongPress(item)}
                color={colors.surface}
                borderColor={isSelected ? palette.accent : palette.accentDark}
                tilt="compact"
                elevationLevel="level2"
                style={styles.tile}
                accessibilityLabel={fileNameFromUri(item)}
                // Only meaningful once multi-select mode is actually
                // active — outside it, this tile has no "selected" concept
                // at all, so `selected` is omitted entirely (not `false`)
                // to leave its accessibilityState untouched, same
                // distinction AgePicker/LanguageSelector/PuzzleGallery's
                // difficulty options already draw.
                selected={selectionMode ? isSelected : undefined}
              >
                <>
                  <VideoThumbnail testID={`video-item-thumbnail-${item}`} uri={item} />
                  {/* A real preview frame alone doesn't read as "this is a
                      video" the way a static photo tile does — this small
                      play-glyph badge is the same universal affordance
                      every video-picker UI uses to disambiguate the two at
                      a glance. */}
                  <View style={styles.playBadge} pointerEvents="none">
                    <Text style={styles.playBadgeText}>▶</Text>
                  </View>
                  {selectionMode && (
                    <View
                      testID={`video-item-check-${item}`}
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
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    padding: spacing.md,
  },
  // Thin header row that right-aligns the compact Add button above the
  // list, instead of the button itself acting as a prominent CTA. While in
  // multi-select mode, this same row swaps to the selection bar instead.
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
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
  listContent: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  row: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  // Same responsive, 3-per-row shape as ColoringGallery/PuzzleGallery: each
  // tile fills an even 1/3 share of the row's width (flex: 1) and stays
  // square (aspectRatio: 1).
  tile: {
    flex: 1,
    aspectRatio: 1,
  },
  tileVideo: {
    flex: 1,
    borderRadius: radii.md,
  },
  playBadge: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.overlayScrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadgeText: {
    color: colors.white,
    fontSize: 13,
    // Optically centers the ▶ glyph, which otherwise reads slightly
    // left-of-center inside a circular badge.
    marginLeft: 2,
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
    backgroundColor: palette.accent,
    borderColor: palette.accentDark,
  },
  selectionBadgeMark: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  errorCardOuter: {
    width: '100%',
    maxWidth: 420,
  },
  errorCardInner: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
