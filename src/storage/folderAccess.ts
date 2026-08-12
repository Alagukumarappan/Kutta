import * as FileSystem from 'expo-file-system/legacy';
import { seedSampleColoring, seedSamplePictures, seedSampleQuizImages, getSampleQuestionsJson } from './sampleContent';

const SUBFOLDERS = ['pictures', 'videos', 'coloring', 'quiz'] as const;

// All of this app's own content lives inside one clearly-named folder nested
// under whatever folder the parent picks, rather than scattering
// pictures/videos/coloring/quiz directly into it. This means switching to a
// different picked folder later (Settings -> Change content folder) always
// finds — or recreates — this same prefilled structure instead of an empty
// folder, and it keeps the app from cluttering a folder a parent might
// already use for other things (e.g. picking their whole "DCIM" or "Download"
// folder).
export const KUTTA_GAMES_FOLDER_NAME = 'Kutta-games';

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

// Ensures the picked folder has a "Kutta-games" folder directly inside it
// (creating it if this is the first time), and returns its URI — the actual
// root that `pictures`/`videos`/`coloring`/`quiz` live under.
export async function ensureKuttaGamesFolder(rootUri: string): Promise<string> {
  return ensureSubfolder(rootUri, KUTTA_GAMES_FOLDER_NAME);
}

// Returns the "Kutta-games" folder URI, and prefills it with the same
// pictures/videos/coloring/quiz structure + bundled sample content that a
// brand-new folder would get — every call is idempotent (each step is gated
// on "not already there" / "destination is empty"), so this can be re-run
// freely, including from FolderErrorScreen's Retry after a SAF grant was
// revoked or a subfolder deleted outside the app.
export async function ensureContentStructure(rootUri: string): Promise<string> {
  const gamesUri = await ensureKuttaGamesFolder(rootUri);

  const subfolderUris: Record<(typeof SUBFOLDERS)[number], string> = {} as Record<
    (typeof SUBFOLDERS)[number],
    string
  >;
  for (const folder of SUBFOLDERS) {
    subfolderUris[folder] = await ensureSubfolder(gamesUri, folder);
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

  // Deliberately NOT awaited: each of these copies dozens of bundled files
  // into the SAF folder through several slow IPC round-trips per file, and
  // on real hardware (confirmed via an Android bug report from a Samsung
  // S22 — the app itself was healthy the whole time, no crash/ANR anywhere,
  // just this promise chain still running) that added up to a long enough
  // wait to look like the app had frozen. resolveSubfolderUris (the caller)
  // only needs the four subfolders to exist, not for them to be pre-filled,
  // so seeding now continues in the background after this function
  // returns — the app can show Home immediately, and a gallery just
  // populates a little later if it happens to be opened before its seeding
  // finishes. Each call is independently gated on its own destination
  // folder being empty (see sampleContent.ts), so re-running
  // ensureContentStructure against a folder the parent has already started
  // adding their own content to is always a safe no-op.
  Promise.all([
    seedSampleColoring(subfolderUris.coloring),
    seedSamplePictures(subfolderUris.pictures),
    seedSampleQuizImages(quizImagesUri),
  ]).catch(() => {
    // Best-effort convenience content, not core functionality — nothing to
    // recover from here even if every seed unexpectedly rejected.
  });

  return gamesUri;
}
