import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import { RootNavigator, type RootStackParamList } from '../../src/navigation/RootNavigator';
import * as profileStore from '../../src/storage/profileStore';
import * as folderAccess from '../../src/storage/folderAccess';
import * as ScreenOrientation from 'expo-screen-orientation';

jest.mock('../../src/storage/profileStore');
jest.mock('../../src/storage/folderAccess');
jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { PORTRAIT_UP: 'PORTRAIT_UP', LANDSCAPE: 'LANDSCAPE' },
  lockAsync: jest.fn().mockResolvedValue(undefined),
}));
// ColoringScreen pulls in @shopify/react-native-skia, which isn't
// transformable under this project's (untouched) jest config — stub it out
// so requiring RootNavigator doesn't drag that native module in for a test
// that only needs the Home/Settings header titles.
jest.mock('../../src/coloring/ColoringScreen', () => ({ ColoringScreen: () => null }));
jest.mock('../../src/coloring/lineArtCache', () => ({ clearLineArtCache: jest.fn() }));
// expo-audio touches real native module internals at import time, same
// reason ColoringScreen/expo-video are stubbed above — this test only needs
// Home/Settings header titles, not real audio playback.
jest.mock('../../src/music/BackgroundMusicPlayer', () => ({ BackgroundMusicPlayer: () => null }));
// QuizScreen (rendered for real in this file) transitively imports
// soundEffects.ts -> expo-audio, the same untransformable-in-Jest issue as
// ColoringScreen/expo-video above.
jest.mock('../../src/audio/soundEffects', () => ({
  playCorrectSound: jest.fn(),
  playWrongSound: jest.fn(),
}));
// expo-video isn't mockable/transformable under this project's jest config
// either (it touches real native prototypes at import time) — stub it out
// for the same reason as ColoringScreen above. VideoGallery now also
// renders a real per-tile video thumbnail (useVideoPlayer + VideoView), so
// it pulls in expo-video too and needs the same treatment.
jest.mock('../../src/video/VideoPlayerScreen', () => ({ VideoPlayerScreen: () => null }));
jest.mock('../../src/video/VideoGallery', () => ({ VideoGallery: () => null }));

const profile = {
  name: 'Sam',
  age: 4,
  language: 'en' as const,
  rootFolderUri: 'content://tree/root',
};

// React Navigation's native-stack header is a native component
// (RNSScreenStackHeaderConfig), not a rendered <Text>, so the header title
// is asserted by walking the rendered JSON tree for a `title` prop rather
// than via findByText/UNSAFE_getByProps (not exposed by render()'s result).
function findAllTitleProps(node: any): string[] {
  if (Array.isArray(node)) {
    return node.flatMap(findAllTitleProps);
  }
  if (!node || typeof node !== 'object') return [];
  const own = node.props && typeof node.props.title === 'string' ? [node.props.title as string] : [];
  return [...own, ...findAllTitleProps(node.children)];
}

// React Navigation always attaches a `title` prop to a screen's native
// header config (falling back to the raw route name, e.g. "Home", when no
// explicit `options.title` is set) — that's true even with
// `headerShown: false`, so title presence alone can't prove a header is
// showing. What `headerShown: false` actually does is set the header
// config's own `hidden` prop, so that's what has to be asserted instead.
function findHeaderConfigNodes(node: any): any[] {
  if (Array.isArray(node)) {
    return node.flatMap(findHeaderConfigNodes);
  }
  if (!node || typeof node !== 'object') return [];
  const own = node.type === 'RNSScreenStackHeaderConfig' ? [node] : [];
  return [...own, ...findHeaderConfigNodes(node.children)];
}

