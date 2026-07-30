import * as FileSystem from 'expo-file-system/legacy';

const SUBFOLDERS = ['pictures', 'videos', 'coloring', 'quiz'] as const;

export async function requestFolderAccess(): Promise<string | null> {
  const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!result.granted) return null;
  return result.directoryUri;
}

async function dirExists(parentUri: string, name: string): Promise<boolean> {
  const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(parentUri);
  return entries.some((entryUri) => entryUri.endsWith(`/${name}`) || entryUri.endsWith(encodeURIComponent(name)));
}

export async function ensureContentStructure(rootUri: string): Promise<void> {
  for (const folder of SUBFOLDERS) {
    const exists = await dirExists(rootUri, folder);
    if (!exists) {
      await FileSystem.StorageAccessFramework.makeDirectoryAsync(rootUri, folder);
    }
  }

  const quizUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot(rootUri, 'quiz');

  const imagesExists = await dirExists(quizUri, 'images');
  if (!imagesExists) {
    await FileSystem.StorageAccessFramework.makeDirectoryAsync(quizUri, 'images');
  }

  const quizEntries = await FileSystem.StorageAccessFramework.readDirectoryAsync(quizUri);
  const hasQuestionsFile = quizEntries.some((e) => e.endsWith('questions.json') || e.endsWith(encodeURIComponent('questions.json')));
  if (!hasQuestionsFile) {
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(quizUri, 'questions.json', 'application/json');
    await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, JSON.stringify({ questions: [] }, null, 2));
  }
}
