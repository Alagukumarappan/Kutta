import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { VideoPlayerScreen } from '../../src/video/VideoPlayerScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';

// expo-video "isn't mockable/transformable under this project's (untouched)
// jest config" per __tests__/navigation/RootNavigator.test.tsx's own comment
// (it touches real native prototypes at import time) — RootNavigator's test
// works around that by stubbing the whole screen out. Here, since this file
// exists specifically to exercise VideoPlayerScreen's own load/error/retry
// logic, the boundary is mocked one level lower instead: fake just the two
// things the screen touches (`useVideoPlayer`, `VideoView`), with a
// controllable in-memory player that can emit a real `statusChange` event —
// this exercises the screen's actual effect/listener/retry code, it doesn't
// fake the behavior under test.
type StatusChangePayload = { status: 'idle' | 'loading' | 'readyToPlay' | 'error' };
type Listener = (payload: StatusChangePayload) => void;

interface MockVideoPlayer {
  play: jest.Mock;
  replace: jest.Mock;
  addListener: jest.Mock;
  emit: (event: 'statusChange', payload: StatusChangePayload) => void;
}

jest.mock('expo-video', () => {
  const ReactLib = require('react');
  const RN = require('react-native');
  const listenersByEvent = new Map<string, Set<(payload: StatusChangePayload) => void>>();

  const mockPlayer: MockVideoPlayer = {
    play: jest.fn(),
    replace: jest.fn(),
    addListener: jest.fn((event: string, cb: Listener) => {
      if (!listenersByEvent.has(event)) listenersByEvent.set(event, new Set());
      listenersByEvent.get(event)!.add(cb);
      return { remove: jest.fn(() => listenersByEvent.get(event)?.delete(cb)) };
    }),
    emit: (event, payload) => {
      listenersByEvent.get(event)?.forEach((cb) => cb(payload));
    },
  };

  return {
    useVideoPlayer: jest.fn((_source: string, setup?: (player: MockVideoPlayer) => void) => {
      setup?.(mockPlayer);
      return mockPlayer;
    }),
    VideoView: (props: Record<string, unknown>) => ReactLib.createElement(RN.View, { testID: 'video-view', ...props }),
    __mockPlayer: mockPlayer,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __mockPlayer } = require('expo-video') as { __mockPlayer: MockVideoPlayer };

const VIDEO_URI = 'content://tree/videos/party.mp4';

describe('VideoPlayerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the video view when playback is healthy', async () => {
    const { findByTestId, queryByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoPlayerScreen videoUri={VIDEO_URI} />
      </LanguageProvider>
    );

    await findByTestId('video-view');
    expect(queryByTestId('video-player-error')).toBeNull();
  });

  it('shows a friendly localized message (never a raw technical error) when the player reports a status error', async () => {
    const { findByText, findByTestId, queryByText } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoPlayerScreen videoUri={VIDEO_URI} />
      </LanguageProvider>
    );

    await act(async () => {
      __mockPlayer.emit('statusChange', { status: 'error' });
    });

    await findByText('This video could not be played.');
    await findByTestId('video-player-error');
    expect(queryByText(/Exception|ENOENT|undefined/)).toBeNull();
  });

  it('offers a retry action that recovers from a transient playback failure, matching the retry pattern used elsewhere for the same failure category', async () => {
    const { findByText, findByTestId, findByLabelText, queryByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoPlayerScreen videoUri={VIDEO_URI} />
      </LanguageProvider>
    );

    await act(async () => {
      __mockPlayer.emit('statusChange', { status: 'error' });
    });
    await findByText('This video could not be played.');

    await fireEvent.press(await findByLabelText('Retry'));

    // Retrying should attempt to reload the same source and resume playback
    // rather than leaving the child on a permanent dead end.
    expect(__mockPlayer.replace).toHaveBeenCalledWith(VIDEO_URI);
    expect(__mockPlayer.play).toHaveBeenCalled();
    await findByTestId('video-view');
    expect(queryByTestId('video-player-error')).toBeNull();

    // A subsequent successful status should not leave stale error UI behind.
    await act(async () => {
      __mockPlayer.emit('statusChange', { status: 'readyToPlay' });
    });
    expect(queryByTestId('video-player-error')).toBeNull();
  });

  it('does not update state (and does not warn) when a status event arrives after the screen has been unmounted', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoPlayerScreen videoUri={VIDEO_URI} />
      </LanguageProvider>
    );

    unmount();
    await act(async () => {
      __mockPlayer.emit('statusChange', { status: 'error' });
    });
    await Promise.resolve();

    const unmountedWarnings = consoleError.mock.calls.filter((call) =>
      String(call[0]).includes('unmounted component')
    );
    expect(unmountedWarnings).toHaveLength(0);
    consoleError.mockRestore();
  });
});
