import * as FileSystem from 'expo-file-system/legacy';
import { removeFileReference, isAppOwnedCopy, type FileReferenceContentType } from './fileReferenceStore';

// Removes a batch of gallery items the parent selected via long-press
// multi-select. Each uri is either:
//   - individually added via the "+" button (tracked in fileReferenceStore)
//     -> the REFERENCE is removed. The bytes are only deleted when they are
//        a copy this app made for itself (isAppOwnedCopy — a picked image
//        living under documentDirectory/kutta-added/); anything still owned
//        by the parent, wherever they originally picked it from, is left
//        strictly alone.
//   - listed from the parent's configured content folder
//     -> the real file is deleted (StorageAccessFramework.deleteAsync,
//        which correctly handles both plain files and SAF content:// URIs).
// One item failing to remove must not block the rest — matches this app's
// established "best-effort, one bad item doesn't take down the batch"
// convention (see sampleContent.ts/pruneMissingFileReferences).
export async function removeGalleryItems(
  contentType: FileReferenceContentType,
  selectedUris: string[],
  referencedUris: ReadonlySet<string>
): Promise<{ removedCount: number; failedCount: number }> {
  let removedCount = 0;
  let failedCount = 0;

  for (const uri of selectedUris) {
    try {
      if (referencedUris.has(uri)) {
        await removeFileReference(contentType, uri);
        // A picked IMAGE is copied into this app's own storage when it is
        // added (see persistPickedFile), so that copy belongs to us and
        // nobody else: dropping only the reference would leak it forever in
        // app-private storage the OS never reclaims and the parent can't
        // see. Deleted best-effort — a failure here must not report the
        // removal (which, from the parent's point of view, has already
        // happened) as failed. Anything NOT app-owned — a referenced video
        // still living in the parent's own photo library, say — is left
        // strictly alone, same as before.
        if (isAppOwnedCopy(uri)) {
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        }
      } else {
        await FileSystem.StorageAccessFramework.deleteAsync(uri, { idempotent: true });
      }
      removedCount++;
    } catch {
      failedCount++;
    }
  }

  return { removedCount, failedCount };
}
