// A tiny, deliberately non-React module-level registry — NOT part of
// MusicContext — so `soundEffects.ts` (a plain function, fired imperatively
// from event handlers) never needs to know anything about React context or
// the `expo-audio` player BackgroundMusicPlayer owns. BackgroundMusicPlayer
// registers real pause/resume callbacks here on mount and clears them on
// unmount; a sound effect calls duckMusicForSoundEffect() before it plays
// and restoreMusicAfterSoundEffect() once it finishes.
export interface MusicPlaybackControls {
  pause(): void;
  resume(): void;
}

let controls: MusicPlaybackControls | null = null;

export function registerMusicPlaybackControls(next: MusicPlaybackControls | null): void {
  controls = next;
}

// Safe no-op if nothing is registered yet (e.g. a sound effect fires before
// BackgroundMusicPlayer has mounted, or after it has unmounted) -- a sound
// effect must never fail just because there's no music currently playing.
export function duckMusicForSoundEffect(): void {
  controls?.pause();
}

export function restoreMusicAfterSoundEffect(): void {
  controls?.resume();
}
