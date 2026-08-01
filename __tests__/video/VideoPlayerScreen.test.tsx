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
type Listener = (payload?: StatusChangePayload) => void;

interface MockVideoPlayer {
  play: jest.Mock;
  replace: jest.Mock;
  addListener: jest.Mock;
  // Real expo-video players expose this as a synchronous, readable getter —
  // the screen now reads it once up front (see VideoPlayerScreen.tsx's own
  // comment on why) to avoid missing a status that already settled before
  // its effect subscribes. Defaults to 'idle', matching a freshly-created
  // real player that hasn't started loading its source data yet.
  status: 'idle' | 'loading' | 'readyToPlay' | 'error';
  emit(event: 'statusChange', payload: StatusChangePayload): void;
  emit(event: 'playToEnd'): void;
}

jest.mock('expo-video', () => {
  const ReactLib = require('react');
  const RN = require('react-native');
  const listenersByEvent = new Map<string, Set<Listener>>();

  const mockPlayer: MockVideoPlayer = {
    play: jest.fn(),
    replace: jest.fn(),
    status: 'idle',
    addListener: jest.fn((event: string, cb: Listener) => {
      if (!listenersByEvent.has(event)) listenersByEvent.set(event, new Set());
      listenersByEvent.get(event)!.add(cb);
      return { remove: jest.fn(() => listenersByEvent.get(event)?.delete(cb)) };
    }),
    emit: ((event: string, payload?: StatusChangePayload) => {
      // A real player's own `status` getter reflects its most recent
      // statusChange too — kept in sync here so a later test reading
      // `player.status` again (or a second mount reusing this same mock
      // instance) sees the up-to-date value, not a stale 'idle'.
      if (event === 'statusChange' && payload) mockPlayer.status = payload.status;
      listenersByEvent.get(event)?.forEach((cb) => cb(payload));
    }) as MockVideoPlayer['emit'],
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

// The screen now shows a loading spinner until the player reports
// 'readyToPlay' (see the quality-evolution loading-state fix) — every test
// below that expects to see the real video view/celebration has to first
// drive the mock player past that loading gate, the same way a real
// expo-video player would eventually emit this itself.
async function emitReady() {
  await act(async () => {
    __mockPlayer.emit('statusChange', { status: 'readyToPlay' });
  });
}

describe('VideoPlayerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __mockPlayer.status = 'idle';
  });

  it('renders the video view when playback is healthy', async () => {
    const { findByTestId, queryByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoPlayerScreen videoUri={VIDEO_URI} />
      </LanguageProvider>
    );

    await emitReady();

    await findByTestId('video-view');
    expect(queryByTestId('video-player-error')).toBeNull();
  });

  // Regression test for a real bug seen on-device: nativeControls showed
  // (native controls are plain Views), but no actual video frames ever
  // appeared — just the control bar. The player frame around VideoView is a
  // RaisedCard, which clips with overflow:'hidden' for rounded corners and
  // carries an Android elevation shadow; the default 'surfaceView' renderer
  // draws via a separate hardware-compositor layer that doesn't always
  // composite correctly nested under a clipped/elevated parent on real
  // devices. 'textureView' renders through the normal view hierarchy
  // instead, which expo-video's own docs recommend for exactly this
  // "overlapping/clipped video view" scenario.
  it('uses textureView rendering, not the default surfaceView, to avoid disappearing under the clipped/elevated player frame', async () => {
    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoPlayerScreen videoUri={VIDEO_URI} />
      </LanguageProvider>
    );

    await emitReady();

    const videoView = await findByTestId('video-view');
    expect(videoView.props.surfaceType).toBe('textureView');
  });

  // Regression test for a real gap: previously this screen showed NO
  // feedback at all while the video was still loading (only 'error' was
  // ever handled) — a child would just see an empty frame with no signal
  // anything was happening, unlike every other async-load screen in the
  // app (galleries, QuizScreen, ColoringScreen), which all show an explicit
  // spinner.
  it('shows a loading spinner before the player reports it is ready, and hides it once ready', async () => {
    const { findByTestId, queryByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoPlayerScreen videoUri={VIDEO_URI} />
      </LanguageProvider>
    );

    await findByTestId('video-player-loading');
    expect(queryByTestId('video-view')).toBeNull();

    await emitReady();

    await findByTestId('video-view');
    expect(queryByTestId('video-player-loading')).toBeNull();
  });

  // expo-video's 'idle' status (not just 'loading') must also count as
  // still-loading — this app never assumes readiness from anything other
  // than an explicit 'readyToPlay'.
  it('keeps showing the spinner through an "idle" status update, not just "loading"', async () => {
    const { findByTestId, queryByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoPlayerScreen videoUri={VIDEO_URI} />
      </LanguageProvider>
    );

    await act(async () => {
      __mockPlayer.emit('statusChange', { status: 'idle' });
    });

    await findByTestId('video-player-loading');
    expect(queryByTestId('video-view')).toBeNull();
  });

  // Regression test for a race caught during review: a real player is
  // created and told to play synchronously (see useVideoPlayer's setup
  // callback), before VideoPlayerScreen's own effect ever subscribes to
  // statusChange — so its status can already have settled (e.g. a small or
  // cached local file reaching 'readyToPlay' almost immediately) by the
  // time that subscription happens. A status only transitions once, so
  // missing that first change would leave the spinner stuck forever with
  // no later event ever arriving to clear it. Simulated here by setting the
  // mock player's status BEFORE render, with no statusChange event ever
  // emitted at all.
  it('does not get stuck loading forever if the player already settled to readyToPlay before this screen subscribes', async () => {
    __mockPlayer.status = 'readyToPlay';

    const { findByTestId, queryByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoPlayerScreen videoUri={VIDEO_URI} />
      </LanguageProvider>
    );

    await findByTestId('video-view');
    expect(queryByTestId('video-player-loading')).toBeNull();
  });

  it('does not get stuck loading forever if the player already settled to error before this screen subscribes', async () => {
    __mockPlayer.status = 'error';

    const { findByTestId, queryByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoPlayerScreen videoUri={VIDEO_URI} />
      </LanguageProvider>
    );

    await findByTestId('video-player-error');
    expect(queryByTestId('video-player-loading')).toBeNull();
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
    expect(queryByTestId('video-player-error')).toBeNull();

    // Retrying re-enters the loading state (a fresh source load) — the
    // video view only reappears once a subsequent status genuinely reports
    // success, same as a first-ever mount.
    await emitReady();
    await findByTestId('video-view');
    expect(queryByTestId('video-player-error')).toBeNull();
  });

  // Regression test for the premium-polish consistency pass: handleRetry
  // (shared by the error-state Retry button and the celebration's "Watch
  // Again") was the one Retry-style action in the app with no double-fire
  // guard ref, unlike PuzzleScreen's retryFiredRef/QuizScreen's
  // playAgainFiredRef. Not destructive on its own (player.replace/play are
  // idempotent), but inconsistent — this locks in the same one-call-per-tap
  // guarantee every other Retry action already has.
  it('guards Retry against a rapid double-tap, only replacing the video source once', async () => {
    const { findByText, findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <VideoPlayerScreen videoUri={VIDEO_URI} />
      </LanguageProvider>
    );

    await act(async () => {
      __mockPlayer.emit('statusChange', { status: 'error' });
    });
    await findByText('This video could not be played.');

    const retryButton = await findByLabelText('Retry');
    await act(async () => {
      fireEvent.press(retryButton);
      fireEvent.press(retryButton);
    });

    // `replace` is only ever called from inside handleRetry (never from
    // useVideoPlayer's own mount-time setup, unlike `play` — which this
    // mock, being a trivial non-memoized function unlike the real hook,
    // also re-invokes on every re-render, making its raw call count an
    // unreliable signal here), so this is the precise assertion for "did
    // handleRetry's guarded body run more than once".
    expect(__mockPlayer.replace).toHaveBeenCalledTimes(1);
  });

  // Regression tests for the premium-polish child-delight pass: previously
  // this screen gave a child NO feedback at all when a video finished — it
  // just sat on its last frame with native controls, unlike every other
  // activity (Quiz/Puzzle/Tic-Tac-Toe), which all celebrate completion via
  // the shared CelebrationOverlay.
  describe('completion celebration', () => {
    it('shows a celebration with a "Watch Again" action once the video reaches its end', async () => {
      const { findByTestId, findByText, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <VideoPlayerScreen videoUri={VIDEO_URI} />
        </LanguageProvider>
      );

      await emitReady();
      await findByTestId('video-view');
      expect(queryByTestId('video-finished')).toBeNull();

      await act(async () => {
        __mockPlayer.emit('playToEnd');
      });

      await findByTestId('video-finished');
      expect(await findByText('Nice watching! 🎬')).toBeTruthy();
      await findByText('Watch Again');
    });

    it('"Watch Again" replays the same video and dismisses the celebration', async () => {
      const { findByTestId, findByLabelText, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <VideoPlayerScreen videoUri={VIDEO_URI} />
        </LanguageProvider>
      );

      await emitReady();
      await act(async () => {
        __mockPlayer.emit('playToEnd');
      });
      await findByTestId('video-finished');

      await fireEvent.press(await findByLabelText('Watch Again'));

      expect(__mockPlayer.replace).toHaveBeenCalledWith(VIDEO_URI);
      expect(__mockPlayer.play).toHaveBeenCalled();
      expect(queryByTestId('video-finished')).toBeNull();
    });
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
