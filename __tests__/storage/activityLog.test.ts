import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getActivityLog,
  recordQuizCompleted,
  recordPuzzleCompleted,
  clearActivityLog,
} from '../../src/storage/activityLog';

jest.mock('@react-native-async-storage/async-storage');

describe('activityLog', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('starts at zero for a brand-new profile', async () => {
    expect(await getActivityLog()).toEqual({ quizzesCompleted: 0, puzzlesCompleted: 0 });
  });

  it('increments the quiz counter independently of the puzzle counter', async () => {
    await recordQuizCompleted();
    await recordQuizCompleted();
    await recordPuzzleCompleted();

    expect(await getActivityLog()).toEqual({ quizzesCompleted: 2, puzzlesCompleted: 1 });
  });

  it('persists across a fresh read (not just in-memory)', async () => {
    await recordPuzzleCompleted();
    // A second, independent read must see the same persisted count, not a
    // module-level variable that would reset between app launches.
    expect(await getActivityLog()).toEqual({ quizzesCompleted: 0, puzzlesCompleted: 1 });
  });

  it('clearActivityLog resets both counters back to zero', async () => {
    await recordQuizCompleted();
    await recordPuzzleCompleted();
    await clearActivityLog();

    expect(await getActivityLog()).toEqual({ quizzesCompleted: 0, puzzlesCompleted: 0 });
  });

  it('recovers to zero instead of crashing when the stored value is corrupted', async () => {
    await AsyncStorage.setItem('kutta.activityLog.v1', '{not valid json');

    expect(await getActivityLog()).toEqual({ quizzesCompleted: 0, puzzlesCompleted: 0 });
  });

  it('recovers to zero when the stored value is valid JSON but the wrong shape', async () => {
    await AsyncStorage.setItem('kutta.activityLog.v1', JSON.stringify({ somethingElse: true }));

    expect(await getActivityLog()).toEqual({ quizzesCompleted: 0, puzzlesCompleted: 0 });
  });
});
