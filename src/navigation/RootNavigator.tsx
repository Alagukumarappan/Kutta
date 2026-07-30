import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import { getProfile } from '../storage/profileStore';
import type { Profile } from '../types/profile';
import { LanguageProvider } from '../i18n/LanguageContext';
import { OnboardingScreen } from '../onboarding/OnboardingScreen';
import { HomeScreen } from '../home/HomeScreen';
import { SettingsScreen } from '../settings/SettingsScreen';
import { QuizScreen } from '../quiz/QuizScreen';
import { ColoringGallery } from '../coloring/ColoringGallery';
import { ColoringScreen } from '../coloring/ColoringScreen';
import { PuzzleGallery } from '../puzzle/PuzzleGallery';
import { PuzzleScreen } from '../puzzle/PuzzleScreen';
import { VideoGallery } from '../video/VideoGallery';
import { VideoPlayerScreen } from '../video/VideoPlayerScreen';

const Stack = createNativeStackNavigator();

// SAF tree URIs (content://...) are not plain file paths, so a naive
// `${root}/${subfolder}` string join does not produce a valid child URI.
// Reuse the same helper Task 4's folderAccess.ts uses to derive subfolder
// URIs under a SAF root, for consistency and correctness.
function folderUri(root: string, subfolder: string): string {
  return FileSystem.StorageAccessFramework.getUriForDirectoryInRoot(root, subfolder);
}

function AppStack({ profile, refreshProfile }: { profile: Profile; refreshProfile: () => void }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="Home">
        {({ navigation }) => (
          <HomeScreen
            childName={profile.name}
            onNavigate={(destination) => navigation.navigate(destination)}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="settings">
        {() => <SettingsScreen />}
      </Stack.Screen>
      <Stack.Screen name="quiz">
        {() => <QuizScreen quizFolderUri={folderUri(profile.rootFolderUri!, 'quiz')} childAge={profile.age} />}
      </Stack.Screen>
      <Stack.Screen name="coloring">
        {({ navigation }) => (
          <ColoringGallery
            coloringFolderUri={folderUri(profile.rootFolderUri!, 'coloring')}
            onSelect={(imageUri) => navigation.navigate('coloring-detail', { imageUri })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="coloring-detail">
        {({ route }: any) => <ColoringScreen imageUri={route.params.imageUri} />}
      </Stack.Screen>
      <Stack.Screen name="puzzle">
        {({ navigation }) => (
          <PuzzleGallery
            picturesFolderUri={folderUri(profile.rootFolderUri!, 'pictures')}
            onSelect={(imageUri) => navigation.navigate('puzzle-detail', { imageUri })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="puzzle-detail">
        {({ route }: any) => <PuzzleScreen imageUri={route.params.imageUri} />}
      </Stack.Screen>
      <Stack.Screen name="video">
        {({ navigation }) => (
          <VideoGallery
            videosFolderUri={folderUri(profile.rootFolderUri!, 'videos')}
            onSelect={(videoUri) => navigation.navigate('video-detail', { videoUri })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="video-detail">
        {({ route }: any) => <VideoPlayerScreen videoUri={route.params.videoUri} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  if (profile === undefined) return null;

  return (
    <LanguageProvider initialLanguage={profile?.language ?? 'en'}>
      <NavigationContainer>
        {profile ? (
          <AppStack profile={profile} refreshProfile={() => getProfile().then(setProfile)} />
        ) : (
          <OnboardingScreen onComplete={() => getProfile().then(setProfile)} />
        )}
      </NavigationContainer>
    </LanguageProvider>
  );
}
