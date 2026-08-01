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
  LoadingPanel,
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

  if (loading) {
    return (
      <View style={[styles.container, insetStyle(insets)]}>
        <LoadingPanel testID="video-player-loading" color={palette.accent} message={t('galleryLoading')} />
      </View>
    );
  }

  return (
    <View style={[styles.container, insetStyle(insets)]}>
      <RaisedCard
        testID="video-player-frame"
        color={colors.surfaceRaised}
        borderColor={palette.accentDark}
        elevationLevel="level3"
        style={styles.playerFrame}
      >
        <View style={styles.playerInner}>
          <VideoView
            player={player}
            style={styles.videoView}
            nativeControls
            // The player frame above (RaisedCard) clips its content with
            // overflow:'hidden' for rounded corners and carries an Android
            // elevation shadow. The default 'surfaceView' renderer draws
            // via a separate hardware compositor layer that doesn't always
            // composite correctly nested under a clipped/elevated parent —
            // on some devices this shows native controls (which ARE normal
            // Views) but no actual video frames underneath. 'textureView'
            // renders through the normal view hierarchy instead, at a
            // small performance cost, and is exactly what expo-video's own
            // docs recommend for "overlapping/clipped video views".
            surfaceType="textureView"
          />
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
    // RaisedCard's internal cardFace/cardClip layers both use flex:1 (so a
    // RaisedCard normally sizes itself to whatever explicit dimensions its
    // OWN parent gives it) — but this frame's parent (`container`, below)
    // is a centered flex column with no explicit height of its own. Asking
    // a flex:1 chain to size itself inside an unbounded, centered parent
    // has been observed to resolve to an unpredictable height instead of
    // the wrapped content's real size (the same root cause behind a
    // stretched PuzzleScreen preview card fixed elsewhere) — here it
    // collapsed the whole card toward ~0px tall, and since cardClip clips
    // with overflow:'hidden', the real 300px-tall VideoView got clipped
    // down to a sliver: audio kept playing (unaffected by visual clipping)
    // while only a thin line of video showed. Giving this frame an
    // EXPLICIT height removes the ambiguity — this is a best-effort
    // diagnosis reasoned by analogy to a confirmed bug elsewhere in this
    // same RaisedCard component, not yet verified on a real device.
    //
    // RN uses border-box sizing, so this height must cover the full box:
    // videoView's own height (300) + playerInner's padding on both sides
    // (spacing.sm x2) + cardFace's own borderWidth on both sides (4 x2) —
    // omitting the border here would leave cardClip ~8px short of what
    // playerInner actually needs, clipping the bottom sliver of the video
    // right back off again.
    height: 300 + spacing.sm * 2 + 4 * 2,
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
