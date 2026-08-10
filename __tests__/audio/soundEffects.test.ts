import { createAudioPlayer } from 'expo-audio';
import { playCorrectSound, playWrongSound } from '../../src/audio/soundEffects';
import { duckMusicForSoundEffect, restoreMusicAfterSoundEffect } from '../../src/music/musicPlaybackControl';

jest.mock('../../src/music/musicPlaybackControl', () => ({
  duckMusicForSoundEffect: jest.fn(),
  restoreMusicAfterSoundEffect: jest.fn(),
}));

function makeMockPlayer() {
  let listener: ((status: { didJustFinish: boolean }) => void) | null = null;
  const remove = jest.fn();
  const play = jest.fn();
  const subscriptionRemove = jest.fn();
  const addListener = jest.fn((_event: string, cb: typeof listener) => {
    listener = cb;
    return { remove: subscriptionRemove };
  });
  return {
    player: { play, remove, addListener },
    finish() {
      listener?.({ didJustFinish: true });
    },
    subscriptionRemove,
  };
}

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
}));

describe('soundEffects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('playCorrectSound ducks music, plays the bundled correct sound, and restores music once finished', () => {
    const mock = makeMockPlayer();
    (createAudioPlayer as jest.Mock).mockReturnValue(mock.player);

    playCorrectSound();

    expect(duckMusicForSoundEffect).toHaveBeenCalledTimes(1);
    const [source] = (createAudioPlayer as jest.Mock).mock.calls[0];
    expect(typeof source).toBe('number'); // a require()'d module id
    expect(mock.player.play).toHaveBeenCalledTimes(1);
    expect(restoreMusicAfterSoundEffect).not.toHaveBeenCalled();
    expect(mock.player.remove).not.toHaveBeenCalled();

    mock.finish();

    expect(mock.subscriptionRemove).toHaveBeenCalledTimes(1);
    expect(restoreMusicAfterSoundEffect).toHaveBeenCalledTimes(1);
    expect(mock.player.remove).toHaveBeenCalledTimes(1);
  });

  it('playWrongSound also ducks music, plays, and releases the player once finished', () => {
    const mock = makeMockPlayer();
    (createAudioPlayer as jest.Mock).mockReturnValue(mock.player);

    playWrongSound();

    expect(duckMusicForSoundEffect).toHaveBeenCalledTimes(1);
    expect(mock.player.play).toHaveBeenCalledTimes(1);

    mock.finish();

    expect(restoreMusicAfterSoundEffect).toHaveBeenCalledTimes(1);
    expect(mock.player.remove).toHaveBeenCalledTimes(1);
  });

  it('does not call the finish callback again for a status update that is not yet finished', () => {
    const mock = makeMockPlayer();
    (createAudioPlayer as jest.Mock).mockReturnValue(mock.player);

    playCorrectSound();
    // A status update mid-playback (not yet finished) must not restore/release.
    const listenerArg = (mock.player.addListener as jest.Mock).mock.calls[0][1];
    listenerArg({ didJustFinish: false });

    expect(restoreMusicAfterSoundEffect).not.toHaveBeenCalled();
    expect(mock.player.remove).not.toHaveBeenCalled();
  });

  it('swallows an error from createAudioPlayer instead of throwing, and still restores music', () => {
    (createAudioPlayer as jest.Mock).mockImplementation(() => {
      throw new Error('native player unavailable');
    });

    expect(() => playCorrectSound()).not.toThrow();
    expect(restoreMusicAfterSoundEffect).toHaveBeenCalledTimes(1);
  });
});
