import * as FileSystem from 'expo-file-system/legacy';
import { ensureContentStructure, leafNameOf } from '../../src/storage/folderAccess';
import { getSampleQuestionsJson } from '../../src/storage/sampleContent';

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
  // All content now lives one level deeper, inside "Kutta-games" (see
  // folderAccess.ts's KUTTA_GAMES_FOLDER_NAME) — this is the URI every
  // subfolder assertion below is actually made against.
  const gamesUri = `${rootUri}/Kutta-games`;

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

  it('nests all content one level down inside a "Kutta-games" folder rather than directly under the picked root, and returns its URI', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    const returnedUri = await ensureContentStructure(rootUri);

    expect(returnedUri).toBe(gamesUri);
    const gamesFolderCall = (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mock.calls.find(
      (c) => c[1] === 'Kutta-games'
    );
    expect(gamesFolderCall?.[0]).toBe(rootUri);

    // Every one of the 4 known subfolders is created under Kutta-games, not
    // directly under the picked root — otherwise switching folders in
    // Settings could clutter a folder the parent already uses for other
    // things.
    for (const folder of ['pictures', 'videos', 'coloring', 'quiz']) {
      const call = (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mock.calls.find(
        (c) => c[1] === folder
      );
      expect(call?.[0]).toBe(gamesUri);
    }
  });

  it('re-finds the existing "Kutta-games" folder instead of creating a second one', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(async (uri: string) => {
      if (uri === rootUri) return [gamesUri];
      return [];
    });

    await ensureContentStructure(rootUri);

    const madeDirs = (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mock.calls.map(
      (c) => c[1]
    );
    expect(madeDirs).not.toContain('Kutta-games');
  });

  it('does not recreate a subfolder that already exists', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(async (uri: string) => {
      if (uri === rootUri) return [gamesUri];
      if (uri === gamesUri) return [`${gamesUri}/pictures`];
      return [];
    });

    await ensureContentStructure(rootUri);

    const madeDirs = (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mock.calls.map(
      (c) => c[1]
    );
    expect(madeDirs).not.toContain('pictures');
  });

  it('writes the bundled sample questions when quiz/questions.json is missing', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    (FileSystem.StorageAccessFramework.createFileAsync as jest.Mock).mockResolvedValue('content://tree/root/quiz/questions.json');

    await ensureContentStructure(rootUri);

    expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      expect.stringContaining('quiz'),
      'questions.json',
      'application/json'
    );
    // A brand-new quiz folder should not be left with zero questions — see
    // sampleContent.ts's getSampleQuestionsJson(), sourced from
    // /sample-content/quiz/questions.json so a first-time parent's quiz
    // card isn't empty.
    expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledWith(
      expect.any(String),
      getSampleQuestionsJson()
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
    expect(quizMakeDirCall?.[0]).toBe(`${gamesUri}/quiz`);

    expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      `${gamesUri}/quiz`,
      'questions.json',
      'application/json'
    );
  });

  it('does not mistake an unrelated similarly-named folder (e.g. "Old pictures") for the "pictures" subfolder', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(async (uri: string) => {
      if (uri === gamesUri) {
        // A pre-existing, unrelated sibling whose name merely *ends with*
        // "pictures" — must NOT be treated as the "pictures" subfolder, or
        // photo-puzzle content would get written into the user's own files.
        return [`${gamesUri}/Old%20pictures`];
      }
      return [];
    });

    await ensureContentStructure(rootUri);

    const madeDirs = (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mock.calls.map(
      (c) => c[1]
    );
    // "pictures" must still be (re)created as its own real subfolder...
    expect(madeDirs).toContain('pictures');
    const picturesCall = (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mock.calls.find(
      (c) => c[1] === 'pictures'
    );
    // ...directly under the Kutta-games folder, not treated as already satisfied by "Old pictures".
    expect(picturesCall?.[0]).toBe(gamesUri);
  });

  it('does not mistake a differently-named file (e.g. "my-questions.json") for questions.json', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(async (uri: string) => {
      if (uri === `${gamesUri}/quiz`) return [`${gamesUri}/quiz/my-questions.json`];
      return [];
    });
    (FileSystem.StorageAccessFramework.createFileAsync as jest.Mock).mockResolvedValue(
      `${gamesUri}/quiz/questions.json`
    );

    await ensureContentStructure(rootUri);

    // "my-questions.json" ends with "questions.json" but is not an exact
    // match, so the template file must still be created.
    expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      `${gamesUri}/quiz`,
      'questions.json',
      'application/json'
    );
  });
});

// `leafNameOf` itself had no direct test before this — every existing test
// above only exercises it indirectly, through `ensureContentStructure`, and
// only ever with already-percent-encoded URIs that have no trailing slash.
// These directly pin down the documented-but-previously-unverified edge
// cases from the pure-logic module inventory.
describe('leafNameOf', () => {
  it('returns the final segment of an already-decoded (unencoded) URI', () => {
    expect(leafNameOf('content://tree/primary:Root/pictures')).toBe('pictures');
  });

  it('decodes a partially-encoded URI (e.g. a folder name with a percent-encoded space)', () => {
    expect(leafNameOf('content://tree/primary%3ARoot/My%20Folder')).toBe('My Folder');
  });

  it('returns the whole string when there is no slash at all', () => {
    expect(leafNameOf('justaname')).toBe('justaname');
  });

  it('returns an empty string for a URI with a trailing slash (documents current behavior)', () => {
    // decodeURIComponent('.../pictures/') keeps the trailing slash, so
    // lastIndexOf('/') finds that trailing slash rather than the one before
    // "pictures" — the "leaf name" after it is the empty string. Real SAF
    // directory-listing results are not observed to include trailing
    // slashes (confirmed against every mocked entry used elsewhere in this
    // file and in loadQuestions.test.ts), so this does not currently cause
    // an observed bug — but it is a real, previously-undocumented sharp
    // edge in this exact function, worth pinning down explicitly rather
    // than leaving as an unverified assumption.
    expect(leafNameOf('content://tree/primary%3ARoot/pictures/')).toBe('');
  });
});
