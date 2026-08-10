import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getMusicSettings,
  saveMusicSettings,
  clearMusicSettings,
  persistPickedMusicFile,
} from '../../src/storage/musicSettingsStore';

jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

describe('musicSettingsStore', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('defaults to unmuted with no custom track when nothing has been saved yet', async () => {
    expect(await getMusicSettings()).toEqual({ muted: false, customTrackUri: null });
  });

  it('round-trips saved settings', async () => {
    await saveMusicSettings({ muted: true, customTrackUri: 'file:///docs/kutta-music/1-song.mp3' });
    expect(await getMusicSettings()).toEqual({ muted: true, customTrackUri: 'file:///docs/kutta-music/1-song.mp3' });
  });

  it('falls back to the default if the stored value is malformed JSON', async () => {
    await AsyncStorage.setItem('kutta.musicSettings.v1', 'not-json{');
    expect(await getMusicSettings()).toEqual({ muted: false, customTrackUri: null });
  });

  it('falls back to the default if the stored value is missing required fields', async () => {
    await AsyncStorage.setItem('kutta.musicSettings.v1', JSON.stringify({ muted: true }));
    expect(await getMusicSettings()).toEqual({ muted: false, customTrackUri: null });
  });

  describe('persistPickedMusicFile', () => {
    it('copies the picked file into documentDirectory/kutta-music and returns the new uri', async () => {
      (FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await persistPickedMusicFile('content://picker/song.mp3', 'song.mp3');

      expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith('file:///docs/kutta-music/', {
        intermediates: true,
      });
      expect(result).toMatch(/^file:\/\/\/docs\/kutta-music\/.+song\.mp3$/);
      expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: 'content://picker/song.mp3', to: result });
    });

    it('falls back to the original uri if the copy fails', async () => {
      (FileSystem.copyAsync as jest.Mock).mockRejectedValue(new Error('disk full'));

      const result = await persistPickedMusicFile('content://picker/song.mp3', 'song.mp3');

      expect(result).toBe('content://picker/song.mp3');
    });
  });

  describe('clearMusicSettings', () => {
    it('removes the saved settings and deletes the whole music directory', async () => {
      await saveMusicSettings({ muted: true, customTrackUri: 'file:///docs/kutta-music/1-song.mp3' });

      await clearMusicSettings();

      expect(await getMusicSettings()).toEqual({ muted: false, customTrackUri: null });
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///docs/kutta-music/', { idempotent: true });
    });
  });
});
