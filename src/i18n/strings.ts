import type { Language } from '../types/profile';

export const UI_STRINGS = {
  onboardingTitle: { en: 'Welcome!', de: 'Willkommen!' },
  onboardingName: { en: "Child's name", de: 'Name des Kindes' },
  onboardingAge: { en: 'Age', de: 'Alter' },
  onboardingLanguage: { en: 'Language', de: 'Sprache' },
  onboardingPickFolder: { en: 'Choose content folder', de: 'Inhaltsordner wählen' },
  onboardingSave: { en: 'Save', de: 'Speichern' },
  homeColoring: { en: 'Coloring', de: 'Malen' },
  homeQuiz: { en: 'Quiz', de: 'Quiz' },
  homePuzzle: { en: 'Photo Puzzle', de: 'Fotopuzzle' },
  homeVideo: { en: 'Videos', de: 'Videos' },
  settingsTitle: { en: 'Settings', de: 'Einstellungen' },
  settingsChangeFolder: { en: 'Change content folder', de: 'Inhaltsordner ändern' },
  settingsSave: { en: 'Save changes', de: 'Änderungen speichern' },
  migrationInProgress: { en: 'Moving your content…', de: 'Inhalte werden verschoben…' },
  migrationFailed: {
    en: 'Could not move content. Your old folder is unchanged.',
    de: 'Inhalte konnten nicht verschoben werden. Der alte Ordner bleibt unverändert.',
  },
  emptyPictures: { en: 'No pictures yet — add some to the pictures folder!', de: 'Noch keine Bilder — füge welche zum Bilderordner hinzu!' },
  emptyVideos: { en: 'No videos yet — add some to the videos folder!', de: 'Noch keine Videos — füge welche zum Videoordner hinzu!' },
  emptyColoring: { en: 'No coloring pages yet — add some to the coloring folder!', de: 'Noch keine Malvorlagen — füge welche zum Malordner hinzu!' },
  emptyQuiz: { en: 'No quiz questions for this age yet.', de: 'Noch keine Quizfragen für dieses Alter.' },
  quizScore: { en: 'Quiz done! Your score: {score} / {total}', de: 'Quiz fertig! Dein Ergebnis: {score} / {total}' },
  puzzlePickPieces: { en: 'Choose difficulty', de: 'Schwierigkeit wählen' },
  videoLoadError: { en: 'This video could not be played.', de: 'Dieses Video konnte nicht abgespielt werden.' },
} as const;

export type StringKey = keyof typeof UI_STRINGS;

export function t(key: StringKey, lang: Language): string {
  return UI_STRINGS[key][lang];
}

export function tFormat(key: StringKey, lang: Language, params: Record<string, string | number>): string {
  let result = t(key, lang);
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(`{${k}}`, String(v));
  }
  return result;
}
