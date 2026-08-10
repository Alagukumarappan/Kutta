import {
  registerMusicPlaybackControls,
  duckMusicForSoundEffect,
  restoreMusicAfterSoundEffect,
} from '../../src/music/musicPlaybackControl';

describe('musicPlaybackControl', () => {
  afterEach(() => {
    registerMusicPlaybackControls(null);
  });

  it('calls the registered pause() when ducking', () => {
    const pause = jest.fn();
    const resume = jest.fn();
    registerMusicPlaybackControls({ pause, resume });

    duckMusicForSoundEffect();

    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();
  });

  it('calls the registered resume() when restoring', () => {
    const pause = jest.fn();
    const resume = jest.fn();
    registerMusicPlaybackControls({ pause, resume });

    restoreMusicAfterSoundEffect();

    expect(resume).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });

  it('is a safe no-op when nothing is registered', () => {
    expect(() => duckMusicForSoundEffect()).not.toThrow();
    expect(() => restoreMusicAfterSoundEffect()).not.toThrow();
  });

  it('is a safe no-op after being unregistered with null', () => {
    const pause = jest.fn();
    const resume = jest.fn();
    registerMusicPlaybackControls({ pause, resume });
    registerMusicPlaybackControls(null);

    duckMusicForSoundEffect();
    restoreMusicAfterSoundEffect();

    expect(pause).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });
});
