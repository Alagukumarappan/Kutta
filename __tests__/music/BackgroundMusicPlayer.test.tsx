import React from 'react';
import { render, act } from '@testing-library/react-native';
import { useAudioPlayer } from 'expo-audio';
import { BackgroundMusicPlayer } from '../../src/music/BackgroundMusicPlayer';
import { useMusic } from '../../src/music/MusicContext';
import { registerMusicPlaybackControls } from '../../src/music/musicPlaybackControl';

jest.mock('../../src/music/MusicContext', () => ({
  useMusic: jest.fn(),
}));

jest.mock('../../src/music/musicPlaybackControl', () => ({
  registerMusicPlaybackControls: jest.fn(),
}));

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  loop: false,
};

jest.mock('expo-audio', () => ({
  useAudioPlayer: jest.fn(() => mockPlayer),
}));

describe('BackgroundMusicPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayer.loop = false;
  });

  it('plays the bundled default track when no custom track is set', async () => {
    (useMusic as jest.Mock).mockReturnValue({ muted: false, customTrackUri: null });

    await render(<BackgroundMusicPlayer />);

    const [source] = (useAudioPlayer as jest.Mock).mock.calls[0];
    expect(typeof source).toBe('number'); // a require()'d module id, not a uri object
    expect(mockPlayer.loop).toBe(true);
    expect(mockPlayer.play).toHaveBeenCalled();
    expect(mockPlayer.pause).not.toHaveBeenCalled();
  });

  it('plays the custom track uri when one is set', async () => {
    (useMusic as jest.Mock).mockReturnValue({
      muted: false,
      customTrackUri: 'file:///docs/kutta-music/song.mp3',
    });

    await render(<BackgroundMusicPlayer />);

    const [source] = (useAudioPlayer as jest.Mock).mock.calls[0];
    expect(source).toEqual({ uri: 'file:///docs/kutta-music/song.mp3' });
  });

  it('pauses (not just skips playing) when muted', async () => {
    (useMusic as jest.Mock).mockReturnValue({ muted: true, customTrackUri: null });

    await render(<BackgroundMusicPlayer />);

    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  describe('playback controls registration (for sound-effect ducking)', () => {
    it('registers pause/resume controls on mount and unregisters (null) on unmount', async () => {
      (useMusic as jest.Mock).mockReturnValue({ muted: false, customTrackUri: null });

      const { unmount } = await render(<BackgroundMusicPlayer />);

      expect(registerMusicPlaybackControls).toHaveBeenCalledWith({
        pause: expect.any(Function),
        resume: expect.any(Function),
      });
      const registered = (registerMusicPlaybackControls as jest.Mock).mock.calls[0][0];
      registered.pause();
      expect(mockPlayer.pause).toHaveBeenCalled();
      registered.resume();
      expect(mockPlayer.play).toHaveBeenCalled();

      await act(async () => {
        unmount();
      });
      expect(registerMusicPlaybackControls).toHaveBeenLastCalledWith(null);
    });

    it("registered resume() does nothing while muted, so a sound effect can't un-mute the music", async () => {
      (useMusic as jest.Mock).mockReturnValue({ muted: true, customTrackUri: null });

      await render(<BackgroundMusicPlayer />);

      const registered = (registerMusicPlaybackControls as jest.Mock).mock.calls[0][0];
      mockPlayer.play.mockClear();
      registered.resume();

      expect(mockPlayer.play).not.toHaveBeenCalled();
    });
  });
});
