import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLanguage } from '../i18n/LanguageContext';

export function VideoPlayerScreen({ videoUri }: { videoUri: string }) {
  const { t } = useLanguage();
  const [error, setError] = useState(false);
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
      <View>
        <Text>{t('videoLoadError')}</Text>
      </View>
    );
  }

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: 300 }}
      nativeControls
    />
  );
}
