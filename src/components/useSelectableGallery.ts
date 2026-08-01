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
export function useSelectableGallery(folderUri: string, contentType: FileReferenceContentType, isValidFile: (uri: string) => boolean) {
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

    Promise.all([
      FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri).then((entries: string[]) =>
        entries.filter(isValidFile)
      ),
      // Files the parent added individually (outside the configured
      // folder) via AddFilesButton — pruneMissingFileReferences silently
      // drops any that have since become unreachable rather than throwing,
      // so it never causes this Promise.all to reject on its own.
      pruneMissingFileReferences(contentType),
    ])
      .then(([folderItems, extraItems]) => {
        if (cancelled) return;
        const merged = [...folderItems, ...extraItems.filter((uri) => !folderItems.includes(uri))];
        setItems(merged);
        setReferencedUris(new Set(extraItems));
      })
      .catch(() => {
        // The SAF grant may have been revoked, the folder deleted externally,
        // or an SD card unmounted — surface a retry state instead of leaving
        // an unhandled rejection and a permanently blank loading screen.
        if (!cancelled) setError(true);
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
