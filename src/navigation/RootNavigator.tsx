import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { NavigationContainer, type NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getProfile } from '../storage/profileStore';
import { findChildUri, ensureContentStructure } from '../storage/folderAccess';
import type { Profile } from '../types/profile';
import { LanguageProvider, useLanguage } from '../i18n/LanguageContext';
import type { StringKey } from '../i18n/strings';
import { colors, spacing, typography, RaisedCard, RaisedPrimaryButton } from '../design-system';
import { OnboardingScreen } from '../onboarding/OnboardingScreen';
import { HomeScreen } from '../home/HomeScreen';
import { SettingsScreen } from '../settings/SettingsScreen';
import { QuizScreen } from '../quiz/QuizScreen';
import { ColoringGallery } from '../coloring/ColoringGallery';
import { ColoringScreen } from '../coloring/ColoringScreen';
import { PuzzleGallery } from '../puzzle/PuzzleGallery';
import { PuzzleScreen } from '../puzzle/PuzzleScreen';
import type { PuzzleDifficulty } from '../storage/puzzleDifficultyStore';
import { VideoGallery } from '../video/VideoGallery';
import { VideoPlayerScreen } from '../video/VideoPlayerScreen';
import { SplashScreen } from '../splash/SplashScreen';
import { TicTacToeSetupScreen, type TicTacToeMode } from '../tictactoe/TicTacToeSetupScreen';
import { TicTacToeScreen } from '../tictactoe/TicTacToeScreen';
import type { Difficulty as TicTacToeDifficulty } from '../tictactoe/ticTacToeEngine';

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
export type RootStackParamList = {
  Home: undefined;
  settings: undefined;
  quiz: undefined;
  coloring: undefined;
  'coloring-detail': { imageUri: string };
  puzzle: undefined;
  'puzzle-detail': { imageUri: string; pieceCount: PuzzleDifficulty };
  video: undefined;
  'video-detail': { videoUri: string };
  tictactoe: undefined;
  'tictactoe-game': { mode: TicTacToeMode; difficulty: TicTacToeDifficulty | null; friendName?: string };
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
  // failing identically forever. Its return value is the "Kutta-games"
  // folder actually holding pictures/videos/coloring/quiz — NOT the raw
  // folder the parent picked in onboarding/Settings.
  const gamesUri = await ensureContentStructure(rootUri);

  async function findChild(name: string): Promise<string> {
    const match = await findChildUri(gamesUri, name);
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

// This is the app's one truly global error screen — reached whenever the
// SAF content folders can't be resolved (a revoked permission, a deleted
// folder, an unmounted SD card), not tied to any single activity. Styled to
// match every other error state already converged on this exact shape
// (RaisedCard + RaisedPrimaryButton — see VideoPlayerScreen/ColoringGallery/
// PuzzleGallery/VideoGallery's own error cards), using the calmer
// `colors.parent` palette (the same one SettingsScreen uses) since this is a
// parent-facing recovery moment, not a child-facing activity.
function FolderErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="folder-resolve-error"
      style={[
        styles.centered,
        { paddingLeft: spacing.md + insets.left, paddingRight: spacing.md + insets.right, paddingTop: spacing.md + insets.top, paddingBottom: spacing.md + insets.bottom },
      ]}
    >
      <RaisedCard color={colors.parent.surface} borderColor={colors.parent.accentDark} elevationLevel="level3" style={styles.errorCardOuter}>
        <View style={styles.errorCardInner}>
          <Text style={styles.errorTitle}>{t('folderResolveError')}</Text>
          <RaisedPrimaryButton
            testID="folder-resolve-retry"
            label={t('retry')}
            onPress={onRetry}
            color={colors.parent.accent}
            textColor={colors.white}
            accessibilityLabel={t('retry')}
          />
        </View>
      </RaisedCard>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.parent.background,
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
    color: colors.parent.ink,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});

