import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// Content the parent adds one file at a time (via a multi-select file
// picker) rather than through the whole-folder SAF grant — e.g. a single
// coloring page from outside the configured folder. Kept as small local
// references, separate from folder content, so a gallery can show
// "folder content + individually-added files" together.
export type FileReferenceContentType = 'coloring' | 'puzzle' | 'video';

export interface FileReference {
  uri: string;
  addedAt: number;
}

function keyFor(type: FileReferenceContentType): string {
  return `kutta.fileRefs.${type}.v1`;
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
