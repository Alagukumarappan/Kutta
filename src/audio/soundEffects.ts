import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { duckMusicForSoundEffect, restoreMusicAfterSoundEffect } from '../music/musicPlaybackControl';

// require() must be a static string literal for Metro to bundle these as
// real app assets (same convention as sampleContent.ts/BackgroundMusicPlayer).
const CORRECT_SOUND = require('../../sample-content/sfx/correct.mp3');
const WRONG_SOUND = require('../../sample-content/sfx/wrong.mp3');

// One-shot playback: ducks the background music, plays the clip, then
// restores the music once the clip has genuinely finished (not just
// "started") -- and releases the ad-hoc native player either way. Wrapped
// end-to-end in try/catch: a sound effect is a pure enhancement, and must
// never throw into the caller (a quiz-answer handler, a puzzle solve check,
// a game-over effect) if playback fails for any reason.
function playOneShot(source: number): void {
  try {
    duckMusicForSoundEffect();
    const player: AudioPlayer = createAudioPlayer(source);
    const subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (!status.didJustFinish) return;
      subscription.remove();
      restoreMusicAfterSoundEffect();
      player.remove();
    });
    player.play();
  } catch {
    // Best-effort -- see the function doc comment above.
    restoreMusicAfterSoundEffect();
  }
}

export function playCorrectSound(): void {
  playOneShot(CORRECT_SOUND);
}

export function playWrongSound(): void {
  playOneShot(WRONG_SOUND);
}
