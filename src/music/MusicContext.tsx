import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getMusicSettings,
  saveMusicSettings,
  persistPickedMusicFile,
  type MusicSettings,
} from '../storage/musicSettingsStore';

interface MusicContextValue {
  muted: boolean;
  customTrackUri: string | null;
  toggleMuted: () => void;
  setCustomTrackUri: (uri: string, name?: string) => Promise<void>;
  useDefaultTrack: () => void;
}

const MusicContext = createContext<MusicContextValue | undefined>(undefined);

// Modeled directly on LanguageContext: a single top-level provider, mounted
// once, that both drives real global app behavior (BackgroundMusicPlayer
// reads this same context to control the one running track) and is the
// thing Settings'/Onboarding's Music card reads and writes — so toggling
// mute or switching tracks in either screen takes effect immediately,
// everywhere, through the one shared state.
export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<MusicSettings>({ muted: false, customTrackUri: null });

  useEffect(() => {
    let cancelled = false;
    getMusicSettings().then((loaded) => {
      if (!cancelled) setSettings(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<MusicContextValue>(
    () => ({
      muted: settings.muted,
      customTrackUri: settings.customTrackUri,
      toggleMuted: () => {
        const next = { ...settings, muted: !settings.muted };
        setSettings(next);
        saveMusicSettings(next).catch(() => {
          // Best-effort persistence -- the in-memory toggle (and therefore
          // playback) still takes effect immediately either way; only the
          // NEXT cold start could revert to the previous saved value.
        });
      },
      setCustomTrackUri: async (uri: string, name?: string) => {
        const persisted = await persistPickedMusicFile(uri, name);
        const next = { ...settings, customTrackUri: persisted };
        setSettings(next);
        await saveMusicSettings(next);
      },
      useDefaultTrack: () => {
        const next = { ...settings, customTrackUri: null };
        setSettings(next);
        saveMusicSettings(next).catch(() => {
          // Best-effort -- see toggleMuted above.
        });
      },
    }),
    [settings]
  );

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic(): MusicContextValue {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error('useMusic must be used within a MusicProvider');
  return ctx;
}
