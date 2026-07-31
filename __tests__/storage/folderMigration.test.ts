import * as FileSystem from 'expo-file-system/legacy';
import { migrateContent } from '../../src/storage/folderMigration';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: {
    readDirectoryAsync: jest.fn(),
    copyAsync: jest.fn(),
    deleteAsync: jest.fn(),
    makeDirectoryAsync: jest.fn(async (parentUri: string, dirName: string) => `${parentUri}/${dirName}`),
  },
}));

// A small fake SAF filesystem keyed by parent URI -> child leaf names, so the
// deep verification logic (which recurses into each subfolder, and one level
// further into quiz/images) can be exercised realistically.
function buildFsMock(tree: Record<string, string[]>) {
  return async (uri: string): Promise<string[]> => {
    const names = tree[uri] ?? [];
    return names.map((name) => `${uri}/${name}`);
  };
}

const OLD = 'old-root';
const NEW = 'new-root';
// All real content lives one level down inside "Kutta-games" (see
// folderAccess.ts's KUTTA_GAMES_FOLDER_NAME) — migrateContent copies/verifies
// at that level, not directly under the picked root.
const OLD_GAMES = `${OLD}/Kutta-games`;
const NEW_GAMES = `${NEW}/Kutta-games`;

function fullTree(newPictures = ['p1.png', 'p2.png']) {
  return {
    [OLD]: ['Kutta-games'],
    [NEW]: ['Kutta-games'],
    [OLD_GAMES]: ['pictures', 'videos', 'coloring', 'quiz'],
    [NEW_GAMES]: ['pictures', 'videos', 'coloring', 'quiz'],
    [`${OLD_GAMES}/pictures`]: ['p1.png', 'p2.png'],
    [`${NEW_GAMES}/pictures`]: newPictures,
    [`${OLD_GAMES}/videos`]: ['v1.mp4'],
    [`${NEW_GAMES}/videos`]: ['v1.mp4'],
    [`${OLD_GAMES}/coloring`]: ['c1.png'],
    [`${NEW_GAMES}/coloring`]: ['c1.png'],
    [`${OLD_GAMES}/quiz`]: ['questions.json', 'images'],
    [`${NEW_GAMES}/quiz`]: ['questions.json', 'images'],
    [`${OLD_GAMES}/quiz/images`]: ['cat.png', 'dog.png'],
    [`${NEW_GAMES}/quiz/images`]: ['cat.png', 'dog.png'],
  };
}