describe('RootNavigator header titles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (profileStore.getProfile as jest.Mock).mockResolvedValue(profile);
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (folderAccess.findChildUri as jest.Mock).mockImplementation(async (_root: string, name: string) => {
      return `content://tree/root/${name}`;
    });
  });

  // The Home screen intentionally has no native-stack header at all (see
  // RootNavigator's `headerShown: false` on that Stack.Screen).
  it('hides the header for the Home screen', async () => {
    const { findByTestId, toJSON } = await render(<RootNavigator />);

    await findByTestId('home-child-name');
    const headerConfigs = findHeaderConfigNodes(toJSON());
    expect(headerConfigs.length).toBeGreaterThan(0);
    expect(headerConfigs.every((config) => config.props.hidden === true)).toBe(true);
  });

  it('sets a translated header title for Settings instead of the raw route name "settings"', async () => {
    const { findByTestId, getAllByText, toJSON } = await render(<RootNavigator />);

    await findByTestId('home-settings-icon');
    await fireEvent.press(getAllByText('⚙️')[0]);

    await waitFor(() => expect(findAllTitleProps(toJSON())).toContain('Settings'));
    expect(findAllTitleProps(toJSON())).not.toContain('settings');
  });

  // Regression: RootNavigator renders a LanguageProvider while the profile is
  // still loading (splash — no saved language known yet, so it passes "en")
  // AND, at the same tree position, once the profile has resolved. React
  // updates that provider in place instead of remounting it, so the "en" the
  // splash render seeded it with used to stick for the whole session: a child
  // with a German profile got the ENTIRE app in English on every launch,
  // recoverable only by a parent re-saving the language in Settings.
  it('renders the app in the profile\'s saved language, not English, for a German profile', async () => {
    (profileStore.getProfile as jest.Mock).mockResolvedValue({ ...profile, language: 'de' });

    const { findByTestId, findByText, queryByText } = await render(<RootNavigator />);

    await findByTestId('home-child-name');
    // "Malen"/"Fotopuzzle" are the German Home card labels; their English
    // counterparts must not be on screen at all.
    await findByText('Malen');
    await findByText('Fotopuzzle');
    expect(queryByText('Coloring')).toBeNull();
    expect(queryByText('Photo Puzzle')).toBeNull();
  });

  // If the SAF grant to the root folder was revoked, or a content subfolder
  // was deleted/renamed outside the app, FolderErrorScreen's Retry button is
  // the only way to recover without leaving the app entirely — it needs an
  // accessible name so a screen-reader user isn't stuck on an unlabeled
  // control.
  it("gives FolderErrorScreen's retry button an accessible name", async () => {
    (folderAccess.ensureContentStructure as jest.Mock).mockRejectedValueOnce(
      new Error('SAF grant revoked')
    );

    const { findByLabelText, findByTestId } = await render(<RootNavigator />);

    await findByTestId('folder-resolve-error');
    await findByLabelText('Retry');
  });

  // Regression test for the premium-polish visual-consistency pass:
  // FolderErrorScreen previously had NO styling at all (a bare `<Text>` and
  // an unstyled `<Pressable>`) — the one error state in the app that never
  // converged on the RaisedCard/RaisedPrimaryButton shape every other error
  // state (VideoPlayerScreen, ColoringGallery, PuzzleGallery, VideoGallery)
  // already uses. This is reachable in real use whenever the SAF grant is
  // revoked or a content folder is deleted/renamed outside the app, so it's
  // not a hypothetical edge case.
  it('gives FolderErrorScreen a real styled background and card, not the old bare unstyled layout', async () => {
    const { StyleSheet } = require('react-native');
    (folderAccess.ensureContentStructure as jest.Mock).mockRejectedValueOnce(
      new Error('SAF grant revoked')
    );

    const { findByTestId } = await render(<RootNavigator />);

    const errorScreen = await findByTestId('folder-resolve-error');
    const flattened = StyleSheet.flatten(errorScreen.props.style);
    // A real background color (not the default undefined/transparent a bare
    // <View> would have) is the simplest, most reliable signal from outside
    // that this screen now goes through the design-system's styling instead
    // of rendering completely bare.
    expect(flattened.backgroundColor).toBeDefined();
  });

  // Regression test for a real bug fix: previously FolderErrorScreen only
  // offered Retry, which re-resolves against the exact same rootFolderUri —
  // a dead end if the SAF grant is PERMANENTLY gone (not a transient
  // failure), since there was no way to reach Settings' own folder picker
  // (Settings is nested inside AppStack, which never mounts while this
  // error screen is showing). "Choose a different folder" must let a parent
  // pick a new root, save it onto the existing profile, and successfully
  // recover all the way to Home.
  it('lets a parent recover from a permanently-revoked SAF grant by choosing a different folder', async () => {
    let currentProfile = { ...profile };
    (profileStore.getProfile as jest.Mock).mockImplementation(async () => currentProfile);
    (profileStore.saveProfile as jest.Mock).mockImplementation(async (p: typeof profile) => {
      currentProfile = p;
    });
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/new-root');
    // First resolution attempt (against the original, now-inaccessible
    // root) fails; a later attempt (against the newly-picked root, after
    // the parent recovers) succeeds — same "revoked, then fixed" shape as
    // Retry's own existing test above, just reached via the new button.
    (folderAccess.ensureContentStructure as jest.Mock)
      .mockRejectedValueOnce(new Error('SAF grant revoked'))
      .mockResolvedValue(undefined);

    const { findByTestId, findByLabelText } = await render(<RootNavigator />);

    await findByTestId('folder-resolve-error');
    await fireEvent.press(await findByLabelText('Choose a different folder'));

    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ rootFolderUri: 'content://tree/new-root' })
      )
    );
    // The parent's other profile fields must survive the folder change
    // untouched — this is a folder swap, not a fresh onboarding.
    expect(profileStore.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sam', age: 4 }));

    await findByTestId('home-child-name');
  });

  it('does nothing (stays on the error screen) if the parent cancels the folder picker', async () => {
    (folderAccess.ensureContentStructure as jest.Mock).mockRejectedValue(new Error('SAF grant revoked'));
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue(null);

    const { findByTestId, findByLabelText } = await render(<RootNavigator />);

    await findByTestId('folder-resolve-error');
    const chooseNewButton = await findByLabelText('Choose a different folder');
    // fireEvent.press only flushes the SYNCHRONOUS portion of the handler —
    // handleChooseNewFolder's first (and here, only) await is
    // requestFolderAccess() itself, so asserting immediately after would
    // race ahead of its resolution and could pass even if a future
    // regression called saveProfile unconditionally. Extra ticks flush that
    // pending microtask first, same technique as this suite's own
    // confirmAlertWith-style Alert-button helpers elsewhere in this repo.
    await act(async () => {
      fireEvent.press(chooseNewButton);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(profileStore.saveProfile).not.toHaveBeenCalled();
    await findByTestId('folder-resolve-error');
  });

  // Regression test for a rapid double-tap: without a synchronous
  // check-and-set guard, two taps landing before the first `setPicking(true)`
  // re-render commits could both pass the `disabled` check and invoke
  // requestFolderAccess()/saveProfile() twice.
  it('guards "Choose a different folder" against a rapid double-tap, only picking once', async () => {
    (folderAccess.ensureContentStructure as jest.Mock).mockRejectedValue(new Error('SAF grant revoked'));
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/new-root');

    const { findByTestId, findByLabelText } = await render(<RootNavigator />);

    await findByTestId('folder-resolve-error');
    const chooseNewButton = await findByLabelText('Choose a different folder');
    // Two presses on the SAME captured element without re-querying — the
    // "stale double-tap" shape this codebase's other double-fire guards
    // (e.g. QuizScreen's Play Again, PuzzleScreen's Retry) are tested with.
    await act(async () => {
      fireEvent.press(chooseNewButton);
      fireEvent.press(chooseNewButton);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(folderAccess.requestFolderAccess).toHaveBeenCalledTimes(1);
  });
});

// The app opens portrait-only (splash, onboarding) and only switches to
// landscape once Home/AppStack is actually about to show — see
// RootNavigator.tsx's `readyForAppStack`-driven lock effect. Getting this
// wrong previously showed as a visible portrait->landscape->portrait->
// landscape flicker across the splash/onboarding boundary on a real device.
describe('Tic-Tac-Toe "Menu" navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (profileStore.getProfile as jest.Mock).mockResolvedValue(profile);
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (folderAccess.findChildUri as jest.Mock).mockImplementation(async (_root: string, name: string) => {
      return `content://tree/root/${name}`;
    });
  });

  // Regression test for a real, reported bug: winning a game, pressing
  // "Menu", then pressing the device's back button re-showed the
  // just-finished game with its old "you won" overlay still up. Root cause
  // (confirmed by reading @react-navigation/routers' StackRouter source):
  // plain `navigation.navigate(name)` only jumps back to an EXISTING route
  // of that name when the CURRENT route already has that name, or when
  // `{ pop: true }`/a matching `getId` is used — none of which applied here
  // (current route was 'tictactoe-game', target was 'tictactoe', and plain
  // `navigate(name)` sets `pop: undefined`) — so it silently PUSHED A
  // SECOND 'tictactoe' screen on top of the stack instead of popping back
  // to the original one. The finished 'tictactoe-game' screen (with its old
  // board/win state) was left sitting one level further back in history,
  // exactly where a single subsequent back-navigation would reveal it.
  // Fixed by using `navigation.goBack()` instead (the same pattern this
  // file already uses for PuzzleScreen's onNext), which unconditionally
  // pops exactly the one screen that was pushed to get here — leaving no
  // extra duplicate for a later back-navigation to fall onto.
  it('cleanly returns to Home on a further back-navigation after Menu — never re-reveals the finished game/win-overlay', async () => {
    const navigationRef = React.createRef<NavigationContainerRef<RootStackParamList>>();
    const { findByTestId, getByTestId, queryByTestId } = await render(
      <RootNavigator navigationRef={navigationRef} />
    );

    await fireEvent.press(await findByTestId('home-card-tictactoe'));
    await fireEvent.press(await findByTestId('tictactoe-opponent-friend'));
    await fireEvent.changeText(getByTestId('tictactoe-friend-name-input'), 'Alex');
    await fireEvent.press(getByTestId('tictactoe-start-game'));

    // Play out a quick X win (top row: cells 0, 1, 2), same move sequence
    // used by TicTacToeScreen.test.tsx's own win test.
    await fireEvent.press(await findByTestId('tictactoe-cell-0')); // X
    await fireEvent.press(getByTestId('tictactoe-cell-3')); // O
    await fireEvent.press(getByTestId('tictactoe-cell-1')); // X
    await fireEvent.press(getByTestId('tictactoe-cell-4')); // O
    await fireEvent.press(getByTestId('tictactoe-cell-2')); // X wins

    await fireEvent.press(await findByTestId('tictactoe-menu'));

    // Back on the setup screen...
    await findByTestId('tictactoe-opponent-computer');

    // ...now simulate the ADDITIONAL back-navigation the user actually
    // performed (a hardware/gesture back press) by driving the real
    // navigation container's own goBack() directly — this is the exact
    // step the earlier version of this test omitted, which is why it could
    // not tell a correct `goBack()` fix apart from the buggy `navigate()`
    // call (both looked identical right after Menu; they only diverge one
    // step further back).
    await act(async () => {
      navigationRef.current?.goBack();
    });

    // Under the fix, this back-navigation goes all the way to Home (the
    // only screen left below the setup screen) — under the old bug, it
    // would have landed back on the finished 'tictactoe-game' screen,
    // showing the win overlay and the old marks again.
    await findByTestId('home-card-tictactoe');
    expect(queryByTestId('tictactoe-complete')).toBeNull();
    expect(queryByTestId('tictactoe-opponent-friend')).toBeNull();
  });
});

