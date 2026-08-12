import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '../i18n/LanguageContext';
import { pruneMissingFileReferences, type FileReferenceContentType } from '../storage/fileReferenceStore';
import { removeGalleryItems } from '../storage/galleryRemoval';

// Shared load + long-press-to-multi-select-and-remove state machine, pulled
// out of ColoringGallery/PuzzleGallery/VideoGallery — all three had
// independently grown the exact same ~90 lines (load-with-retry, toggle
// selection, cancel, remove-with-confirm) with nothing but the
// FileReferenceContentType string and the file-extension filter actually
// differing between them. Behavior-preserving only: every testID, Alert
// copy, and state transition below is identical to what each gallery's own
// pre-extraction copy did.
export function useSelectableGallery(
  // Optional: 'camera' content has no whole-folder SAF counterpart at all
  // (there's nothing for a parent to pre-populate) — every camera photo is
  // an individually-added reference, so there's no folder to list. When
  // omitted, the folder-listing half below is skipped entirely and the
  // gallery is just whatever the reference side returns.
  folderUri: string | undefined,
  contentType: FileReferenceContentType,
  isValidFile: (uri: string) => boolean,
  onItemsLoaded?: (uris: string[]) => void
) {
  const { t } = useLanguage();
  const [items, setItems] = useState<string[] | null>(null);
  // Which currently-displayed items came from an individual "+" pick
  // (fileReferenceStore) rather than the configured folder — needed at
  // removal time so removeGalleryItems knows whether to drop just the
  // reference or actually delete the real file. See galleryRemoval.ts.
  const [referencedUris, setReferencedUris] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  // Bumped on Retry (or after adding/removing files) to force a fresh load
  // attempt even when folderUri itself hasn't changed.
  const [retryToken, setRetryToken] = useState(0);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setItems(null);

    // The two sources are settled INDEPENDENTLY rather than through a
    // Promise.all that either fulfils or rejects as one. They have nothing
    // to do with each other: the whole point of the "+" button is that a
    // parent can add a picture WITHOUT it being in the configured folder.
    // Failing them together meant a revoked SAF grant (folder deleted, SD
    // card pulled, permission dropped after a restart) replaced the entire
    // gallery with an error screen — hiding perfectly reachable pictures the
    // parent had added individually, and taking the "+" button, which only
    // exists in the normal header, away with it. So the error screen is now
    // only shown when there is genuinely nothing to show.
    Promise.allSettled([
      folderUri
        ? FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri).then((entries: string[]) =>
            entries.filter(isValidFile)
          )
        : Promise.resolve([] as string[]),
      // Files the parent added individually via AddFilesButton.
      pruneMissingFileReferences(contentType),
    ]).then(([folderResult, extraResult]) => {
      if (cancelled) return;
      const folderItems = folderResult.status === 'fulfilled' ? folderResult.value : [];
      // Deliberately NOT filtered through `isValidFile` — unlike a folder
      // listing (whose SAF entries carry the file's real display name/
      // extension), the system document picker routinely hands back an
      // OPAQUE content:// URI with no extension anywhere in the string at
      // all (e.g. `content://media/external/video/media/12345`), especially
      // for anything sourced from Google Photos or the media provider. An
      // earlier attempt at extension-filtering this exact list rejected
      // every single individually-added video, since none of those URIs end
      // in ".mp4" — the picker's own `mimeType` constraint (see
      // AddFilesButton) is what actually keeps the wrong file type out here,
      // not a client-side extension guess.
      const extraItems = extraResult.status === 'fulfilled' ? extraResult.value : [];

      if (folderResult.status === 'rejected' && extraItems.length === 0) {
        setError(true);
        return;
      }

      const folderSet = new Set(folderItems);
      const merged = [...folderItems, ...extraItems.filter((uri) => !folderSet.has(uri))];
      setItems(merged);
      setReferencedUris(new Set(extraItems));
      onItemsLoaded?.(merged);
    });

    return () => {
      cancelled = true;
    };
    // isValidFile is always a stable, module-level function (isImageFile/
    // isVideoFile) in every current caller, never an inline closure — safe
    // to omit from deps without risking a stale-closure bug, and including
    // it would only be meaningful if some future caller passed a fresh
    // function each render (which would need its own useCallback anyway).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderUri, contentType, retryToken]);

  function toggleSelected(uri: string) {
    setSelectedUris((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) {
        next.delete(uri);
      } else {
        next.add(uri);
      }
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }

  function handleLongPress(uri: string) {
    setSelectionMode(true);
    setSelectedUris((prev) => new Set(prev).add(uri));
  }

  function handleCancelSelection() {
    setSelectionMode(false);
    setSelectedUris(new Set());
  }

  function handleRemoveSelected() {
    const uris = Array.from(selectedUris);
    if (uris.length === 0) return;

    Alert.alert(
      t('galleryRemoveConfirmTitle'),
      t('galleryRemoveConfirmBody'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('galleryRemove'),
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            const { failedCount } = await removeGalleryItems(contentType, uris, referencedUris);
            setRemoving(false);
            setSelectionMode(false);
            setSelectedUris(new Set());
            if (failedCount > 0) {
              Alert.alert(t('galleryRemoveError'));
            }
            setRetryToken((n) => n + 1);
          },
        },
      ],
      { cancelable: true }
    );
  }

  function retry() {
    setRetryToken((n) => n + 1);
  }

  return {
    items,
    error,
    selectionMode,
    selectedUris,
    removing,
    retry,
    toggleSelected,
    handleLongPress,
    handleCancelSelection,
    handleRemoveSelected,
  };
}