describe('migrateContent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('copies every subfolder, verifies deep contents, and deletes only the old subfolders (not the root)', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(buildFsMock(fullTree()));
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockResolvedValue(undefined);

    const result = await migrateContent(OLD, NEW);

    expect(result).toEqual({ success: true });
    expect(FileSystem.StorageAccessFramework.copyAsync).toHaveBeenCalled();

    // Neither the picked root nor the Kutta-games folder itself is ever
    // deleted — only the known subfolders inside Kutta-games.
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalledWith(OLD);
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalledWith(OLD_GAMES);
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(`${OLD_GAMES}/pictures`);
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(`${OLD_GAMES}/videos`);
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(`${OLD_GAMES}/coloring`);
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(`${OLD_GAMES}/quiz`);
  });

  it('creates the new "Kutta-games" folder under the newly-picked root when it does not exist yet', async () => {
    const tree = fullTree();
    // The freshly-picked new root has nothing in it yet — no Kutta-games,
    // so migrateContent must create it itself rather than assuming
    // onboarding/ensureContentStructure already ran there.
    delete (tree as Record<string, string[]>)[NEW];
    (tree as Record<string, string[]>)[NEW] = [];
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(buildFsMock(tree));
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockResolvedValue(undefined);

    const result = await migrateContent(OLD, NEW);

    expect(result).toEqual({ success: true });
    expect(FileSystem.StorageAccessFramework.makeDirectoryAsync).toHaveBeenCalledWith(NEW, 'Kutta-games');
  });

  it('falls back to migrating directly from the old root when it has no "Kutta-games" folder yet (pre-existing profile)', async () => {
    // A profile set up before the Kutta-games nesting existed: content sits
    // directly under OLD, with no Kutta-games folder there at all.
    const tree: Record<string, string[]> = {
      [OLD]: ['pictures', 'videos', 'coloring', 'quiz'],
      [NEW]: [],
      [NEW_GAMES]: ['pictures', 'videos', 'coloring', 'quiz'],
      [`${OLD}/pictures`]: ['p1.png'],
      [`${NEW_GAMES}/pictures`]: ['p1.png'],
      [`${OLD}/videos`]: [],
      [`${NEW_GAMES}/videos`]: [],
      [`${OLD}/coloring`]: [],
      [`${NEW_GAMES}/coloring`]: [],
      [`${OLD}/quiz`]: ['questions.json', 'images'],
      [`${NEW_GAMES}/quiz`]: ['questions.json', 'images'],
      [`${OLD}/quiz/images`]: [],
      [`${NEW_GAMES}/quiz/images`]: [],
    };
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(buildFsMock(tree));
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockResolvedValue(undefined);

    const result = await migrateContent(OLD, NEW);

    expect(result).toEqual({ success: true });
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(`${OLD}/pictures`);
  });

  it('does NOT delete anything if a copy fails', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(buildFsMock(fullTree()));
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockRejectedValue(new Error('disk full'));

    const result = await migrateContent(OLD, NEW);

    expect(result.success).toBe(false);
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
  });

  it('catches a partial copy inside a subfolder that a shallow top-level-name check would have missed', async () => {
    // Top level: "pictures" exists in both old and new Kutta-games folders (a
    // shallow check would pass) — but only one of the two files inside
    // actually made it.
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(
      buildFsMock(fullTree(['p1.png']))
    );
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockResolvedValue(undefined);

    const result = await migrateContent(OLD, NEW);

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected migration to fail');
    expect(result.error).toContain('p2.png');
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
  });

  it('catches a partial copy one level inside quiz/images', async () => {
    const tree = fullTree();
    tree[`${NEW_GAMES}/quiz/images`] = ['cat.png']; // dog.png missing at destination
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(buildFsMock(tree));
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockResolvedValue(undefined);

    const result = await migrateContent(OLD, NEW);

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected migration to fail');
    expect(result.error).toContain('dog.png');
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
  });

  it('catches a missing questions.json at the destination', async () => {
    const tree = fullTree();
    tree[`${NEW_GAMES}/quiz`] = ['images']; // questions.json missing at destination
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(buildFsMock(tree));
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockResolvedValue(undefined);

    const result = await migrateContent(OLD, NEW);

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected migration to fail');
    expect(result.error).toContain('questions.json');
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
  });

  it('refuses to migrate when the new root is nested inside the old root', async () => {
    const result = await migrateContent('content://tree/document/primary%3ARoot', 'content://tree/document/primary%3ARoot%2FSub');

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected migration to fail');
    expect(result.error).toMatch(/nested|inside/i);
    expect(FileSystem.StorageAccessFramework.copyAsync).not.toHaveBeenCalled();
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
  });

  it('refuses to migrate when the old root is nested inside the new root', async () => {
    const result = await migrateContent('content://tree/document/primary%3ARoot%2FSub', 'content://tree/document/primary%3ARoot');

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected migration to fail');
    expect(result.error).toMatch(/nested|inside/i);
    expect(FileSystem.StorageAccessFramework.copyAsync).not.toHaveBeenCalled();
  });

  it('refuses to migrate when the old root is a whole-storage grant ("primary:") and the new root is a subfolder inside it', async () => {
    // Android's SAF represents "user granted access to their entire internal
    // storage" as a tree URI whose decoded document path ends in "primary:"
    // (a volume-root marker, not a folder followed by "/"). A `/`-only
    // boundary check would fail to see "primary:Kutta" as nested inside
    // "primary:", letting a self-referential copy+delete slip through.
    const result = await migrateContent(
      'content://tree/document/primary%3A',
      'content://tree/document/primary%3AKutta'
    );

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected migration to fail');
    expect(result.error).toMatch(/nested|inside/i);
    expect(FileSystem.StorageAccessFramework.copyAsync).not.toHaveBeenCalled();
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
  });

  it('does NOT treat a sibling folder whose name is a prefix of another as nested (e.g. "Kutta" vs "KuttaBackup")', async () => {
    // Regression test for the boundary-char fix documented above
    // isSameOrNestedWithin: a naive `candidate.startsWith(ancestor)` check
    // (with no boundary-character follow-up) would wrongly treat
    // "primary:KuttaBackup" as nested inside "primary:Kutta" purely because
    // one string happens to be a textual prefix of the other, even though
    // they're unrelated sibling folders on disk. The boundary check (next
    // char must be "/" or ":") must reject that false match and let the
    // migration proceed normally.
    const oldRoot = 'content://tree/document/primary%3AKutta';
    const newRoot = 'content://tree/document/primary%3AKuttaBackup';
    const oldGames = `${oldRoot}/Kutta-games`;
    const newGames = `${newRoot}/Kutta-games`;
    const tree = {
      [oldRoot]: ['Kutta-games'],
      [newRoot]: ['Kutta-games'],
      [oldGames]: ['pictures', 'videos', 'coloring', 'quiz'],
      [newGames]: ['pictures', 'videos', 'coloring', 'quiz'],
      [`${oldGames}/pictures`]: ['p1.png'],
      [`${newGames}/pictures`]: ['p1.png'],
      [`${oldGames}/videos`]: [],
      [`${newGames}/videos`]: [],
      [`${oldGames}/coloring`]: [],
      [`${newGames}/coloring`]: [],
      [`${oldGames}/quiz`]: ['questions.json', 'images'],
      [`${newGames}/quiz`]: ['questions.json', 'images'],
      [`${oldGames}/quiz/images`]: [],
      [`${newGames}/quiz/images`]: [],
    };
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(buildFsMock(tree));
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockResolvedValue(undefined);

    const result = await migrateContent(oldRoot, newRoot);

    expect(result).toEqual({ success: true });
    expect(FileSystem.StorageAccessFramework.copyAsync).toHaveBeenCalled();
  });

  it('refuses to migrate when old and new roots are the same folder', async () => {
    const result = await migrateContent('same-root', 'same-root');

    expect(result.success).toBe(false);
    expect(FileSystem.StorageAccessFramework.copyAsync).not.toHaveBeenCalled();
  });
});
