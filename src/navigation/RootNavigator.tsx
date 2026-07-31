import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getProfile } from '../storage/profileStore';
import { findChildUri, ensureContentStructure } from '../storage/folderAccess';
import type { Profile } from '../types/profile';
import { LanguageProvider, useLanguage } from '../i18n/LanguageContext';
import type { StringKey } from '../i18n/strings';
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
import { SplashScreen } from '../splash/SplashScreen';

// Everything past the very first launch moment (onboarding, home, settings,
// quiz, coloring, puzzle, video) is landscape-designed, so app.json's
// manifest-level orientation lock was dropped to "default" and replaced with
// this runtime lock instead: lock portrait immediately so the splash below
// never has to fight a landscape-locked window, then flip to landscape once
// the initial profile load resolves and the real (landscape) content is
// about to be shown. A short minimum splash duration keeps it from flashing
// on fast/cached loads; it's skipped under Jest so tests stay fast and
// deterministic (no benefit to a real timer when native modules are mocked
// anyway).
const MINIMUM_SPLASH_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Every route this navigator renders, with its exact `route.params` shape (or
// `undefined` for routes that take none). Passing this to
// `createNativeStackNavigator<RootStackParamList>()` below makes React
// Navigation infer the correct `RouteProp<RootStackParamList, RouteName>` for
// each `<Stack.Screen name="...">`'s `children` render-prop `route` argument,
// so `route.params.imageUri`/`route.params.videoUri` type-check for real
// instead of needing an `as any` cast on the destructure (hand-verified: a
// wrong/misspelled `route.params` property name fails `tsc`). Note this does
// NOT extend to the `navigation` argument in that same render-prop callback —
// React Navigation's own `RouteConfigComponent` type declares it as plain
// `any` regardless of the navigator's param-list generic (see
// `node_modules/@react-navigation/core/.../types.d.ts`'s `children:` field),
// so `navigation.navigate(...)` call sites below and in `HomeScreen` remain
// unchecked against this list — a library type limitation, not something a
// local fix can close without wrapping every render prop in a manually-typed
// helper, which is out of scope here.
type RootStackParamList = {
  Home: undefined;
  settings: undefined;
  quiz: undefined;
  coloring: undefined;
  'coloring-detail': { imageUri: string };
  puzzle: undefined;
  'puzzle-detail': { imageUri: string };
  video: undefined;
  'video-detail': { videoUri: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const CONTENT_SUBFOLDERS = ['pictures', 'videos', 'coloring', 'quiz'] as const;
type ContentSubfolder = (typeof CONTENT_SUBFOLDERS)[number];
type SubfolderUris = Record<ContentSubfolder, string>;

// SAF tree URIs (content://...) are opaque provider-defined identifiers, not
// plain file paths — a naive `${root}/${subfolder}` string join does NOT
// produce a valid child document URI, and `StorageAccessFramework
// .getUriForDirectoryInRoot` also does not do this: it takes a single folder
// name and always builds a hardcoded "primary:<name>" URI under the device's
// root storage, ignoring any existing SAF grant entirely. Reuse the same
// `findChildUri` primitive folderAccess.ts uses to create/locate these
// subfolders in the first place, so both places agree on how a SAF child URI
// is resolved.
async function resolveSubfolderUris(rootUri: string): Promise<SubfolderUris> {
  // Re-run the same idempotent setup onboarding used. If a user deleted or
  // renamed a subfolder from outside the app (a file manager, etc.),
  // ensureContentStructure recreates whatever's missing so resolution below
  // — and a Retry tap on FolderErrorScreen — can self-heal instead of
  // failing identically forever.
  await ensureContentStructure(rootUri);

  async function findChild(name: string): Promise<string> {
    const match = await findChildUri(rootUri, name);
    if (!match) {
      throw new Error(`Content folder "${name}" was not found under the selected root folder.`);
    }
    return match;
  }

  const [pictures, videos, coloring, quiz] = await Promise.all([
    findChild('pictures'),
    findChild('videos'),
    findChild('coloring'),
    findChild('quiz'),
  ]);

  return { pictures, videos, coloring, quiz };
}

function FolderErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <View testID="folder-resolve-error">
      <Text>{t('folderResolveError')}</Text>
      <Pressable
        testID="folder-resolve-retry"
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('retry')}
      >
        <Text>{t('retry')}</Text>
      </Pressable>
    </View>
  );
}

