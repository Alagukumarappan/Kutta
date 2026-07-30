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

const CONTENT_SUBFOLDERS = ['pictures', 'videos', 'coloring', 'quiz'] as const;
type ContentSubfolder = (typeof CONTENT_SUBFOLDERS)[number];
type SubfolderUris = Record<ContentSubfolder, string>;

// SAF tree URIs (content://...) are opaque provider-defined identifiers, not
// plain file paths — a naive `${root}/${subfolder}` string join does NOT
// produce a valid child document URI, and (as verified by reading the
// installed expo-file-system source) `StorageAccessFramework
// .getUriForDirectoryInRoot` also does not do this: it takes a single
// folder name and always builds a hardcoded "primary:<name>" URI under the
// device's root storage, ignoring any existing SAF grant entirely.
//
// The only correct way to resolve an existing subfolder's URI under an
// arbitrary already-granted SAF root is to list the root directory (as
// Task 4's folderAccess.ts already does internally for its own existence
// checks) and match the child entry by name — every subfolder already
// exists by the time this runs, because onboarding's ensureContentStructure
// creates pictures/videos/coloring/quiz upfront.
async function resolveSubfolderUris(rootUri: string): Promise<SubfolderUris> {
  const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(rootUri);

  function findChild(name: string): string {
    const match = entries.find(
      (entryUri) => entryUri.endsWith(`/${name}`) || entryUri.endsWith(encodeURIComponent(name))
    );
    if (!match) {
      throw new Error(`Content folder "${name}" was not found under the selected root folder.`);
    }
    return match;
  }

  return {
    pictures: findChild('pictures'),
    videos: findChild('videos'),
    coloring: findChild('coloring'),
    quiz: findChild('quiz'),
  };
}

function AppStack({
  profile,
  folderUris,
}: {
  profile: Profile;
  folderUris: SubfolderUris;
}) {
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
        {() => <QuizScreen quizFolderUri={folderUris.quiz} childAge={profile.age} />}
      </Stack.Screen>
      <Stack.Screen name="coloring">
        {({ navigation }) => (
          <ColoringGallery
            coloringFolderUri={folderUris.coloring}
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
            picturesFolderUri={folderUris.pictures}
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
            videosFolderUri={folderUris.videos}
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
  const [folderUris, setFolderUris] = useState<SubfolderUris | null>(null);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  useEffect(() => {
    if (profile?.rootFolderUri) {
      resolveSubfolderUris(profile.rootFolderUri).then(setFolderUris);
    } else {
      setFolderUris(null);
    }
  }, [profile?.rootFolderUri]);

  if (profile === undefined) return null;

  function refreshProfile() {
    getProfile().then(setProfile);
  }

  return (
    <LanguageProvider initialLanguage={profile?.language ?? 'en'}>
      <NavigationContainer>
        {profile ? (
          folderUris ? (
            <AppStack profile={profile} folderUris={folderUris} />
          ) : null
        ) : (
          <OnboardingScreen onComplete={refreshProfile} />
        )}
      </NavigationContainer>
    </LanguageProvider>
  );
}