describe('RootNavigator content-folder resolution gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (profileStore.getProfile as jest.Mock).mockResolvedValue(profile);
    (folderAccess.findChildUri as jest.Mock).mockImplementation(async (_root: string, name: string) => {
      return `content://tree/root/${name}`;
    });
  });

  // Regression test for a real bug: while the SAF subfolders were being
  // resolved, RootNavigator rendered `null` — a completely blank screen. That
  // window is not instant on a device (ensureContentStructure does a dozen
  // sequential SAF directory reads/creates plus first-run sample seeding), so
  // every cold start showed splash -> BLANK -> Home, which is exactly the
  // flash the minimum splash delay exists to prevent, and a folder change
  // from Settings blanked the whole app the same way.
  it('keeps the splash up (never a blank screen) while the content folders are still resolving', async () => {
    let finishResolution: () => void = () => {};
    (folderAccess.ensureContentStructure as jest.Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishResolution = () => resolve(undefined);
        })
    );

    const { findByTestId, queryByTestId } = await render(<RootNavigator />);

    // The profile itself has resolved by the time the orientation flips to
    // landscape, so this is genuinely the post-splash-load window rather
    // than the initial `profile === undefined` instant.
    await waitFor(() => expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith('LANDSCAPE'));
    expect(queryByTestId('splash-screen')).not.toBeNull();
    expect(queryByTestId('home-child-name')).toBeNull();

    await act(async () => {
      finishResolution();
      await Promise.resolve();
    });

    await findByTestId('home-child-name');
  });

  // A saved profile that parses but carries no content folder at all
  // (`Profile.rootFolderUri` is typed `string | null`) used to satisfy the
  // `profile ?` branch, resolve no folders and never error either — a dead
  // end showing nothing at all, with no way back short of a reinstall.
  it('offers the recoverable folder-error screen for a profile with no content folder, not a dead end', async () => {
    (profileStore.getProfile as jest.Mock).mockResolvedValue({ ...profile, rootFolderUri: null });
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);

    const { findByTestId, findByLabelText } = await render(<RootNavigator />);

    await findByTestId('folder-resolve-error');
    await findByLabelText('Choose a different folder');
    expect(folderAccess.ensureContentStructure).not.toHaveBeenCalled();
  });
});