function AppStack({
  profile,
  folderUris,
  onProfileChanged,
}: {
  profile: Profile;
  folderUris: SubfolderUris;
  onProfileChanged: () => void;
}) {
  const { t } = useLanguage();

  // Without an explicit `title`, React Navigation falls back to the raw
  // route name (e.g. "coloring-detail") as the header — English-only and
  // developer-facing, and it ignores the current language setting entirely.
  const titleFor = (key: StringKey) => t(key);

  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="Home" options={{ headerShown: false }}>
        {({ navigation }) => (
          <HomeScreen
            childName={profile.name}
            onNavigate={(destination) => navigation.navigate(destination)}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="settings" options={{ title: titleFor('settingsTitle') }}>
        {() => <SettingsScreen onProfileChanged={onProfileChanged} />}
      </Stack.Screen>
      <Stack.Screen name="quiz" options={{ title: titleFor('homeQuiz') }}>
        {() => <QuizScreen quizFolderUri={folderUris.quiz} childAge={profile.age} />}
      </Stack.Screen>
      <Stack.Screen name="coloring" options={{ title: titleFor('homeColoring') }}>
        {({ navigation }) => (
          <ColoringGallery
            coloringFolderUri={folderUris.coloring}
            onSelect={(imageUri) => navigation.navigate('coloring-detail', { imageUri })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="coloring-detail" options={{ title: titleFor('coloringDetailTitle') }}>
        {({ route }) => <ColoringScreen imageUri={route.params.imageUri} />}
      </Stack.Screen>
      <Stack.Screen name="puzzle" options={{ title: titleFor('homePuzzle') }}>
        {({ navigation }) => (
          <PuzzleGallery
            picturesFolderUri={folderUris.pictures}
            onSelect={(imageUri) => navigation.navigate('puzzle-detail', { imageUri })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="puzzle-detail" options={{ title: titleFor('puzzleDetailTitle') }}>
        {({ route }) => <PuzzleScreen imageUri={route.params.imageUri} />}
      </Stack.Screen>
      <Stack.Screen name="video" options={{ title: titleFor('homeVideo') }}>
        {({ navigation }) => (
          <VideoGallery
            videosFolderUri={folderUris.videos}
            onSelect={(videoUri) => navigation.navigate('video-detail', { videoUri })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="video-detail" options={{ title: titleFor('videoDetailTitle') }}>
        {({ route }) => <VideoPlayerScreen videoUri={route.params.videoUri} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [folderUris, setFolderUris] = useState<SubfolderUris | null>(null);
  const [folderError, setFolderError] = useState(false);
  // Bumped to force a fresh resolution attempt on retry, even when
  // rootFolderUri itself hasn't changed (e.g. a transient SAF failure).
  const [retryToken, setRetryToken] = useState(0);

  const refreshProfile = useCallback(() => {
    getProfile().then(setProfile);
  }, []);

  const retryFolderResolution = useCallback(() => {
    setRetryToken((n) => n + 1);
  }, []);

  // Lock portrait immediately on mount, before the splash below even
  // paints, so there's no visible landscape flash while the profile loads.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch((err) => {
      // No user-facing recovery to build for this today, but a silent
      // failure here would leave orientation unconstrained in an app that's
      // landscape-only by design — worth knowing about during development.
      console.warn('Failed to lock orientation to portrait for splash', err);
    });
  }, []);

  // Initial load only: resolve the profile and hold the splash up for at
  // least MINIMUM_SPLASH_DELAY_MS, then lock landscape — the orientation
  // every screen after the splash is designed for — before revealing
  // onboarding or the app shell. Later profile refreshes (onboarding
  // complete, settings save) go through `refreshProfile` directly and don't
  // repeat this splash/orientation dance; the screen is already landscape
  // by then.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getProfile(), delay(MINIMUM_SPLASH_DELAY_MS)])
      .then(async ([loadedProfile]) => {
        if (cancelled) return;
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch((err) => {
          // Same reasoning as the portrait lock above: no user-facing recovery
          // to build right now, but a failure leaving orientation unconstrained
          // in a landscape-only app is worth surfacing rather than swallowing.
          console.warn('Failed to lock orientation to landscape', err);
        });
        if (cancelled) return;
        setProfile(loadedProfile);
      })
      .catch(() => {
        // If getProfile() rejects (corrupt storage, etc.), fall through to
        // the onboarding flow instead of leaving the splash showing forever
        // with no profile ever resolved.
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (profile?.rootFolderUri) {
      setFolderError(false);
      setFolderUris(null);
      resolveSubfolderUris(profile.rootFolderUri)
        .then((uris) => {
          if (!cancelled) setFolderUris(uris);
        })
        .catch(() => {
          // The SAF grant may have been revoked, or a subfolder may be
          // missing/renamed outside the app — surface a retry state instead
          // of leaving an unhandled rejection and a permanent blank screen.
          if (!cancelled) setFolderError(true);
        });
    } else {
      setFolderUris(null);
      setFolderError(false);
    }

    return () => {
      cancelled = true;
    };
  }, [profile?.rootFolderUri, retryToken]);

  if (profile === undefined) {
    return (
      <LanguageProvider initialLanguage="en">
        <SplashScreen />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider initialLanguage={profile?.language ?? 'en'}>
      <NavigationContainer>
        {profile ? (
          folderError ? (
            <FolderErrorScreen onRetry={retryFolderResolution} />
          ) : folderUris ? (
            <AppStack profile={profile} folderUris={folderUris} onProfileChanged={refreshProfile} />
          ) : null
        ) : (
          <OnboardingScreen onComplete={refreshProfile} />
        )}
      </NavigationContainer>
    </LanguageProvider>
  );
}
