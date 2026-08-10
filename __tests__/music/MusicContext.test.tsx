import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { MusicProvider, useMusic } from '../../src/music/MusicContext';
import * as musicSettingsStore from '../../src/storage/musicSettingsStore';

jest.mock('../../src/storage/musicSettingsStore');

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MusicProvider, null, children);
}

describe('MusicContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (musicSettingsStore.getMusicSettings as jest.Mock).mockResolvedValue({
      muted: false,
      customTrackUri: null,
    });
    (musicSettingsStore.saveMusicSettings as jest.Mock).mockResolvedValue(undefined);
    (musicSettingsStore.persistPickedMusicFile as jest.Mock).mockImplementation((uri: string) =>
      Promise.resolve(`file:///docs/kutta-music/copied-${uri}`)
    );
  });

  it('loads the saved settings on mount', async () => {
    (musicSettingsStore.getMusicSettings as jest.Mock).mockResolvedValue({
      muted: true,
      customTrackUri: 'file:///docs/kutta-music/song.mp3',
    });

    const { result } = await renderHook(() => useMusic(), { wrapper });

    await waitFor(() => expect(result.current.muted).toBe(true));
    expect(result.current.customTrackUri).toBe('file:///docs/kutta-music/song.mp3');
  });

  it('toggleMuted flips the mute state and persists it', async () => {
    const { result } = await renderHook(() => useMusic(), { wrapper });
    await waitFor(() => expect(result.current.muted).toBe(false));

    await act(async () => {
      result.current.toggleMuted();
    });

    expect(result.current.muted).toBe(true);
    expect(musicSettingsStore.saveMusicSettings).toHaveBeenCalledWith({
      muted: true,
      customTrackUri: null,
    });

    await act(async () => {
      result.current.toggleMuted();
    });

    expect(result.current.muted).toBe(false);
  });

  it('setCustomTrackUri durably copies the picked file and persists the copied uri', async () => {
    const { result } = await renderHook(() => useMusic(), { wrapper });
    await waitFor(() => expect(result.current.customTrackUri).toBe(null));

    await act(async () => {
      await result.current.setCustomTrackUri('content://picker/song.mp3', 'song.mp3');
    });

    expect(musicSettingsStore.persistPickedMusicFile).toHaveBeenCalledWith('content://picker/song.mp3', 'song.mp3');
    expect(result.current.customTrackUri).toBe('file:///docs/kutta-music/copied-content://picker/song.mp3');
    expect(musicSettingsStore.saveMusicSettings).toHaveBeenCalledWith({
      muted: false,
      customTrackUri: 'file:///docs/kutta-music/copied-content://picker/song.mp3',
    });
  });

  it('useDefaultTrack clears the custom track and persists that', async () => {
    (musicSettingsStore.getMusicSettings as jest.Mock).mockResolvedValue({
      muted: false,
      customTrackUri: 'file:///docs/kutta-music/song.mp3',
    });

    const { result } = await renderHook(() => useMusic(), { wrapper });
    await waitFor(() => expect(result.current.customTrackUri).toBe('file:///docs/kutta-music/song.mp3'));

    await act(async () => {
      result.current.useDefaultTrack();
    });

    expect(result.current.customTrackUri).toBe(null);
    expect(musicSettingsStore.saveMusicSettings).toHaveBeenCalledWith({ muted: false, customTrackUri: null });
  });
});
