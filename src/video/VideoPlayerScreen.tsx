import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
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
  LoadingPanel,
  GradientScreenBackground,
} from '../design-system';

// Video's recognizable per-activity accent (see REDESIGN_PROGRESS.md /
// getActivityPalette) — used for the player frame's border and the error
// card/retry CTA so this screen reads as "the video one" at a glance,
// matching VideoGallery.
const palette = getActivityPalette('video');

export function VideoPlayerScreen({ videoUri }: { videoUri: string }) {
  const { t } = useLanguage();
  const [error, setError] = useState(false);
  // Every other async-load screen (galleries, QuizScreen, ColoringScreen)
  // shows an explicit spinner while its content is still loading; this
  // screen previously showed none at all — between mount and the player
  // actually becoming ready (e.g. a large file on slow SAF-backed storage),
  // a child just saw an empty frame with no feedback that anything was
  // happening. Starts `true` since the player begins loading immediately on
  // mount (see the `useVideoPlayer` call below), and is driven entirely by
  // `statusChange` events below — expo-video's own 'idle'/'loading' states
  // both count as still-loading, only 'readyToPlay' (or an error, which
  // takes over the screen entirely via the `error` branch below) clears it.
  const [loading, setLoading] = useState(true);
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
  const { width, height } = useWindowDimensions();
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
    // The player is created (and told to play) synchronously above, before
    // this effect ever runs — its status can already have settled to
    // 'readyToPlay' or even 'error' by the time this subscribes (e.g. a
    // small/cached local file), and a status only transitions ONCE, so
    // missing that first change here would leave `loading` stuck `true`
    // forever with no later `statusChange` ever arriving to unstick it.
    // Syncing from the player's own current `status` up front (in addition
    // to listening for future changes) closes that gap.
    function applyStatus(status: typeof player.status) {
      if (status === 'error') {
        setError(true);
        setLoading(false);
        return;
      }
      setLoading(status !== 'readyToPlay');
    }
    applyStatus(player.status);
    const subscription = player.addListener('statusChange', ({ status }) => applyStatus(status));
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
    // Replacing the source re-triggers the same load sequence as a fresh
    // mount, so the loading spinner should reappear until a new
    // `statusChange` reports the result — otherwise a stale `loading:false`
    // from before the retry could briefly show the (now-invalid) old frame.
    setLoading(true);
    player.replace(videoUri);
    player.play();
  }, [player, videoUri]);

  if (error) {
    return (
      <GradientScreenBackground testID="video-player-error" style={[styles.centered, insetStyle(insets)]}>
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
      </GradientScreenBackground>
    );
  }

  if (loading) {
    return (
      <GradientScreenBackground style={[styles.container, insetStyle(insets)]}>
        <LoadingPanel testID="video-player-loading" color={palette.accent} messageColor={colors.ink} message={t('galleryLoading')} />
      </GradientScreenBackground>
    );
  }

  return (
    <View style={styles.fullScreen}>
      <VideoView
        player={player}
        // Fills the real screen size (see fullScreen's own black
        // background for the immersive look), but still reserves the
        // safe-area insets as padding rather than going fully edge-to-edge
        // behind a notch/gesture-nav bar: expo-video's nativeControls is
        // an all-or-nothing boolean (no way to inset just the controls
        // layer on its own), so going truly edge-to-edge risks the native
        // scrubber/play/fullscreen buttons landing under a cutout and
        // becoming unreachable — a real regression risk not worth trading
        // for a few extra pixels of "immersive" video.
        style={[
          styles.videoView,
          {
            width,
            height,
            paddingTop: insets.top,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            paddingBottom: insets.bottom,
          },
        ]}
        nativeControls
        contentFit="contain"
        // A small RaisedCard frame (this screen's previous look) only ever
        // made sense at a modest fixed size — a genuinely full-screen video
        // is the point here, so there's no card/border chrome left to clip
        // or collapse it (the earlier "thin line" bug was actually that
        // card's own ambiguous flex sizing, not a surface-rendering issue).
        // Switching surfaceType away from the default 'surfaceView' never
        // fixed the thin-line bug (the height fix did) — reverted here.
        // NOTE: whether this also fixes the separate "video shows sideways
        // and upside-down" bug is NOT yet confirmed on a real device. Two
        // candidate causes, either or both may be at play: (1) 'textureView'
        // is known to sometimes not apply a video's own embedded rotation
        // metadata correctly, unlike the default 'surfaceView'; (2) this
        // app force-locks landscape orientation app-wide (see
        // RootNavigator.tsx's ScreenOrientation.lockAsync) independently of
        // the device's live sensor orientation, which can compound with a
        // video's own rotation transform on some Android versions. If
        // reverting surfaceType alone doesn't fix the rotation on-device,
        // the orientation-lock interaction is the next thing to try.
      />

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
    padding: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  // No card/border chrome here at all, unlike the loading/error states —
  // a genuinely full-screen video is the whole point of this redesign, so
  // there's nothing left to clip or ambiguously size it (see VideoView's
  // own inline comment for what used to sit here and why it was removed).
  fullScreen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  videoView: {
    // width/height are set inline from useWindowDimensions() — the actual
    // device screen size, not a fixed guess — so the player genuinely
    // fills the physical screen, edge-to-edge (see the inline style array
    // above for why insets are deliberately NOT applied here).
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
