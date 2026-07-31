import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLanguage } from '../i18n/LanguageContext';
import { colors, spacing, radii, shadow } from '../theme/tokens';

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
      <View
        testID="video-player-error"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: insets.bottom,
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: 'bold',
            color: colors.ink,
            textAlign: 'center',
            marginBottom: spacing.md,
          }}
        >
          {t('videoLoadError')}
        </Text>
        <Pressable
          testID="video-player-retry"
          onPress={handleRetry}
          accessibilityRole="button"
          accessibilityLabel={t('retry')}
          style={{
            backgroundColor: colors.coral,
            borderColor: colors.coralDark,
            borderWidth: 2,
            borderRadius: radii.xl,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.xl,
            ...shadow,
            elevation: 4,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.white }}>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: insets.bottom,
        justifyContent: 'center',
      }}
    >
      <VideoView
        player={player}
        style={{ width: '100%', height: 300 }}
        nativeControls
      />
    </View>
  );
}
