import * as FileSystem from 'expo-file-system/legacy';
import { removeFileReference, type FileReferenceContentType } from './fileReferenceStore';

// Removes a batch of gallery items the parent selected via long-press
// multi-select. Each uri is either:
//   - individually added via the "+" button (tracked in fileReferenceStore)
//     -> only the REFERENCE is removed; the real file, which lives outside
//        this app's configured folder, is left alone.
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
