import { useEffect } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { useMusic } from './MusicContext';
import { registerMusicPlaybackControls } from './musicPlaybackControl';

// The single bundled default track, played whenever the parent hasn't
// picked their own (see MusicContext's customTrackUri). require() must be a
// static string literal for Metro to bundle this as a real app asset.
const DEFAULT_TRACK = require('../../sample-content/music/default-track.mp3');

// No UI of its own -- mounted once as a stable sibling to the Onboarding/
// AppStack switch in RootNavigator, so it survives that swap without
// remounting or restarting the track. Reads MusicContext (the SAME state
// Settings'/Onboarding's Music card reads and writes), so toggling mute or
// switching tracks in either screen takes effect on this one running
// player immediately.
export function BackgroundMusicPlayer() {
  const { muted, customTrackUri } = useMusic();
  const source = customTrackUri ? { uri: customTrackUri } : DEFAULT_TRACK;
  const player = useAudioPlayer(source);

  useEffect(() => {
    player.loop = true;
  }, [player]);

  useEffect(() => {
    if (muted) {
      player.pause();
    } else {
      player.play();
    }
  }, [muted, player]);

  // Lets soundEffects.ts duck this exact running player around a one-shot
  // correct/wrong sound, without soundEffects.ts needing to know anything
  // about expo-audio or which player instance is "the" background music.
  // Re-registered whenever `muted`/`player` change so `resume`'s closure is
  // always current -- resuming must never un-mute a player the parent had
  // deliberately silenced before the sound effect played.
  useEffect(() => {
    registerMusicPlaybackControls({
      pause: () => player.pause(),
      resume: () => {
        if (!muted) player.play();
      },
    });
    return () => {
      registerMusicPlaybackControls(null);
    };
  }, [muted, player]);

  return null;
}
