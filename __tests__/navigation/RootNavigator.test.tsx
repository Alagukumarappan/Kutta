import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import * as profileStore from '../../src/storage/profileStore';
import * as folderAccess from '../../src/storage/folderAccess';

jest.mock('../../src/storage/profileStore');
jest.mock('../../src/storage/folderAccess');
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

describe('RootNavigator header titles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (profileStore.getProfile as jest.Mock).mockResolvedValue(profile);
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (folderAccess.findChildUri as jest.Mock).mockImplementation(async (_root: string, name: string) => {
      return `content://tree/root/${name}`;
    });
  });

  // React Navigation's native-stack header is a native component
  // (RNSScreenStackHeaderConfig), not a rendered <Text>, so the header
  // title is asserted via its `title` prop rather than findByText.
  it('sets a translated header title (not the raw route name) for the Home screen', async () => {
    const { findByTestId, toJSON } = await render(<RootNavigator />);

    await findByTestId('home-child-name');
    expect(findAllTitleProps(toJSON())).toContain('Home');
  });

  it('sets a translated header title for Settings instead of the raw route name "settings"', async () => {
    const { findByTestId, getAllByText, toJSON } = await render(<RootNavigator />);

    await findByTestId('home-settings-icon');
    await fireEvent.press(getAllByText('⚙️')[0]);

    await waitFor(() => expect(findAllTitleProps(toJSON())).toContain('Settings'));
    expect(findAllTitleProps(toJSON())).not.toContain('settings');
  });
});
