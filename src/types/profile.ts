export type Language = 'en' | 'de';

export interface Profile {
  name: string;
  age: number; // 2-8 inclusive
  language: Language;
  rootFolderUri: string | null; // SAF tree URI, null until onboarding completes
}
