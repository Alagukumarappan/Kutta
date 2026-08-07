import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// Content the parent adds one file at a time (via a multi-select file
// picker) rather than through the whole-folder SAF grant — e.g. a single
// coloring page from outside the configured folder. Kept as small local
// references, separate from folder content, so a gallery can show
// "folder content + individually-added files" together.
export type FileReferenceContentType = 'coloring' | 'puzzle' | 'video';

// Every content type a reference can exist for — used by clearAllFileReferences
// below so a caller doesn't have to remember to list all three itself (and
// risk missing one if a new content type is ever added here).
const ALL_CONTENT_TYPES: readonly FileReferenceContentType[] = ['coloring', 'puzzle', 'video'];

export interface FileReference {
  uri: string;
  addedAt: number;
}

function keyFor(type: FileReferenceContentType): string {
  return `kutta.fileRefs.${type}.v1`;
}

// Where individually-added files this app copies for itself are kept.
// DELIBERATELY the document directory, not the cache directory: Android
// treats everything under getCacheDir() as reclaimable — the OS deletes it
// whenever internal storage runs low, and both the system "Clear cache"
// button and any third-party cleaner app wipe it on demand. A picture the
// parent explicitly added is not a cache entry; leaving the only copy there
// meant a coloring page added in March could silently be gone in April with
// nothing to show for it. Files here survive until this app deletes them
// (see removeGalleryItems) or the app itself is uninstalled.
const ADDED_FILES_DIRNAME = 'kutta-added/';

// Resolved lazily rather than at module load: `documentDirectory` is a
// native constant, so reading it at import time would make this module's
// import order matter (and is undefined under a bare test mock).
function addedFilesDir(): string | null {
  const base = FileSystem.documentDirectory;
  return base ? `${base}${ADDED_FILES_DIRNAME}` : null;
}

// True for a file this app copied into its own storage (so removing the
// reference should also delete the bytes — nobody else owns them), as
// opposed to a uri that merely points at something of the parent's living
// elsewhere on the device, which must never be deleted.
export function isAppOwnedCopy(uri: string): boolean {
  const dir = addedFilesDir();
  return !!dir && uri.startsWith(dir);
}

// Strips anything that isn't safe in a file name while keeping the
// extension, which some readers (Skia's image decoder, expo-video) still
// sniff. Falls back to a generic name if nothing usable survives.
function safeFileName(name: string | undefined): string {
  const cleaned = (name ?? '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned.length > 0 ? cleaned.slice(-64) : 'file';
}

// Copies a freshly-picked file into this app's own persistent storage and
// returns the new uri. Best-effort by design: if anything about the copy
// fails the ORIGINAL uri is returned unchanged, so the worst case is
// exactly the old (cache-backed) behavior rather than a failed "+" tap.
export async function persistPickedFile(uri: string, name?: string, index = 0): Promise<string> {
  const dir = addedFilesDir();
  if (!dir) return uri;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const destination = `${dir}${Date.now()}-${index}-${safeFileName(name)}`;
    await FileSystem.copyAsync({ from: uri, to: destination });
    return destination;
  } catch {
    return uri;
  }
}

function isValidReference(value: unknown): value is FileReference {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as FileReference).uri === 'string' &&
    typeof (value as FileReference).addedAt === 'number'
  );
}

export async function getFileReferences(type: FileReferenceContentType): Promise<FileReference[]> {
  const raw = await AsyncStorage.getItem(keyFor(type));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidReference);
  } catch {
    return [];
  }
}

async function saveFileReferences(type: FileReferenceContentType, refs: FileReference[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(type), JSON.stringify(refs));
}

// Appends newly-picked uris, skipping any already present (a re-pick of the
// same file is a harmless no-op, not a duplicate entry).
export async function addFileReferences(
  type: FileReferenceContentType,
  uris: string[]
): Promise<FileReference[]> {
  const existing = await getFileReferences(type);
  const existingUris = new Set(existing.map((r) => r.uri));
  const addedAt = Date.now();
  const additions = uris.filter((uri) => !existingUris.has(uri)).map((uri) => ({ uri, addedAt }));
  const next = [...existing, ...additions];
  await saveFileReferences(type, next);
  return next;
}

// Removes a single reference by uri (used when a parent explicitly removes
// an individually-added file via the gallery's multi-select "remove"
// action) — this only ever drops the local REFERENCE, never the underlying
// file itself, since that file lives wherever the parent originally picked
// it from (outside this app's control) and may still be something they
// want to keep. Contrast with a folder-sourced item's removal, which does
// delete the real file (see fileReferenceStore's callers).
export async function removeFileReference(
  type: FileReferenceContentType,
  uri: string
): Promise<FileReference[]> {
  const existing = await getFileReferences(type);
  const next = existing.filter((ref) => ref.uri !== uri);
  if (next.length !== existing.length) {
    await saveFileReferences(type, next);
  }
  return next;
}

// Verifies every reference's file still exists, drops only the ones that
// don't (a deleted file, a revoked SAF grant, an unmounted SD card), and
// persists the pruned list — the same "safe empty result, don't take down
// the others" behavior as resolveProfilePictureUri (profilePicture.ts), just
// applied per-entry to a whole list. Storage is only rewritten when
// something actually needed pruning.
export async function pruneMissingFileReferences(type: FileReferenceContentType): Promise<string[]> {
  const refs = await getFileReferences(type);
  if (refs.length === 0) return [];

  const checked = await Promise.all(
    refs.map(async (ref) => {
      try {
        const info = await FileSystem.getInfoAsync(ref.uri);
        return info.exists ? ref : null;
      } catch {
        return null;
      }
    })
  );
  const valid = checked.filter((ref): ref is FileReference => ref !== null);

  if (valid.length !== refs.length) {
    await saveFileReferences(type, valid);
  }
  return valid.map((ref) => ref.uri);
}

// Used by Settings' "Reset everything" flow, alongside clearProfile and
// clearActivityLog — without this, a fresh profile created after a reset
// would silently inherit every individually-"+"-added file reference the
// PREVIOUS child's parent picked (these are keyed globally, not per-profile,
// since the app only ever has one profile at a time), making "reset
// everything" not actually reset everything.
export async function clearAllFileReferences(): Promise<void> {
  await Promise.all(ALL_CONTENT_TYPES.map((type) => AsyncStorage.removeItem(keyFor(type))));
}
