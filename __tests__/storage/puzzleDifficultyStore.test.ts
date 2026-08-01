import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPuzzleDifficulty, savePuzzleDifficulty, clearPuzzleDifficulty } from '../../src/storage/puzzleDifficultyStore';

jest.mock('@react-native-async-storage/async-storage');

describe('puzzleDifficultyStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults to 4 when nothing has been saved yet', async () => {
    expect(await getPuzzleDifficulty()).toBe(4);
  });

  it('round-trips a saved difficulty', async () => {
    await savePuzzleDifficulty(9);
    expect(await getPuzzleDifficulty()).toBe(9);
  });

  it('falls back to the default if the stored value is somehow invalid', async () => {
    await AsyncStorage.setItem('kutta.puzzleDifficulty.v1', 'not-a-number');
    expect(await getPuzzleDifficulty()).toBe(4);
  });

  it('falls back to the default if the stored value is a number outside the valid set', async () => {
    await AsyncStorage.setItem('kutta.puzzleDifficulty.v1', '5');
    expect(await getPuzzleDifficulty()).toBe(4);
  });

  // Regression test for a real cross-profile data-leak bug fix: this key
  // isn't scoped to any one profile, so without a way to clear it a fresh
  // profile created after Settings' "Reset everything" would silently
  // inherit the PREVIOUS child's difficulty preference.
  it('clearPuzzleDifficulty resets back to the default', async () => {
    await savePuzzleDifficulty(12);
    expect(await getPuzzleDifficulty()).toBe(12);

    await clearPuzzleDifficulty();

    expect(await getPuzzleDifficulty()).toBe(4);
  });
});
