export type Language = 'en' | 'de';

export interface Profile {
  name: string;
  age: number; // 2-8 inclusive
  language: Language;
  rootFolderUri: string | null; // SAF tree URI, null until onboarding completes
  // Optional local reference to a picture the child/parent picked for their
  // profile (e.g. a Home screen avatar) — added iteration 28 as a data-only
  // first slice, no picker UI yet (see PROGRESS.md's Next section). Never a
  // remote/cloud URL: this app is offline-first with no upload of any kind,
  // so this is always either a local `file://`/`content://` URI or absent.
  // Optional (not `| null`) so every existing saved profile (which never
  // had this field) still parses correctly via JSON.parse without any
  // migration step.
  pictureUri?: string;
}
