import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';

export type HomeDestination = 'coloring' | 'quiz' | 'puzzle' | 'video' | 'settings';

export function HomeScreen({
  childName,
  onNavigate,
}: {
  childName: string;
  onNavigate: (destination: HomeDestination) => void;
}) {
  const { t } = useLanguage();

  return (
    <View>
      <Text testID="home-child-name">{childName}</Text>

      <Pressable testID="home-card-coloring" onPress={() => onNavigate('coloring')}>
        <Text>{t('homeColoring')}</Text>
      </Pressable>
      <Pressable testID="home-card-quiz" onPress={() => onNavigate('quiz')}>
        <Text>{t('homeQuiz')}</Text>
      </Pressable>
      <Pressable testID="home-card-puzzle" onPress={() => onNavigate('puzzle')}>
        <Text>{t('homePuzzle')}</Text>
      </Pressable>
      <Pressable testID="home-card-video" onPress={() => onNavigate('video')}>
        <Text>{t('homeVideo')}</Text>
      </Pressable>

      <Pressable testID="home-settings-icon" onPress={() => onNavigate('settings')}>
        <Text>⚙️</Text>
      </Pressable>
    </View>
  );
}
