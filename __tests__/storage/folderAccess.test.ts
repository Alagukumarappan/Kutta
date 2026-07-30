import * as FileSystem from 'expo-file-system/legacy';
import { ensureContentStructure } from '../../src/storage/folderAccess';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: {
    readDirectoryAsync: jest.fn(),
    // Real makeDirectoryAsync(parentUri, dirName) resolves to the created
    // directory's own URI (not a hardcoded "primary:" path) — mimic that here
    // so the mock actually exercises the fixed ensureSubfolder codepath.
    makeDirectoryAsync: jest.fn(async (parentUri: string, dirName: string) => `${parentUri}/${dirName}`),
    createFileAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
  },
}));

describe('ensureContentStructure', () => {
  const rootUri = 'content://tree/root';

  beforeEach(() => {
    jest.clearAllMocks();
    (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mockImplementation(
      async (parentUri: string, dirName: string) => `${parentUri}/${dirName}`
    );
  });

  it('creates all four subfolders and quiz/images when the directory is empty', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    await ensureContentStructure(rootUri);

    const madeDirs = (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mock.calls.map(
      (c) => c[1]
    );
    expect(madeDirs).toEqual(expect.arrayContaining(['pictures', 'videos', 'coloring', 'quiz']));
  });

  it('does not recreate a subfolder that already exists', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(async (uri: string) => {
      if (uri === rootUri) return [`${rootUri}/pictures`];
      return [];
    });

    await ensureContentStructure(rootUri);

    const madeDirs = (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mock.calls.map(
      (c) => c[1]
    );
    expect(madeDirs).not.toContain('pictures');
  });

  it('writes a template questions.json when quiz/questions.json is missing', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    (FileSystem.StorageAccessFramework.createFileAsync as jest.Mock).mockResolvedValue('content://tree/root/quiz/questions.json');

    await ensureContentStructure(rootUri);

    expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      expect.stringContaining('quiz'),
      'questions.json',
      'application/json'
    );
    expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ questions: [] }, null, 2)
    );
  });

  it('creates quiz/images and questions.json under the real selected root, not a hardcoded device path', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    (FileSystem.StorageAccessFramework.createFileAsync as jest.Mock).mockResolvedValue(
      `${rootUri}/quiz/questions.json`
    );

    await ensureContentStructure(rootUri);

    // The quiz folder's URI must be derived from (i.e. nested under) rootUri —
    // not a hardcoded "primary:quiz" device-root path unrelated to the SAF
    // grant the user actually picked (the bug this regression test guards).
    const quizMakeDirCall = (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mock.calls.find(
      (c) => c[1] === 'images'
    );
    expect(quizMakeDirCall?.[0]).toBe(`${rootUri}/quiz`);

    expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      `${rootUri}/quiz`,
      'questions.json',
      'application/json'
    );
  });
});
