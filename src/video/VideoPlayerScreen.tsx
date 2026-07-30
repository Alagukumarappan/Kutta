import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLanguage } from '../i18n/LanguageContext';

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

  if (error) {
    return (
      <View style={{ paddingLeft: insets.left, paddingRight: insets.right, paddingBottom: insets.bottom }}>
        <Text>{t('videoLoadError')}</Text>
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
