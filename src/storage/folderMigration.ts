import * as FileSystem from 'expo-file-system/legacy';

const SUBFOLDERS = ['pictures', 'videos', 'coloring', 'quiz'] as const;

// Kept in sync with folderAccess.ts's own KUTTA_GAMES_FOLDER_NAME rather than
// importing it, matching this file's existing convention of redefining
// SUBFOLDERS locally instead of sharing it.
const KUTTA_GAMES_FOLDER_NAME = 'Kutta-games';

function leafName(uri: string): string {
  const decoded = decodeURIComponent(uri);
  return decoded.substring(decoded.lastIndexOf('/') + 1);
}

// SAF tree URIs are opaque, but they do encode the document path as a
// suffix, so a decoded prefix comparison is enough to detect "the new root
// is the old root, or lives inside it (or vice versa)" without needing to
// walk the tree. Doing an actual copy+delete in that situation would be
// self-referential and could destroy the very data being migrated.
function isSameOrNestedWithin(candidateUri: string, ancestorUri: string): boolean {
  const candidate = decodeURIComponent(candidateUri);
  const ancestor = decodeURIComponent(ancestorUri);
  if (candidate === ancestor) {
    return true;
  }
  if (!candidate.startsWith(ancestor)) {
    return false;
  }
  // If the ancestor itself already ends on a path/volume boundary (e.g.
  // Android's SAF represents "entire internal storage" grants as a document
  // path ending in "primary:" — a volume-root marker, not a folder followed
  // by "/"), then any suffix is nested; no further boundary character is
  // needed. Otherwise the very next character in candidate must itself be a
  // boundary character ("/" or ":"), not just any continuation of the name.
  const ancestorLastChar = ancestor.charAt(ancestor.length - 1);
  if (ancestorLastChar === '/' || ancestorLastChar === ':') {
    return true;
  }
  const boundaryChar = candidate.charAt(ancestor.length);
  return boundaryChar === '/' || boundaryChar === ':';
}

async function findChild(parentUri: string, name: string): Promise<string | null> {
  const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(parentUri);
  return entries.find((entryUri) => leafName(entryUri) === name) ?? null;
}

async function ensureChild(parentUri: string, name: string): Promise<string> {
  const existing = await findChild(parentUri, name);
  if (existing) return existing;
  return FileSystem.StorageAccessFramework.makeDirectoryAsync(parentUri, name);
}

async function listNames(uri: string): Promise<Set<string>> {
  const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);
  return new Set(entries.map(leafName));
}

// Compares the contents of one old/new folder pair by leaf name and returns
// a human-readable error describing the first missing entry, or null if
// everything present in the old folder is also present in the new one.
async function verifyFolderContents(oldUri: string, newUri: string, label: string): Promise<string | null> {
  const oldNames = await listNames(oldUri);
  const newNames = await listNames(newUri);
  for (const name of oldNames) {
    if (!newNames.has(name)) {
      return `Copy verification failed: missing "${name}" in destination "${label}" folder.`;
    }
  }
  return null;
}

export async function migrateContent(
  oldRootUri: string,
  newRootUri: string
): Promise<{ success: true } | { success: false; error: string }> {
  if (isSameOrNestedWithin(newRootUri, oldRootUri) || isSameOrNestedWithin(oldRootUri, newRootUri)) {
    return {
      success: false,
      error: 'The new folder cannot be the same as, or nested inside, the old folder (or vice versa).',
    };
  }

  try {
    // The actual pictures/videos/coloring/quiz content lives one level down,
    // inside "Kutta-games" (see folderAccess.ts's ensureContentStructure) —
    // migrate that folder's contents, not the raw picked-folder's. Falls
    // back to the old root itself for a profile from before this nesting
    // existed, so an in-progress migration on an already-set-up device
    // still finds its content.
    const oldGamesUri = (await findChild(oldRootUri, KUTTA_GAMES_FOLDER_NAME)) ?? oldRootUri;
    const newGamesUri = await ensureChild(newRootUri, KUTTA_GAMES_FOLDER_NAME);

    const topLevelEntries = await FileSystem.StorageAccessFramework.readDirectoryAsync(oldGamesUri);

    for (const entryUri of topLevelEntries) {
      await FileSystem.StorageAccessFramework.copyAsync({ from: entryUri, to: newGamesUri });
    }

    // Deep verification: for each of the 4 known subfolders, confirm every
    // entry that exists on the old side also exists on the new side. This
    // goes one level deeper than a shallow "the 4 folder names exist" check,
    // which would happily pass even if a copy silently truncated a
    // subfolder's contents. For "quiz" we also recurse one level further
    // into "images" and confirm "questions.json" made it across.
    for (const folder of SUBFOLDERS) {
      const oldChild = await findChild(oldGamesUri, folder);
      if (!oldChild) continue; // nothing to verify/migrate for this subfolder

      const newChild = await findChild(newGamesUri, folder);
      if (!newChild) {
        return { success: false, error: `Copy verification failed: missing "${folder}" folder in destination.` };
      }

      const contentsError = await verifyFolderContents(oldChild, newChild, folder);
      if (contentsError) return { success: false, error: contentsError };

      if (folder === 'quiz') {
        const oldImages = await findChild(oldChild, 'images');
        if (oldImages) {
          const newImages = await findChild(newChild, 'images');
          if (!newImages) {
            return { success: false, error: 'Copy verification failed: missing "images" folder inside quiz.' };
          }
          const imagesError = await verifyFolderContents(oldImages, newImages, 'quiz/images');
          if (imagesError) return { success: false, error: imagesError };
        }
      }
    }

    // Verification passed: remove the OLD content, not the old root folder
    // node itself. Deleting the root would also destroy any unrelated
    // content a user might have had there if they picked an existing,
    // non-empty folder (e.g. DCIM) as their content root.
    for (const folder of SUBFOLDERS) {
      const oldChild = await findChild(oldGamesUri, folder);
      if (oldChild) {
        await FileSystem.StorageAccessFramework.deleteAsync(oldChild);
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
