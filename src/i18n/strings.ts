import type { Language } from '../types/profile';

export const UI_STRINGS = {
  onboardingTitle: { en: 'Welcome!', de: 'Willkommen!' },
  onboardingName: { en: "Child's name", de: 'Name des Kindes' },
  onboardingAge: { en: 'Age', de: 'Alter' },
  onboardingLanguage: { en: 'Language', de: 'Sprache' },
  onboardingPickFolder: { en: 'Choose content folder', de: 'Inhaltsordner wählen' },
  onboardingSave: { en: 'Save', de: 'Speichern' },
  onboardingSelectAge: { en: 'Select age', de: 'Alter wählen' },
  onboardingNameMissing: { en: 'Please enter a name', de: 'Bitte gib einen Namen ein' },
  onboardingAgeMissing: { en: 'Please select an age', de: 'Bitte wähle ein Alter aus' },
  onboardingFolderMissing: { en: 'Please choose a content folder', de: 'Bitte wähle einen Inhaltsordner' },
  homeColoring: { en: 'Coloring', de: 'Malen' },
  homeQuiz: { en: 'Quiz', de: 'Quiz' },
  homePuzzle: { en: 'Photo Puzzle', de: 'Fotopuzzle' },
  homeVideo: { en: 'Videos', de: 'Videos' },
  coloringDetailTitle: { en: 'Coloring Page', de: 'Malvorlage' },
  puzzleDetailTitle: { en: 'Puzzle', de: 'Puzzle' },
  videoDetailTitle: { en: 'Video', de: 'Video' },
  settingsTitle: { en: 'Settings', de: 'Einstellungen' },
  settingsFolder: { en: 'Content folder', de: 'Inhaltsordner' },
  settingsChangeFolder: { en: 'Change content folder', de: 'Inhaltsordner ändern' },
  settingsSave: { en: 'Save changes', de: 'Änderungen speichern' },
  migrationInProgress: { en: 'Moving your content…', de: 'Inhalte werden verschoben…' },
  migrationFailed: {
    en: 'Could not move content. Your old folder is unchanged.',
    de: 'Inhalte konnten nicht verschoben werden. Der alte Ordner bleibt unverändert.',
  },
  migrationConfirmTitle: { en: 'Move content?', de: 'Inhalte verschieben?' },
  migrationConfirmBody: {
    en: 'Your existing content will be moved to the new folder, and removed from the old location. This cannot be undone.',
    de: 'Deine vorhandenen Inhalte werden in den neuen Ordner verschoben und aus dem alten Ordner entfernt. Dies kann nicht rückgängig gemacht werden.',
  },
  migrationConfirmConfirm: { en: 'Move content', de: 'Inhalte verschieben' },
  migrationConfirmCancel: { en: 'Cancel', de: 'Abbrechen' },
  folderPickError: {
    en: 'Could not open the folder picker. Please try again.',
    de: 'Der Ordnerauswahldialog konnte nicht geöffnet werden. Bitte versuche es erneut.',
  },
  emptyPictures: { en: 'No pictures yet — add some to the pictures folder!', de: 'Noch keine Bilder — füge welche zum Bilderordner hinzu!' },
  emptyVideos: { en: 'No videos yet — add some to the videos folder!', de: 'Noch keine Videos — füge welche zum Videoordner hinzu!' },
  emptyColoring: { en: 'No coloring pages yet — add some to the coloring folder!', de: 'Noch keine Malvorlagen — füge welche zum Malordner hinzu!' },
  emptyQuiz: { en: 'No quiz questions for this age yet.', de: 'Noch keine Quizfragen für dieses Alter.' },
  quizScore: { en: 'Quiz done! Your score: {score} / {total}', de: 'Quiz fertig! Dein Ergebnis: {score} / {total}' },
  quizCorrect: { en: 'Correct!', de: 'Richtig!' },
  quizIncorrect: { en: 'Try again!', de: 'Versuch es nochmal!' },
  quizNext: { en: 'Next', de: 'Weiter' },
  puzzlePickPieces: { en: 'Choose difficulty', de: 'Schwierigkeit wählen' },
  videoLoadError: { en: 'This video could not be played.', de: 'Dieses Video konnte nicht abgespielt werden.' },
  coloringImageLoadError: {
    en: 'This picture could not be loaded for coloring.',
    de: 'Dieses Bild konnte nicht zum Ausmalen geladen werden.',
  },
  folderResolveError: {
    en: 'Could not access your content folders. Please check folder access and try again.',
    de: 'Zugriff auf deine Inhaltsordner nicht möglich. Bitte überprüfe den Ordnerzugriff und versuche es erneut.',
  },
  retry: { en: 'Retry', de: 'Erneut versuchen' },
  toolFill: { en: 'Fill', de: 'Füllen' },
  toolPen: { en: 'Pen', de: 'Stift' },
  clearDrawing: { en: 'Clear drawing', de: 'Zeichnung löschen' },
  loadError: {
    en: 'Something went wrong loading this content.',
    de: 'Beim Laden dieser Inhalte ist ein Fehler aufgetreten.',
  },
  splashTagline: {
    en: 'Where learning feels like play',
    de: 'Wo Lernen sich wie Spielen anfühlt',
  },
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
