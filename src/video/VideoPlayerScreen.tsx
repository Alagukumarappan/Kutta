import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLanguage } from '../i18n/LanguageContext';
import {
  colors,
  spacing,
  typography,
  getActivityPalette,
  RaisedCard,
  RaisedPrimaryButton,
  CelebrationOverlay,
} from '../design-system';

// Video's recognizable per-activity accent (see REDESIGN_PROGRESS.md /
// getActivityPalette) — used for the player frame's border and the error
// card/retry CTA so this screen reads as "the video one" at a glance,
// matching VideoGallery.
const palette = getActivityPalette('video');

export function VideoPlayerScreen({ videoUri }: { videoUri: string }) {
  const { t } = useLanguage();
  const [error, setError] = useState(false);
  // Previously this screen gave a child NO feedback at all when a video
  // finished — it just sat on its last frame with native controls, unlike
  // every other activity (Quiz/Puzzle/Tic-Tac-Toe), which all celebrate a
  // completion moment via the shared CelebrationOverlay. `playToEnd` is
  // expo-video's own end-of-playback event (see VideoPlayerEvents.types.d.ts),
  // fired once when the video reaches its end without looping.
  const [finished, setFinished] = useState(false);
  // Shown with headerShown:false (see RootNavigator — every activity
  // screen dropped the native header/back-button in favor of the device's
  // own hardware/gesture back), so this screen now has to account for
  // insets.top itself too, the same way HomeScreen (also headerShown:
  // false) already does.
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(videoUri, (p) => {
    p.play();
  });
  // Same double-fire guard idiom as every other Retry/Next-style action in
  // this app (e.g. PuzzleScreen's retryFiredRef, QuizScreen's
  // playAgainFiredRef): handleRetry backs BOTH the error-state Retry button
  // and the celebration's "Watch Again" action, so without this a rapid
  // double-tap could fire it twice in the same render before `error`/
  // `finished` flip back to false. Both underlying calls (player.replace +
  // player.play) are idempotent, so a double-fire was never destructive
  // here — this is purely a consistency fix, matching the guarded shape
  // every other Retry-style button in the app already has. Re-armed
  // whenever a fresh error or a fresh finish makes the button reappear.
  const retryFiredRef = useRef(false);

  useEffect(() => {
    if (error || finished) retryFiredRef.current = false;
  }, [error, finished]);

  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') setError(true);
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    const subscription = player.addListener('playToEnd', () => {
      setFinished(true);
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
    if (retryFiredRef.current) return;
    retryFiredRef.current = true;
    setError(false);
    setFinished(false);
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

      <CelebrationOverlay
        visible={finished}
        tone="success"
        emoji="🎉"
        title={t('videoFinished')}
        testID="video-finished"
        actions={[{ label: t('videoWatchAgain'), onPress: handleRetry, testID: 'video-watch-again' }]}
      />
    </View>
  );
}

function insetStyle(insets: { top: number; left: number; right: number; bottom: number }) {
  return {
    paddingTop: insets.top,
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
