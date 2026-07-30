import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfile, saveProfile } from '../../src/storage/profileStore';

jest.mock('@react-native-async-storage/async-storage');

describe('profileStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns null when no profile has been saved', async () => {
    expect(await getProfile()).toBeNull();
  });

  it('saves and retrieves a profile', async () => {
    const profile = { name: 'Sam', age: 4, language: 'en' as const, rootFolderUri: 'content://tree/abc' };
    await saveProfile(profile);
    expect(await getProfile()).toEqual(profile);
  });
});
