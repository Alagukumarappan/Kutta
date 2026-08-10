import React from 'react';
import { render } from '@testing-library/react-native';
import { useAudioPlayer } from 'expo-audio';
import { BackgroundMusicPlayer } from '../../src/music/BackgroundMusicPlayer';
import { useMusic } from '../../src/music/MusicContext';

jest.mock('../../src/music/MusicContext', () => ({
  useMusic: jest.fn(),
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
});
