import * as FileSystem from 'expo-file-system/legacy';
import { migrateContent } from '../../src/storage/folderMigration';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: {
    readDirectoryAsync: jest.fn(),
    copyAsync: jest.fn(),
    deleteAsync: jest.fn(),
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

function fullTree(newPictures = ['p1.png', 'p2.png']) {
  return {
    [OLD]: ['pictures', 'videos', 'coloring', 'quiz'],
    [NEW]: ['pictures', 'videos', 'coloring', 'quiz'],
    [`${OLD}/pictures`]: ['p1.png', 'p2.png'],
    [`${NEW}/pictures`]: newPictures,
    [`${OLD}/videos`]: ['v1.mp4'],
    [`${NEW}/videos`]: ['v1.mp4'],
    [`${OLD}/coloring`]: ['c1.png'],
    [`${NEW}/coloring`]: ['c1.png'],
    [`${OLD}/quiz`]: ['questions.json', 'images'],
    [`${NEW}/quiz`]: ['questions.json', 'images'],
    [`${OLD}/quiz/images`]: ['cat.png', 'dog.png'],
    [`${NEW}/quiz/images`]: ['cat.png', 'dog.png'],
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

    // The root itself must never be deleted — only its known subfolders.
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalledWith(OLD);
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(`${OLD}/pictures`);
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(`${OLD}/videos`);
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(`${OLD}/coloring`);
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(`${OLD}/quiz`);
  });

  it('does NOT delete anything if a copy fails', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(buildFsMock(fullTree()));
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockRejectedValue(new Error('disk full'));

    const result = await migrateContent(OLD, NEW);

    expect(result.success).toBe(false);
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
  });

  it('catches a partial copy inside a subfolder that a shallow top-level-name check would have missed', async () => {
    // Top level: "pictures" exists in both old and new roots (a shallow check
    // would pass) — but only one of the two files inside actually made it.
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
    tree[`${NEW}/quiz/images`] = ['cat.png']; // dog.png missing at destination
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
    tree[`${NEW}/quiz`] = ['images']; // questions.json missing at destination
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
    const tree = {
      [oldRoot]: ['pictures', 'videos', 'coloring', 'quiz'],
      [newRoot]: ['pictures', 'videos', 'coloring', 'quiz'],
      [`${oldRoot}/pictures`]: ['p1.png'],
      [`${newRoot}/pictures`]: ['p1.png'],
      [`${oldRoot}/videos`]: [],
      [`${newRoot}/videos`]: [],
      [`${oldRoot}/coloring`]: [],
      [`${newRoot}/coloring`]: [],
      [`${oldRoot}/quiz`]: ['questions.json', 'images'],
      [`${newRoot}/quiz`]: ['questions.json', 'images'],
      [`${oldRoot}/quiz/images`]: [],
      [`${newRoot}/quiz/images`]: [],
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
