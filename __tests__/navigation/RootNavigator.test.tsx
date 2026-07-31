import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RootNavigator } from '../../src/navigation/RootNavigator';
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
// expo-video isn't mockable/transformable under this project's jest config
// either (it touches real native prototypes at import time) — stub it out
// for the same reason as ColoringScreen above.
jest.mock('../../src/video/VideoPlayerScreen', () => ({ VideoPlayerScreen: () => null }));

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
});

// The app opens portrait-only (splash, onboarding) and only switches to
// landscape once Home/AppStack is actually about to show — see
// RootNavigator.tsx's `readyForAppStack`-driven lock effect. Getting this
// wrong previously showed as a visible portrait->landscape->portrait->
// landscape flicker across the splash/onboarding boundary on a real device.
describe('RootNavigator orientation lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('locks portrait while showing onboarding (no profile yet), never landscape', async () => {
    (profileStore.getProfile as jest.Mock).mockResolvedValue(null);

    await render(<RootNavigator />);

    await waitFor(() => expect(ScreenOrientation.lockAsync).toHaveBeenCalled());
    expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith('PORTRAIT_UP');
    expect(ScreenOrientation.lockAsync).not.toHaveBeenCalledWith('LANDSCAPE');
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
