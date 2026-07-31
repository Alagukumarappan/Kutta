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
  homeColoringTagline: { en: "Let's create!", de: 'Los geht’s!' },
  homeQuizTagline: { en: 'Test your smarts', de: 'Teste dein Wissen' },
  homePuzzleTagline: { en: 'Piece it together', de: 'Setz es zusammen' },
  homeVideoTagline: { en: 'Watch & learn', de: 'Schauen & lernen' },
  homeGreetingHi: { en: 'Hi,', de: 'Hallo,' },
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
  // Screen-reader-only accessible name for the progress-dots row in
  // QuestionRenderer (the dots themselves are plain, unlabeled <View>s so
  // sighted children get a simple visual without any digits/text cluttering
  // the screen — see QuestionRenderer's progressRow). {current} is always
  // 1-based (currentIndex + 1) to match how a person would count aloud.
  quizProgressLabel: { en: 'Question {current} of {total}', de: 'Frage {current} von {total}' },
  quizCorrect: { en: 'Correct!', de: 'Richtig!' },
  // Age-tiered wrong-answer feedback (replaces the old single `quizIncorrect`
  // wording — see QuestionRenderer). Never harsh/shaming; younger children
  // (2-4) get the gentlest, simplest phrasing, older children (5-8) get a
  // slightly more capable-sounding nudge. Wording is warm/natural in each
  // language, not a literal translation of the other.
  quizIncorrectYoung: { en: "Good try! Let's try again.", de: "Gut versucht! Versuchen wir's noch mal." },
  quizIncorrectOlder: { en: 'Nice try! Take another look.', de: 'Netter Versuch! Schau noch mal genau hin.' },
  // Deliberate, developer-requested behavior change: on a wrong answer, this
  // now labels a second line in the feedback card that names the correct
  // option's own text (see QuestionRenderer's correctAnswerText), e.g. "The
  // correct answer is: 4" — shown alongside, never instead of, the
  // encouraging quizIncorrectYoung/Older line above it. Only rendered when
  // the correct option actually has `.text` (image-only options render
  // nothing extra), so this key is never shown standing alone.
  quizCorrectAnswerLabel: { en: 'The correct answer is:', de: 'Die richtige Antwort ist:' },
  // Shown in a brief, auto-fading celebration pop (see QuestionRenderer)
  // alongside quizCorrect — kept intentionally short (a few characters) so
  // it can never cause the child-facing quiz screen to need scrolling.
  quizCelebration: { en: 'Yay! ⭐', de: 'Juhu! ⭐' },
  quizNext: { en: 'Next', de: 'Weiter' },
  // Completion-screen actions (see QuizScreen's isFinished branch) — shown
  // regardless of score, so neither label references performance at all.
  quizPlayAgain: { en: 'Play Again', de: 'Nochmal spielen' },
  quizGoHome: { en: 'Home', de: 'Start' },
  puzzlePickPieces: { en: 'Choose difficulty', de: 'Schwierigkeit wählen' },
  puzzleMatchHint: { en: 'Match the picture!', de: 'Ordne die Teile zu!' },
  puzzleComplete: { en: 'Great job!', de: 'Super gemacht!' },
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
  paletteColorRed: { en: 'Red', de: 'Rot' },
  paletteColorOrange: { en: 'Orange', de: 'Orange' },
  paletteColorYellow: { en: 'Yellow', de: 'Gelb' },
  paletteColorGreen: { en: 'Green', de: 'Grün' },
  paletteColorBlue: { en: 'Blue', de: 'Blau' },
  paletteColorPurple: { en: 'Purple', de: 'Lila' },
  paletteColorPink: { en: 'Pink', de: 'Pink' },
  paletteColorBrown: { en: 'Brown', de: 'Braun' },
  paletteColorBlack: { en: 'Black', de: 'Schwarz' },
  paletteColorWhite: { en: 'White', de: 'Weiß' },
  paletteColorTeal: { en: 'Teal', de: 'Türkis' },
  paletteColorGray: { en: 'Gray', de: 'Grau' },
  paletteColorLightBlue: { en: 'Light Blue', de: 'Hellblau' },
  paletteColorNavy: { en: 'Navy', de: 'Marineblau' },
  paletteColorSkinLight: { en: 'Light Skin', de: 'Helle Haut' },
  paletteColorSkinMedium: { en: 'Medium Skin', de: 'Mittlere Haut' },
  paletteColorSkinDeep: { en: 'Deep Skin', de: 'Dunkle Haut' },
  toolFill: { en: 'Fill', de: 'Füllen' },
  toolPen: { en: 'Pen', de: 'Stift' },
  clearDrawing: { en: 'Clear drawing', de: 'Zeichnung löschen' },
  clearDrawingConfirmTitle: { en: 'Clear picture?', de: 'Bild löschen?' },
  clearDrawingConfirmBody: {
    en: 'This will erase your drawing.',
    de: 'Das löscht dein Bild.',
  },
  clearDrawingConfirmConfirm: { en: 'Clear', de: 'Löschen' },
  clearDrawingConfirmCancel: { en: 'Cancel', de: 'Abbrechen' },
  // Single-level "undo last flood fill" (iteration 27) — deliberately not
  // gated behind a confirmation dialog like clearDrawing above: it only
  // ever reverts the one most recent fill (a much smaller, cheap-to-redo
  // action than wiping every pen stroke), so an extra confirmation tap
  // would just be friction for a 2-8 year old, not a real safety need.
  undoFill: { en: 'Undo', de: 'Rückgängig' },
  loadError: {
    en: 'Something went wrong loading this content.',
    de: 'Beim Laden dieser Inhalte ist ein Fehler aufgetreten.',
  },
  // Generic Cancel label, deliberately separate from
  // clearDrawingConfirmCancel/migrationConfirmCancel (those two are scoped
  // to their own specific confirmation flows) — this one backs the new
  // profile-picture picker modal, and is written generically enough that
  // any future dismiss-a-modal-without-side-effects action could reuse it.
  cancel: { en: 'Cancel', de: 'Abbrechen' },
  // Settings screen's optional profile-picture section (iteration 29 — see
  // PROGRESS.md). Reuses the already-granted "pictures" content folder, the
  // same one PuzzleGallery lists from — no new permission, no camera, no
  // upload.
  settingsProfilePicture: { en: 'Profile Picture', de: 'Profilbild' },
  profilePictureChoose: { en: 'Choose a picture', de: 'Bild auswählen' },
  profilePictureRemove: { en: 'Remove picture', de: 'Bild entfernen' },
  addColoringPicture: { en: '+ Add coloring picture', de: '+ Malbild hinzufügen' },
  addPuzzlePicture: { en: '+ Add puzzle picture', de: '+ Puzzlebild hinzufügen' },
  addVideo: { en: '+ Add video', de: '+ Video hinzufügen' },
  addFilesError: { en: "Couldn't add that — please try again.", de: 'Konnte das nicht hinzufügen — bitte erneut versuchen.' },
  penSizeLabel: { en: 'Pen size', de: 'Stiftgröße' },
  profilePicturePickerTitle: { en: 'Choose a profile picture', de: 'Profilbild auswählen' },
  // Lets a parent pick a profile picture from anywhere on the device (not
  // just the configured "pictures" folder listed above it in the same
  // modal), via the system file picker in single-select mode — mirrors
  // AddFilesButton's picker invocation but picks exactly one image.
  profilePictureBrowseAnywhere: { en: 'Browse anywhere on your device', de: 'Auf dem ganzen Gerät suchen' },
  profilePictureBrowseError: { en: "Couldn't open that picture — please try again.", de: 'Konnte das Bild nicht öffnen — bitte erneut versuchen.' },
  // {name}'s Home-screen avatar accessible name/fallback — decorative only
  // (not tappable), but still needs a real label for screen readers per
  // this feature's own accessibility requirement.
  homeProfilePictureLabel: { en: "{name}'s picture", de: 'Profilbild von {name}' },
  homeProfilePicturePlaceholderLabel: { en: 'No profile picture set', de: 'Kein Profilbild festgelegt' },
  splashTagline: {
    en: 'Kutta — where learning likes play',
    de: 'Kutta — wo Lernen Spaß macht',
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
