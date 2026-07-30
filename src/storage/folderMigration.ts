import * as FileSystem from 'expo-file-system';

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
    if (verifyEntries.length < topLevelEntries.length) {
      return { success: false, error: 'Copy verification failed: item count mismatch.' };
    }

    await FileSystem.StorageAccessFramework.deleteAsync(oldRootUri);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