describe('RootNavigator orientation lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('locks portrait only for the initial splash instant, before the profile has resolved either way', async () => {
    // Never resolve getProfile() during this test — this is the one moment
    // (profile === undefined) the app can't yet tell whether to show
    // onboarding or the app stack, so it's the only time portrait applies.
    (profileStore.getProfile as jest.Mock).mockReturnValue(new Promise(() => {}));

    await render(<RootNavigator />);

    await waitFor(() => expect(ScreenOrientation.lockAsync).toHaveBeenCalled());
    expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith('PORTRAIT_UP');
    expect(ScreenOrientation.lockAsync).not.toHaveBeenCalledWith('LANDSCAPE');
  });

  // Regression test: onboarding used to stay portrait-locked even once it
  // was actually showing (a leftover from an earlier design) — but it's
  // landscape-designed exactly like every other screen (the same RaisedCard
  // row layout Settings uses), so it should lock landscape as soon as we
  // know we're showing it, not wait for the (much later) app-stack-ready
  // moment.
  it('locks landscape once onboarding itself is showing (no profile at all), not just once the app stack is ready', async () => {
    (profileStore.getProfile as jest.Mock).mockResolvedValue(null);

    const { findByTestId } = await render(<RootNavigator />);

    await findByTestId('onboarding-name-input');
    await waitFor(() => expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith('LANDSCAPE'));
  });

  it('locks landscape once the Home/AppStack screen is actually ready to show', async () => {
    (profileStore.getProfile as jest.Mock).mockResolvedValue(profile);
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (folderAccess.findChildUri as jest.Mock).mockImplementation(async (_root: string, name: string) => {
      return `content://tree/root/${name}`;
    });

    const { findByTestId } = await render(<RootNavigator />);

    await findByTestId('home-child-name');
    await waitFor(() => expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith('LANDSCAPE'));
  });
});
