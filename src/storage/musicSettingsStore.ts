import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const SETTINGS_KEY = 'kutta.musicSettings.v1';

export interface MusicSettings {
  muted: boolean;
  // null = use the bundled default track. Otherwise a durable, app-owned
  // copy of a file the parent picked (see persistPickedMusicFile below) —
  // never the original picker-returned uri directly.
  customTrackUri: string | null;
}

const DEFAULT_SETTINGS: MusicSettings = { muted: false, customTrackUri: null };

function isMusicSettings(value: unknown): value is MusicSettings {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as MusicSettings).muted === 'boolean' &&
    (typeof (value as MusicSettings).customTrackUri === 'string' || (value as MusicSettings).customTrackUri === null)
  );
}

export async function getMusicSettings(): Promise<MusicSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    return isMusicSettings(parsed) ? parsed : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveMusicSettings(settings: MusicSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Where a parent's own picked music track is durably kept. DELIBERATELY the
// document directory, not the cache directory the picker itself hands back —
// same reasoning as fileReferenceStore.ts's persistPickedFile: a picked
// track the parent explicitly chose as their child's background music
// should not silently disappear later just because Android reclaimed a
// reclaimable cache directory.
const MUSIC_DIRNAME = 'kutta-music/';

function musicDir(): string | null {
  const base = FileSystem.documentDirectory;
  return base ? `${base}${MUSIC_DIRNAME}` : null;
}

function safeFileName(name: string | undefined): string {
  const cleaned = (name ?? '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned.length > 0 ? cleaned.slice(-64) : 'track';
}

// Copies a freshly-picked audio file into this app's own persistent storage
// and returns the new uri. Best-effort: if anything about the copy fails,
// the ORIGINAL uri is returned unchanged, so the worst case is exactly the
// old (cache-backed, can-vanish-later) behavior rather than a failed pick.
export async function persistPickedMusicFile(uri: string, name?: string): Promise<string> {
  const dir = musicDir();
  if (!dir) return uri;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const destination = `${dir}${Date.now()}-${safeFileName(name)}`;
    await FileSystem.copyAsync({ from: uri, to: destination });
    return destination;
  } catch {
    return uri;
  }
}

// Used by Settings' "Reset everything" flow — without this, a fresh profile
// created after a reset would silently inherit the PREVIOUS child's chosen
// background music (this key isn't scoped per-profile, since the app only
// ever has one profile at a time), and the previous child's copied track
// file would linger in this app's own storage forever.
export async function clearMusicSettings(): Promise<void> {
  await AsyncStorage.removeItem(SETTINGS_KEY);
  const dir = musicDir();
  if (dir) {
    try {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    } catch {
      // ignored — matches clearAllFileReferences/clearLineArtCache's
      // established "best-effort cleanup must not block the reset" convention.
    }
  }
}
