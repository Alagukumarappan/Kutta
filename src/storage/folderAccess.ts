import * as FileSystem from 'expo-file-system/legacy';
import { seedSampleColoring, seedSamplePictures, seedSampleQuizImages, getSampleQuestionsJson } from './sampleContent';

const SUBFOLDERS = ['pictures', 'videos', 'coloring', 'quiz'] as const;

export async function requestFolderAccess(): Promise<string | null> {
  const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!result.granted) return null;
  return result.directoryUri;
}

// Returns the decoded final path segment of a SAF URI, e.g. for
// ".../document/primary%3ARoot%2Fpictures" this returns "pictures". Used to
// compare a candidate child's *whole* name against the wanted name, rather
// than a suffix check — `entryUri.endsWith(name)` would also match unrelated
// siblings like "Old pictures" or "not-pictures" when looking for "pictures".
export function leafNameOf(uri: string): string {
  const decoded = decodeURIComponent(uri);
  return decoded.substring(decoded.lastIndexOf('/') + 1);
}

// The installed expo-file-system's `getUriForDirectoryInRoot(folderName)` takes
// a single argument and always builds a hardcoded "primary:<folderName>" URI —
// it locates a folder in the device's root storage for requesting a *new* SAF
// grant, and does not (and cannot) derive a child URI under an arbitrary
// already-granted SAF root. The only correct way to resolve or create a named
// child of a SAF directory is to list it and match by name, or to use the real
// URI returned by `makeDirectoryAsync` when creating it. `findChildUri` and
// `ensureSubfolder` below are the shared, correct primitives for that; reuse
// them (see also RootNavigator.tsx, which resolves its own subfolder URIs the
// same way) instead of reaching for `getUriForDirectoryInRoot`.
export async function findChildUri(parentUri: string, name: string): Promise<string | null> {
  const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(parentUri);
  const match = entries.find((entryUri) => leafNameOf(entryUri) === name);
  return match ?? null;
}

// Ensures a child directory named `name` exists directly under `parentUri`,
// returning its real URI — either the existing entry's URI (found by listing)
// or the URI `makeDirectoryAsync` hands back when it has to create it.
async function ensureSubfolder(parentUri: string, name: string): Promise<string> {
  const existing = await findChildUri(parentUri, name);
  if (existing) return existing;
  return FileSystem.StorageAccessFramework.makeDirectoryAsync(parentUri, name);
}

export async function ensureContentStructure(rootUri: string): Promise<void> {
  const subfolderUris: Record<(typeof SUBFOLDERS)[number], string> = {} as Record<
    (typeof SUBFOLDERS)[number],
    string
  >;
  for (const folder of SUBFOLDERS) {
    subfolderUris[folder] = await ensureSubfolder(rootUri, folder);
  }

  const quizUri = subfolderUris.quiz;
  const quizImagesUri = await ensureSubfolder(quizUri, 'images');

  const quizEntries = await FileSystem.StorageAccessFramework.readDirectoryAsync(quizUri);
  const hasQuestionsFile = quizEntries.some((e) => leafNameOf(e) === 'questions.json');
  if (!hasQuestionsFile) {
    // A brand-new quiz folder gets the bundled sample questions instead of
    // an empty stub, so the quiz card isn't blank the first time a parent
    // opens it — see sampleContent.ts. This only ever runs once per folder
    // (gated on the file not existing yet), so it can never overwrite a
    // parent's own questions.json on a later app open.
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(quizUri, 'questions.json', 'application/json');
    await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, getSampleQuestionsJson());
  }

  // Each of these is independently gated on its own destination folder
  // being empty (see sampleContent.ts), so re-running ensureContentStructure
  // against a folder the parent has already started adding their own
  // content to is always a safe no-op.
  await seedSampleColoring(subfolderUris.coloring);
  await seedSamplePictures(subfolderUris.pictures);
  await seedSampleQuizImages(quizImagesUri);
}
