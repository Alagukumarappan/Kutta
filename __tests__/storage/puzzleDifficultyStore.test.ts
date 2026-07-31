import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPuzzleDifficulty, savePuzzleDifficulty } from '../../src/storage/puzzleDifficultyStore';

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
});
