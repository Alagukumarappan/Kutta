import * as FileSystem from 'expo-file-system/legacy';
import { resolveProfilePictureUri } from '../../src/storage/profilePicture';

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
}));

describe('resolveProfilePictureUri', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null without touching the filesystem when no pictureUri is set', async () => {
    expect(await resolveProfilePictureUri(undefined)).toBeNull();
    expect(await resolveProfilePictureUri(null)).toBeNull();
    expect(await resolveProfilePictureUri('')).toBeNull();
    expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
  });

  it('returns the uri unchanged when the referenced file still exists', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

    const uri = 'file:///data/user/0/com.example/files/avatar.jpg';
    expect(await resolveProfilePictureUri(uri)).toBe(uri);
    expect(FileSystem.getInfoAsync).toHaveBeenCalledWith(uri);
  });

  it('gracefully falls back to null (not the broken uri) when the file no longer exists', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

    expect(await resolveProfilePictureUri('content://tree/deleted-avatar.jpg')).toBeNull();
  });

  it('gracefully falls back to null (never throws) when checking the file rejects, e.g. a revoked SAF grant', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockRejectedValue(new Error('Permission denied'));

    await expect(resolveProfilePictureUri('content://tree/revoked.jpg')).resolves.toBeNull();
  });
});
