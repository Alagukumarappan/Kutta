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

  it('saves and retrieves the optional pictureUri field, and omits it entirely when unset', async () => {
    const withPicture = {
      name: 'Sam',
      age: 4,
      language: 'en' as const,
      rootFolderUri: 'content://tree/abc',
      pictureUri: 'file:///data/user/0/com.example/files/avatar.jpg',
    };
    await saveProfile(withPicture);
    expect(await getProfile()).toEqual(withPicture);

    // A profile saved without ever setting a picture (the existing/default
    // case for every profile created before this field existed, and for a
    // new profile until a future picker is added) must round-trip with no
    // pictureUri at all — not `undefined` serialized as a literal, and not
    // a crash — since this field is optional, not required.
    const withoutPicture = { name: 'Alex', age: 6, language: 'de' as const, rootFolderUri: null };
    await saveProfile(withoutPicture);
    const loaded = await getProfile();
    expect(loaded).toEqual(withoutPicture);
    expect(loaded && 'pictureUri' in loaded).toBe(false);
  });
});
