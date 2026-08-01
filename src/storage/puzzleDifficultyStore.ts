import AsyncStorage from '@react-native-async-storage/async-storage';

export type PuzzleDifficulty = 4 | 6 | 9 | 12;

const DIFFICULTY_KEY = 'kutta.puzzleDifficulty.v1';
const DEFAULT_DIFFICULTY: PuzzleDifficulty = 4;
const VALID_DIFFICULTIES: readonly PuzzleDifficulty[] = [4, 6, 9, 12];

// Remembered across sessions so a parent only ever picks the puzzle
// difficulty once (from the gallery header) rather than being asked again
// every single time a photo is selected — the previous per-photo picker
// screen this replaced.
export async function getPuzzleDifficulty(): Promise<PuzzleDifficulty> {
  const raw = await AsyncStorage.getItem(DIFFICULTY_KEY);
  const parsed = raw !== null ? Number(raw) : NaN;
  return VALID_DIFFICULTIES.includes(parsed as PuzzleDifficulty) ? (parsed as PuzzleDifficulty) : DEFAULT_DIFFICULTY;
}

export async function savePuzzleDifficulty(difficulty: PuzzleDifficulty): Promise<void> {
  await AsyncStorage.setItem(DIFFICULTY_KEY, String(difficulty));
}

// Used by Settings' "Reset everything" flow — without this, a fresh profile
// created after a reset would silently inherit the PREVIOUS child's
// difficulty preference instead of the intended default (this key isn't
// scoped per-profile, since the app only ever has one profile at a time).
export async function clearPuzzleDifficulty(): Promise<void> {
  await AsyncStorage.removeItem(DIFFICULTY_KEY);
}