function AppStack({
  profile,
  folderUris,
  onProfileChanged,
  onReset,
}: {
  profile: Profile;
  folderUris: SubfolderUris;
  onProfileChanged: () => void;
  onReset: () => void;
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
            pictureUri={profile.pictureUri}
            onNavigate={(destination) => navigation.navigate(destination)}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="settings" options={{ title: titleFor('settingsTitle') }}>
        {({ navigation }) => (
          <SettingsScreen
            onProfileChanged={onProfileChanged}
            picturesFolderUri={folderUris.pictures}
            onGoHome={() => navigation.navigate('Home')}
            onReset={onReset}
          />
        )}
      </Stack.Screen>
      {/* Every activity screen below (and its gallery/setup screen) is
          headerShown:false, same as Home — none of them need the native
          back arrow since the device's own hardware/gesture back already
          does that job, and removing it gives each activity's content the
          full screen height instead of losing a strip to a header bar. */}
      <Stack.Screen name="quiz" options={{ headerShown: false, title: titleFor('homeQuiz') }}>
        {({ navigation }) => (
          <QuizScreen
            quizFolderUri={folderUris.quiz}
            childAge={profile.age}
            onGoHome={() => navigation.navigate('Home')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="coloring" options={{ headerShown: false, title: titleFor('homeColoring') }}>
        {({ navigation }) => (
          <ColoringGallery
            coloringFolderUri={folderUris.coloring}
            onSelect={(imageUri) => navigation.navigate('coloring-detail', { imageUri })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="coloring-detail" options={{ headerShown: false, title: titleFor('coloringDetailTitle') }}>
        {({ route }) => <ColoringScreen imageUri={route.params.imageUri} />}
      </Stack.Screen>
      <Stack.Screen name="puzzle" options={{ headerShown: false, title: titleFor('homePuzzle') }}>
        {({ navigation }) => (
          <PuzzleGallery
            picturesFolderUri={folderUris.pictures}
            onSelect={(imageUri, pieceCount) => navigation.navigate('puzzle-detail', { imageUri, pieceCount })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="puzzle-detail" options={{ headerShown: false, title: titleFor('puzzleDetailTitle') }}>
        {({ navigation, route }) => (
          <PuzzleScreen
            imageUri={route.params.imageUri}
            pieceCount={route.params.pieceCount}
            onNext={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="video" options={{ headerShown: false, title: titleFor('homeVideo') }}>
        {({ navigation }) => (
          <VideoGallery
            videosFolderUri={folderUris.videos}
            onSelect={(videoUri) => navigation.navigate('video-detail', { videoUri })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="video-detail" options={{ headerShown: false, title: titleFor('videoDetailTitle') }}>
        {({ route }) => <VideoPlayerScreen videoUri={route.params.videoUri} />}
      </Stack.Screen>
      <Stack.Screen name="tictactoe" options={{ headerShown: false, title: titleFor('tictactoeSetupTitle') }}>
        {({ navigation }) => (
          <TicTacToeSetupScreen
            onStart={(mode, difficulty, friendName) =>
              navigation.navigate('tictactoe-game', { mode, difficulty, friendName })
            }
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="tictactoe-game" options={{ headerShown: false, title: titleFor('tictactoeDetailTitle') }}>
        {({ navigation, route }) => (
          <TicTacToeScreen
            mode={route.params.mode}
            difficulty={route.params.difficulty}
            childName={profile.name}
            friendName={route.params.friendName}
            onMenu={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export function RootNavigator({
  navigationRef,
}: {
  // Optional escape hatch so a test can drive real navigation actions
  // (goBack, getRootState) from outside the component tree — RootNavigator
  // otherwise hardcodes its own NavigationContainer with no way to reach
  // it. Never used by the real app (App.tsx renders <RootNavigator />
  // with no props); purely additive, so this changes nothing for real
  // usage.
  navigationRef?: React.Ref<NavigationContainerRef<RootStackParamList>>;
} = {}) {
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

  // Settings' "Reset everything" flow has already wiped the saved profile
  // (and content folder) by the time this fires — clearing `profile` here
  // is what actually swaps AppStack back out for OnboardingScreen below,
  // exactly like a genuinely first-ever launch.
  const handleReset = useCallback(() => {
    setProfile(null);
  }, []);

  // Initial load only: resolve the profile and hold the splash up for at
  // least MINIMUM_SPLASH_DELAY_MS. Deliberately does NOT lock landscape here
  // — the splash and onboarding flow are portrait-only by design (see the
  // landscape-lock effect below, which only fires once the app is actually
  // about to show the Home/AppStack screen). Later profile refreshes
  // (onboarding complete, settings save) go through `refreshProfile`
  // directly and don't repeat this splash dance.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getProfile(), delay(MINIMUM_SPLASH_DELAY_MS)])
      .then(([loadedProfile]) => {
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

  // Everything up through onboarding (splash, name/age/folder setup) stays
  // portrait — it's a vertical, form-like flow. Only once a profile AND its
  // folders are both resolved does the app actually reveal Home/AppStack,
  // which is the landscape-designed part of the app, so the lock flips here
  // rather than the moment a profile is merely loaded (a returning user with
  // an already-complete profile still needs `folderUris` resolved first).
  const readyForAppStack = Boolean(profile?.rootFolderUri) && folderUris !== null && !folderError;
  useEffect(() => {
    const targetLock = readyForAppStack
      ? ScreenOrientation.OrientationLock.LANDSCAPE
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;
    ScreenOrientation.lockAsync(targetLock).catch((err) => {
      // No user-facing recovery to build for this today, but a silent
      // failure here would leave orientation unconstrained, worth knowing
      // about during development.
      console.warn('Failed to lock orientation', err);
    });
  }, [readyForAppStack]);

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
      <NavigationContainer ref={navigationRef}>
        {profile ? (
          folderError ? (
            <FolderErrorScreen onRetry={retryFolderResolution} />
          ) : folderUris ? (
            <AppStack profile={profile} folderUris={folderUris} onProfileChanged={refreshProfile} onReset={handleReset} />
          ) : null
        ) : (
          <OnboardingScreen onComplete={refreshProfile} />
        )}
      </NavigationContainer>
    </LanguageProvider>
  );
}
