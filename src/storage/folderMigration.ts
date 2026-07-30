import * as FileSystem from 'expo-file-system';

function leafName(uri: string): string {
  const decoded = decodeURIComponent(uri);
  return decoded.substring(decoded.lastIndexOf('/') + 1);
}

export async function migrateContent(
  oldRootUri: string,
  newRootUri: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const topLevelEntries = await FileSystem.StorageAccessFramework.readDirectoryAsync(oldRootUri);

    for (const entryUri of topLevelEntries) {
      await FileSystem.StorageAccessFramework.copyAsync({ from: entryUri, to: newRootUri });
    }

    const verifyEntries = await FileSystem.StorageAccessFramework.readDirectoryAsync(newRootUri);
    const sourceNames = new Set(topLevelEntries.map(leafName));
    const destNames = new Set(verifyEntries.map(leafName));

    for (const sourceName of sourceNames) {
      if (!destNames.has(sourceName)) {
        return { success: false, error: `Copy verification failed: missing entry "${sourceName}" in destination.` };
      }
    }

    await FileSystem.StorageAccessFramework.deleteAsync(oldRootUri);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
