import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLanguage } from '../i18n/LanguageContext';
import { colors, spacing, typography, getActivityPalette, RaisedCard, RaisedPrimaryButton } from '../design-system';

// Video's recognizable per-activity accent (see REDESIGN_PROGRESS.md /
// getActivityPalette) — used for the player frame's border and the error
// card/retry CTA so this screen reads as "the video one" at a glance,
// matching VideoGallery.
const palette = getActivityPalette('video');

export function VideoPlayerScreen({ videoUri }: { videoUri: string }) {
  const { t } = useLanguage();
  const [error, setError] = useState(false);
  // Shown with headerShown:true (see RootNavigator), so the native header
  // already covers the top inset — only left/right/bottom are ours to
  // handle (a notch or gesture-nav bar sits at one of the sides in this
  // landscape-only app).
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(videoUri, (p) => {
    p.play();
  });

  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') setError(true);
    });
    return () => subscription.remove();
  }, [player]);

  // Unlike QuizScreen/ColoringGallery/ColoringScreen/VideoGallery, which all
  // re-run a fresh fetch/read effect on retry (bumping a `retryToken` in
  // their dependency array), the video player already holds a live,
  // long-lived `player` object for the whole screen lifetime — there's no
  // effect to re-run. The equivalent recovery action here is telling that
  // same player to reload its source and resume playback: `replace` is the
  // documented way to make an `expo-video` player re-attempt the same
  // source (e.g. after a transient SAF/file failure), and clearing `error`
  // lets a subsequent `statusChange` (success or failure) drive the UI again.
  const handleRetry = useCallback(() => {
    setError(false);
    player.replace(videoUri);
    player.play();
  }, [player, videoUri]);

  if (error) {
    return (
      <View testID="video-player-error" style={[styles.centered, insetStyle(insets)]}>
        <RaisedCard color={colors.surface} borderColor={palette.accentDark} elevationLevel="level3" style={styles.errorCardOuter}>
          <View style={styles.errorCardInner}>
            <Text style={styles.errorTitle}>{t('videoLoadError')}</Text>
            <RaisedPrimaryButton
              testID="video-player-retry"
              label={t('retry')}
              onPress={handleRetry}
              color={palette.accent}
              textColor={colors.ink}
              accessibilityLabel={t('retry')}
            />
          </View>
        </RaisedCard>
      </View>
    );
  }

  return (
    <View style={[styles.container, insetStyle(insets)]}>
      <RaisedCard color={colors.surfaceRaised} borderColor={palette.accentDark} elevationLevel="level3" style={styles.playerFrame}>
        <View style={styles.playerInner}>
          <VideoView player={player} style={styles.videoView} nativeControls />
        </View>
      </RaisedCard>
    </View>
  );
}

function insetStyle(insets: { left: number; right: number; bottom: number }) {
  return {
    paddingLeft: insets.left,
    paddingRight: insets.right,
    paddingBottom: insets.bottom,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    padding: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    padding: spacing.md,
  },
  playerFrame: {
    width: '100%',
    maxWidth: 700,
  },
  playerInner: {
    padding: spacing.sm,
  },
  videoView: {
    width: '100%',
    height: 300,
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
  errorTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
