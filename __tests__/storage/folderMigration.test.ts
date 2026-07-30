import * as FileSystem from 'expo-file-system';
import { migrateContent } from '../../src/storage/folderMigration';

jest.mock('expo-file-system', () => ({
  StorageAccessFramework: {
    readDirectoryAsync: jest.fn(),
    copyAsync: jest.fn(),
    deleteAsync: jest.fn(),
  },
}));

describe('migrateContent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('copies every entry then deletes the old root on success', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(async (uri: string) => {
      if (uri === 'old-root') return ['old-root/pictures', 'old-root/videos'];
      if (uri === 'new-root') return ['new-root/pictures', 'new-root/videos'];
      return ['old-root/pictures/a.png']; // sub-listing used for verification
    });
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockResolvedValue(undefined);

    const result = await migrateContent('old-root', 'new-root');

    expect(result).toEqual({ success: true });
    expect(FileSystem.StorageAccessFramework.copyAsync).toHaveBeenCalled();
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith('old-root');
  });

  it('does NOT delete the old root if a copy fails', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue(['old-root/pictures']);
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockRejectedValue(new Error('disk full'));

    const result = await migrateContent('old-root', 'new-root');

    expect(result.success).toBe(false);
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
  });
});
