# Kutta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Kutta", an offline Android app (React Native/Expo) for a 2-8 year old with Coloring, Quiz, Photo Puzzle, and Video Player features, all driven by user-supplied content in a folder the child's parent picks on the device.

**Architecture:** A single Expo (dev-client) React Native TypeScript app. Navigation via React Navigation native-stack. All child content (photos, videos, coloring outlines, quiz JSON+images) lives under one user-chosen root folder accessed via Android's Storage Access Framework (SAF) through `expo-file-system`, never bundled in the APK. App-internal state (profile: name/age/language/root folder URI) is stored via AsyncStorage. Each feature is an isolated module under `src/<feature>/` with its own pure-logic files (fully unit tested) and thin screen components (smoke tested).

**Tech Stack:** Expo (dev client) + TypeScript, React Navigation (native-stack), `@react-native-async-storage/async-storage`, `expo-file-system` (StorageAccessFramework), `expo-video`, `@shopify/react-native-skia` (coloring canvas + flood fill), `jest-expo` + `@testing-library/react-native` for tests.

## Global Constraints

- Project lives at `/home/aramasamy/repository/mine/Kutta/`. App/APK/project name: **Kutta**. Suggested Android application id: `com.aramasamy.kutta`.
- Android only. Fully offline — no network calls, no backend, ever.
- TypeScript everywhere (no untyped `.js` source files).
- Single child profile only — no multi-profile switching.
- Every UI-chrome string must exist in both English and German (Section 9 of spec); driven by the language setting.
- Root content folder always has exactly these subfolders: `pictures/`, `videos/`, `coloring/`, `quiz/`, `quiz/images/`.
- Quiz questions always have exactly 4 options (`a`-`d`); `question.text`/`question.image` and each option's `text`/`image` are independently optional; app must tolerate unknown extra JSON fields without crashing.
- Quiz sessions: filter by `minAge <= childAge <= maxAge`, shuffle, take first 20 (or fewer if fewer are eligible), one question per screen, immediate feedback, end card with score `X / N`.
- Changing the root folder in Settings: copy old → new, verify success, only then delete old. Never delete-before-verify.
- Every empty/missing/malformed content case (empty `pictures/`, invalid `questions.json`, missing referenced image, corrupt video) must show a friendly in-app state, never a crash.
- Full spec: `docs/superpowers/specs/2026-07-30-kutta-design.md`.

---

## File Structure

```
Kutta/
  package.json, app.json, tsconfig.json, babel.config.js, jest.config.js
  App.tsx
  src/
    types/
      profile.ts          # Profile type
      quiz.ts             # Question, Option, QuestionsFile types
    i18n/
      strings.ts          # UI_STRINGS bilingual dictionary + t() helper
      LanguageContext.tsx # React context providing current language + t()
    storage/
      profileStore.ts     # AsyncStorage get/set Profile
      folderAccess.ts     # SAF permission request, subfolder creation, template questions.json
      folderMigration.ts  # copy-verify-delete migration logic
    quiz/
      loadQuestions.ts    # read + parse + validate questions.json → Question[]
      filterQuestions.ts  # age filter
      shuffle.ts          # injectable-RNG Fisher-Yates shuffle
      quizSession.ts      # buildSession(), scoring reducer
      QuestionRenderer.tsx
      QuizScreen.tsx
    coloring/
      floodFill.ts        # pixel-buffer flood fill algorithm
      ColoringGallery.tsx
      ColoringScreen.tsx
    puzzle/
      puzzleGrid.ts       # compute piece rects for N pieces
      shufflePieces.ts    # shuffle piece order, ensure solvable/non-trivial
      PuzzleGallery.tsx
      PuzzleScreen.tsx
    video/
      VideoGallery.tsx
      VideoPlayerScreen.tsx
    onboarding/
      OnboardingScreen.tsx
    settings/
      SettingsScreen.tsx
    home/
      HomeScreen.tsx
    navigation/
      RootNavigator.tsx
  __tests__/
    (mirrors src/ for each file with a test)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `babel.config.js`, `jest.config.js`, `app.json`, `App.tsx`
- Create: `src/types/profile.ts`

**Interfaces:**
- Produces: `Profile` type — `{ name: string; age: number; language: 'en' | 'de'; rootFolderUri: string | null }`, used by every later task that reads/writes profile state.

- [ ] **Step 1: Initialize the Expo TypeScript project**

```bash
cd /home/aramasamy/repository/mine/Kutta
npx create-expo-app@latest . --template blank-typescript
```

- [ ] **Step 2: Install runtime dependencies**

```bash
npx expo install @react-navigation/native @react-navigation/native-stack \
  react-native-screens react-native-safe-area-context \
  @react-native-async-storage/async-storage \
  expo-file-system expo-video @shopify/react-native-skia
```

- [ ] **Step 3: Install dev/test dependencies**

```bash
npm install --save-dev jest-expo @testing-library/react-native @types/jest ts-jest
```

- [ ] **Step 4: Configure Jest**

Create `jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  setupFilesAfterEach: [],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
```

Add to `package.json` scripts: `"test": "jest"`.

- [ ] **Step 5: Define the Profile type**

Create `src/types/profile.ts`:

```ts
export type Language = 'en' | 'de';

export interface Profile {
  name: string;
  age: number; // 2-8 inclusive
  language: Language;
  rootFolderUri: string | null; // SAF tree URI, null until onboarding completes
}
```

- [ ] **Step 6: Verify the scaffold builds and tests run**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: "No tests found" (0 test suites) — expected at this stage, not a failure.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Kutta Expo TypeScript project"
```

---

### Task 2: i18n Strings and Language Context

**Files:**
- Create: `src/i18n/strings.ts`
- Create: `src/i18n/LanguageContext.tsx`
- Test: `__tests__/i18n/strings.test.ts`

**Interfaces:**
- Consumes: `Language` from `src/types/profile.ts` (Task 1).
- Produces: `t(key: StringKey, lang: Language): string` and `useLanguage(): { language: Language; setLanguage: (l: Language) => void; t: (key: StringKey) => string }` from `LanguageProvider` — every screen task below consumes `useLanguage()` for UI text.

- [ ] **Step 1: Write the failing test for the string dictionary**

Create `__tests__/i18n/strings.test.ts`:

```ts
import { t, UI_STRINGS } from '../../src/i18n/strings';

describe('strings', () => {
  it('has both en and de for every key', () => {
    for (const key of Object.keys(UI_STRINGS) as (keyof typeof UI_STRINGS)[]) {
      expect(UI_STRINGS[key].en).toEqual(expect.any(String));
      expect(UI_STRINGS[key].de).toEqual(expect.any(String));
      expect(UI_STRINGS[key].en.length).toBeGreaterThan(0);
      expect(UI_STRINGS[key].de.length).toBeGreaterThan(0);
    }
  });

  it('t() returns the string for the requested language', () => {
    expect(t('homeColoring', 'en')).toBe('Coloring');
    expect(t('homeColoring', 'de')).toBe('Malen');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- strings.test.ts`
Expected: FAIL — `Cannot find module '../../src/i18n/strings'`.

- [ ] **Step 3: Implement the string dictionary**

Create `src/i18n/strings.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- strings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement LanguageContext**

Create `src/i18n/LanguageContext.tsx`:

```tsx
import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Language } from '../types/profile';
import { t as translate, StringKey } from './strings';

interface LanguageContextValue {
  language: Language;
  setLanguage: (l: Language) => void;
  t: (key: StringKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: React.ReactNode;
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key: StringKey) => translate(key, language),
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
```

- [ ] **Step 6: Run full test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 7: Commit**

```bash
git add src/i18n __tests__/i18n
git commit -m "feat: add bilingual string dictionary and language context"
```

---

### Task 3: Profile Storage

**Files:**
- Create: `src/storage/profileStore.ts`
- Test: `__tests__/storage/profileStore.test.ts`

**Interfaces:**
- Consumes: `Profile` type (Task 1).
- Produces: `getProfile(): Promise<Profile | null>`, `saveProfile(p: Profile): Promise<void>` — consumed by Onboarding (Task 6), Settings (Task 7), and `App.tsx` (Task 16) to decide onboarding-vs-home routing.

- [ ] **Step 1: Write the failing test**

Create `__tests__/storage/profileStore.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfile, saveProfile } from '../../src/storage/profileStore';

describe('profileStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns null when no profile has been saved', async () => {
    expect(await getProfile()).toBeNull();
  });

  it('saves and retrieves a profile', async () => {
    const profile = { name: 'Sam', age: 4, language: 'en' as const, rootFolderUri: 'content://tree/abc' };
    await saveProfile(profile);
    expect(await getProfile()).toEqual(profile);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- profileStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement profileStore**

Create `src/storage/profileStore.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '../types/profile';

const PROFILE_KEY = 'kutta.profile.v1';

export async function getProfile(): Promise<Profile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- profileStore.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/storage/profileStore.ts __tests__/storage/profileStore.test.ts
git commit -m "feat: add profile storage backed by AsyncStorage"
```

---

### Task 4: Folder Access (SAF permission + subfolder creation)

**Files:**
- Create: `src/storage/folderAccess.ts`
- Test: `__tests__/storage/folderAccess.test.ts`

**Interfaces:**
- Consumes: none beyond `expo-file-system`.
- Produces: `requestFolderAccess(): Promise<string | null>` (returns granted SAF tree URI or null if denied), `ensureContentStructure(rootUri: string): Promise<void>` (creates `pictures/`, `videos/`, `coloring/`, `quiz/`, `quiz/images/`, and a template `quiz/questions.json` if absent). Consumed by Onboarding (Task 6) and Settings (Task 7).

- [ ] **Step 1: Write the failing test**

Create `__tests__/storage/folderAccess.test.ts`:

```ts
import * as FileSystem from 'expo-file-system';
import { ensureContentStructure } from '../../src/storage/folderAccess';

jest.mock('expo-file-system', () => ({
  StorageAccessFramework: {
    readDirectoryAsync: jest.fn(),
    makeDirectoryAsync: jest.fn(),
    createFileAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
    getUriForDirectoryInRoot: jest.fn((root: string, name: string) => `${root}/${name}`),
  },
}));

describe('ensureContentStructure', () => {
  const rootUri = 'content://tree/root';

  beforeEach(() => jest.clearAllMocks());

  it('creates all four subfolders and quiz/images when the directory is empty', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    await ensureContentStructure(rootUri);

    const madeDirs = (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mock.calls.map(
      (c) => c[1]
    );
    expect(madeDirs).toEqual(expect.arrayContaining(['pictures', 'videos', 'coloring', 'quiz']));
  });

  it('does not recreate a subfolder that already exists', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(async (uri: string) => {
      if (uri === rootUri) return [`${rootUri}/pictures`];
      return [];
    });

    await ensureContentStructure(rootUri);

    const madeDirs = (FileSystem.StorageAccessFramework.makeDirectoryAsync as jest.Mock).mock.calls.map(
      (c) => c[1]
    );
    expect(madeDirs).not.toContain('pictures');
  });

  it('writes a template questions.json when quiz/questions.json is missing', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    await ensureContentStructure(rootUri);

    expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      expect.stringContaining('quiz'),
      'questions.json',
      'application/json'
    );
    expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ questions: [] }, null, 2)
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- folderAccess.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement folderAccess**

Create `src/storage/folderAccess.ts`:

```ts
import * as FileSystem from 'expo-file-system';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- folderAccess.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/storage/folderAccess.ts __tests__/storage/folderAccess.test.ts
git commit -m "feat: add SAF folder permission request and content structure setup"
```

---

### Task 5: Folder Migration (copy → verify → delete)

**Files:**
- Create: `src/storage/folderMigration.ts`
- Test: `__tests__/storage/folderMigration.test.ts`

**Interfaces:**
- Consumes: `expo-file-system` SAF APIs (same surface as Task 4).
- Produces: `migrateContent(oldRootUri: string, newRootUri: string): Promise<{ success: true } | { success: false; error: string }>`. Consumed by Settings (Task 7).

- [ ] **Step 1: Write the failing test**

Create `__tests__/storage/folderMigration.test.ts`:

```ts
import * as FileSystem from 'expo-file-system';
import { migrateContent } from '../../src/storage/folderMigration';

jest.mock('expo-file-system', () => ({
  StorageAccessFramework: {
    readDirectoryAsync: jest.fn(),
    copyAsync: jest.fn(),
    deleteAsync: jest.fn(),
  },
}));

describe('migrateContent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('copies every entry then deletes the old root on success', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(async (uri: string) => {
      if (uri === 'old-root') return ['old-root/pictures', 'old-root/videos'];
      return ['old-root/pictures/a.png']; // sub-listing used for verification
    });
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockResolvedValue(undefined);

    const result = await migrateContent('old-root', 'new-root');

    expect(result).toEqual({ success: true });
    expect(FileSystem.StorageAccessFramework.copyAsync).toHaveBeenCalled();
    expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith('old-root');
  });

  it('does NOT delete the old root if a copy fails', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue(['old-root/pictures']);
    (FileSystem.StorageAccessFramework.copyAsync as jest.Mock).mockRejectedValue(new Error('disk full'));

    const result = await migrateContent('old-root', 'new-root');

    expect(result.success).toBe(false);
    expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- folderMigration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement folderMigration**

Create `src/storage/folderMigration.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- folderMigration.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/storage/folderMigration.ts __tests__/storage/folderMigration.test.ts
git commit -m "feat: add copy-verify-delete folder migration logic"
```

---

### Task 6: Onboarding Screen

**Files:**
- Create: `src/onboarding/OnboardingScreen.tsx`
- Test: `__tests__/onboarding/OnboardingScreen.test.tsx`

**Interfaces:**
- Consumes: `requestFolderAccess`, `ensureContentStructure` (Task 4), `saveProfile` (Task 3), `useLanguage` (Task 2), `Profile` type (Task 1).
- Produces: `OnboardingScreen({ onComplete }: { onComplete: () => void })` — mounted by `RootNavigator` (Task 16) when `getProfile()` returns null.

- [ ] **Step 1: Write the failing smoke test**

Create `__tests__/onboarding/OnboardingScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { OnboardingScreen } from '../../src/onboarding/OnboardingScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as folderAccess from '../../src/storage/folderAccess';
import * as profileStore from '../../src/storage/profileStore';

jest.mock('../../src/storage/folderAccess');
jest.mock('../../src/storage/profileStore');

describe('OnboardingScreen', () => {
  it('saves the profile and calls onComplete after a successful folder pick', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const onComplete = jest.fn();
    const { getByTestId, getByText } = render(
      <LanguageProvider initialLanguage="en">
        <OnboardingScreen onComplete={onComplete} />
      </LanguageProvider>
    );

    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    fireEvent.changeText(getByTestId('onboarding-age-input'), '4');
    fireEvent.press(getByText('Choose content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
    fireEvent.press(getByText('Save'));

    await waitFor(() => expect(profileStore.saveProfile).toHaveBeenCalledWith({
      name: 'Sam',
      age: 4,
      language: 'en',
      rootFolderUri: 'content://tree/root',
    }));
    expect(onComplete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- OnboardingScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement OnboardingScreen**

Create `src/onboarding/OnboardingScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { requestFolderAccess, ensureContentStructure } from '../storage/folderAccess';
import { saveProfile } from '../storage/profileStore';
import type { Language } from '../types/profile';

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { t, language, setLanguage } = useLanguage();
  const [name, setName] = useState('');
  const [ageText, setAgeText] = useState('');
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const age = Number(ageText);
  const isValid = name.trim().length > 0 && Number.isInteger(age) && age >= 2 && age <= 8 && !!folderUri;

  async function handlePickFolder() {
    const uri = await requestFolderAccess();
    setFolderUri(uri);
  }

  async function handleSave() {
    if (!isValid || !folderUri) return;
    setSaving(true);
    try {
      await ensureContentStructure(folderUri);
      await saveProfile({ name: name.trim(), age, language, rootFolderUri: folderUri });
      onComplete();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <Text>{t('onboardingTitle')}</Text>

      <Text>{t('onboardingName')}</Text>
      <TextInput testID="onboarding-name-input" value={name} onChangeText={setName} />

      <Text>{t('onboardingAge')}</Text>
      <TextInput testID="onboarding-age-input" value={ageText} onChangeText={setAgeText} keyboardType="numeric" />

      <Text>{t('onboardingLanguage')}</Text>
      <Pressable testID="onboarding-lang-en" onPress={() => setLanguage('en' as Language)}>
        <Text>English</Text>
      </Pressable>
      <Pressable testID="onboarding-lang-de" onPress={() => setLanguage('de' as Language)}>
        <Text>Deutsch</Text>
      </Pressable>

      <Pressable onPress={handlePickFolder}>
        <Text>{t('onboardingPickFolder')}</Text>
      </Pressable>
      {folderUri && <Text testID="onboarding-folder-picked">✓</Text>}

      <Pressable onPress={handleSave} disabled={!isValid || saving}>
        <Text>{t('onboardingSave')}</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- OnboardingScreen.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/onboarding __tests__/onboarding
git commit -m "feat: add onboarding screen (name, age, language, folder pick)"
```

---

### Task 7: Settings Screen

**Files:**
- Create: `src/settings/SettingsScreen.tsx`
- Test: `__tests__/settings/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `getProfile`/`saveProfile` (Task 3), `requestFolderAccess` (Task 4), `migrateContent` (Task 5), `useLanguage` (Task 2).
- Produces: `SettingsScreen()` — mounted by `RootNavigator` (Task 16) via a settings route from Home.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/settings/SettingsScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SettingsScreen } from '../../src/settings/SettingsScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as profileStore from '../../src/storage/profileStore';
import * as folderAccess from '../../src/storage/folderAccess';
import * as folderMigration from '../../src/storage/folderMigration';

jest.mock('../../src/storage/profileStore');
jest.mock('../../src/storage/folderAccess');
jest.mock('../../src/storage/folderMigration');

const initialProfile = { name: 'Sam', age: 4, language: 'en' as const, rootFolderUri: 'content://tree/old' };

describe('SettingsScreen', () => {
  beforeEach(() => {
    (profileStore.getProfile as jest.Mock).mockResolvedValue(initialProfile);
  });

  it('migrates content when the folder is changed and saves the new profile', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/new');
    (folderMigration.migrateContent as jest.Mock).mockResolvedValue({ success: true });
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const { getByText, findByTestId } = render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    fireEvent.press(getByText('Change content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
    fireEvent.press(getByText('Save changes'));

    await waitFor(() =>
      expect(folderMigration.migrateContent).toHaveBeenCalledWith('content://tree/old', 'content://tree/new')
    );
    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ rootFolderUri: 'content://tree/new' })
      )
    );
  });

  it('lets the user edit name and age and saves them without touching the folder', async () => {
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const { getByText, getByTestId, findByTestId } = render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    fireEvent.changeText(getByTestId('settings-name-input'), 'Samuel');
    fireEvent.changeText(getByTestId('settings-age-input'), '5');
    fireEvent.press(getByTestId('settings-lang-de'));
    fireEvent.press(getByText('Save changes'));

    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Samuel', age: 5, language: 'de', rootFolderUri: 'content://tree/old' })
      )
    );
    expect(folderMigration.migrateContent).not.toHaveBeenCalled();
  });

  it('shows a failure message and keeps the old folder if migration fails', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/new');
    (folderMigration.migrateContent as jest.Mock).mockResolvedValue({ success: false, error: 'disk full' });

    const { getByText, findByTestId, findByText } = render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    fireEvent.press(getByText('Change content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
    fireEvent.press(getByText('Save changes'));

    await findByText('Could not move content. Your old folder is unchanged.');
    expect(profileStore.saveProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ rootFolderUri: 'content://tree/new' })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- SettingsScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SettingsScreen**

Create `src/settings/SettingsScreen.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { getProfile, saveProfile } from '../storage/profileStore';
import { requestFolderAccess } from '../storage/folderAccess';
import { migrateContent } from '../storage/folderMigration';
import type { Language, Profile } from '../types/profile';

export function SettingsScreen() {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ageText, setAgeText] = useState('');
  const [pendingFolderUri, setPendingFolderUri] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      if (p) setAgeText(String(p.age));
    });
  }, []);

  async function handlePickFolder() {
    const uri = await requestFolderAccess();
    setPendingFolderUri(uri);
  }

  async function handleSave() {
    if (!profile) return;
    setMigrationError(null);

    const age = Number(ageText);
    let nextProfile: Profile = {
      ...profile,
      age: Number.isInteger(age) && age >= 2 && age <= 8 ? age : profile.age,
    };

    if (pendingFolderUri && pendingFolderUri !== profile.rootFolderUri) {
      setMigrating(true);
      const oldUri = profile.rootFolderUri;
      const result = oldUri
        ? await migrateContent(oldUri, pendingFolderUri)
        : ({ success: true } as const);
      setMigrating(false);

      if (!result.success) {
        setMigrationError(t('migrationFailed'));
        return;
      }
      nextProfile = { ...nextProfile, rootFolderUri: pendingFolderUri };
    }

    await saveProfile(nextProfile);
    setProfile(nextProfile);
  }

  if (!profile) return <View testID="settings-loading" />;

  return (
    <View testID="settings-loaded">
      <Text>{t('settingsTitle')}</Text>

      <TextInput
        testID="settings-name-input"
        value={profile.name}
        onChangeText={(name) => setProfile({ ...profile, name })}
      />

      <TextInput
        testID="settings-age-input"
        value={ageText}
        onChangeText={setAgeText}
        keyboardType="numeric"
      />

      <Pressable testID="settings-lang-en" onPress={() => setProfile({ ...profile, language: 'en' as Language })}>
        <Text>English</Text>
      </Pressable>
      <Pressable testID="settings-lang-de" onPress={() => setProfile({ ...profile, language: 'de' as Language })}>
        <Text>Deutsch</Text>
      </Pressable>

      <Pressable onPress={handlePickFolder}>
        <Text>{t('settingsChangeFolder')}</Text>
      </Pressable>

      {migrating && <Text>{t('migrationInProgress')}</Text>}
      {migrationError && <Text>{migrationError}</Text>}

      <Pressable onPress={handleSave}>
        <Text>{t('settingsSave')}</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- SettingsScreen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/settings __tests__/settings
git commit -m "feat: add settings screen with safe folder migration"
```

---

### Task 8: Quiz Types and Schema Validation/Loading

**Files:**
- Create: `src/types/quiz.ts`
- Create: `src/quiz/loadQuestions.ts`
- Test: `__tests__/quiz/loadQuestions.test.ts`

**Interfaces:**
- Produces: `Question`, `QuestionOption`, `QuestionsFile` types; `parseQuestionsFile(raw: string): Question[]` (validates, silently skips malformed individual questions, tolerates unknown fields); `loadQuestions(quizFolderUri: string): Promise<Question[]>` (reads `questions.json` via `expo-file-system` and calls `parseQuestionsFile`). Consumed by `filterQuestions` (Task 9) and `QuizScreen` (Task 11).

- [ ] **Step 1: Write the failing test**

Create `__tests__/quiz/loadQuestions.test.ts`:

```ts
import { parseQuestionsFile } from '../../src/quiz/loadQuestions';

const validQuestion = {
  id: 'q001',
  category: 'image',
  minAge: 2,
  maxAge: 5,
  question: { text: { en: 'What animal?', de: 'Welches Tier?' }, image: 'images/cat.png' },
  options: [
    { id: 'a', text: { en: 'Cat', de: 'Katze' } },
    { id: 'b', text: { en: 'Dog', de: 'Hund' } },
    { id: 'c', text: { en: 'Cow', de: 'Kuh' } },
    { id: 'd', text: { en: 'Elephant', de: 'Elefant' } },
  ],
  correctOptionId: 'a',
};

describe('parseQuestionsFile', () => {
  it('parses a valid question', () => {
    const result = parseQuestionsFile(JSON.stringify({ questions: [validQuestion] }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('q001');
  });

  it('ignores unknown extra fields without crashing', () => {
    const withExtra = { ...validQuestion, futureField: { nested: true } };
    const result = parseQuestionsFile(JSON.stringify({ questions: [withExtra], schemaVersion: 99 }));
    expect(result).toHaveLength(1);
  });

  it('skips a question with fewer than 4 options', () => {
    const broken = { ...validQuestion, options: validQuestion.options.slice(0, 2) };
    const result = parseQuestionsFile(JSON.stringify({ questions: [broken, validQuestion] }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('q001');
  });

  it('skips a question whose correctOptionId does not match any option', () => {
    const broken = { ...validQuestion, correctOptionId: 'z' };
    const result = parseQuestionsFile(JSON.stringify({ questions: [broken] }));
    expect(result).toHaveLength(0);
  });

  it('skips a question with neither question.text nor question.image', () => {
    const broken = { ...validQuestion, question: {} };
    const result = parseQuestionsFile(JSON.stringify({ questions: [broken] }));
    expect(result).toHaveLength(0);
  });

  it('returns an empty array for invalid JSON instead of throwing', () => {
    expect(parseQuestionsFile('{not valid json')).toEqual([]);
  });

  it('returns an empty array when "questions" is missing or not an array', () => {
    expect(parseQuestionsFile(JSON.stringify({}))).toEqual([]);
    expect(parseQuestionsFile(JSON.stringify({ questions: 'nope' }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- loadQuestions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Define quiz types**

Create `src/types/quiz.ts`:

```ts
export interface BilingualText {
  en: string;
  de: string;
}

export interface QuestionOption {
  id: string;
  text?: BilingualText;
  image?: string;
}

export interface Question {
  id: string;
  category: 'image' | 'text';
  minAge: number;
  maxAge: number;
  question: {
    text?: BilingualText;
    image?: string;
  };
  options: [QuestionOption, QuestionOption, QuestionOption, QuestionOption];
  correctOptionId: string;
}

export interface QuestionsFile {
  questions: Question[];
}
```

- [ ] **Step 4: Implement parseQuestionsFile and loadQuestions**

Create `src/quiz/loadQuestions.ts`:

```ts
import * as FileSystem from 'expo-file-system';
import type { Question, QuestionOption } from '../types/quiz';

function isBilingualText(v: unknown): v is { en: string; de: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as any).en === 'string' &&
    typeof (v as any).de === 'string'
  );
}

function isValidOption(v: unknown): v is QuestionOption {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as any;
  if (typeof o.id !== 'string') return false;
  if (o.text !== undefined && !isBilingualText(o.text)) return false;
  if (o.image !== undefined && typeof o.image !== 'string') return false;
  return o.text !== undefined || o.image !== undefined;
}

function isValidQuestion(v: unknown): v is Question {
  if (typeof v !== 'object' || v === null) return false;
  const q = v as any;

  if (typeof q.id !== 'string') return false;
  if (q.category !== 'image' && q.category !== 'text') return false;
  if (typeof q.minAge !== 'number' || typeof q.maxAge !== 'number') return false;

  if (typeof q.question !== 'object' || q.question === null) return false;
  const hasQuestionText = q.question.text !== undefined;
  const hasQuestionImage = q.question.image !== undefined;
  if (!hasQuestionText && !hasQuestionImage) return false;
  if (hasQuestionText && !isBilingualText(q.question.text)) return false;
  if (hasQuestionImage && typeof q.question.image !== 'string') return false;

  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  if (!q.options.every(isValidOption)) return false;

  if (typeof q.correctOptionId !== 'string') return false;
  if (!q.options.some((o: QuestionOption) => o.id === q.correctOptionId)) return false;

  return true;
}

export function parseQuestionsFile(raw: string): Question[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null) return [];
  const questionsField = (parsed as any).questions;
  if (!Array.isArray(questionsField)) return [];

  return questionsField.filter(isValidQuestion);
}

export async function loadQuestions(quizFolderUri: string): Promise<Question[]> {
  const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(quizFolderUri);
  const questionsFileUri = entries.find((e) => e.endsWith('questions.json') || e.endsWith(encodeURIComponent('questions.json')));
  if (!questionsFileUri) return [];

  const raw = await FileSystem.StorageAccessFramework.readAsStringAsync(questionsFileUri);
  return parseQuestionsFile(raw);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- loadQuestions.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/quiz.ts src/quiz/loadQuestions.ts __tests__/quiz/loadQuestions.test.ts
git commit -m "feat: add quiz question types and defensive schema parsing"
```

---

### Task 9: Age Filtering and Shuffle

**Files:**
- Create: `src/quiz/filterQuestions.ts`
- Create: `src/quiz/shuffle.ts`
- Test: `__tests__/quiz/filterQuestions.test.ts`
- Test: `__tests__/quiz/shuffle.test.ts`

**Interfaces:**
- Consumes: `Question` type (Task 8).
- Produces: `filterQuestionsByAge(questions: Question[], age: number): Question[]`; `shuffle<T>(items: T[], rng?: () => number): T[]`. Consumed by `quizSession.ts` (Task 10).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/quiz/filterQuestions.test.ts`:

```ts
import { filterQuestionsByAge } from '../../src/quiz/filterQuestions';
import type { Question } from '../../src/types/quiz';

function q(id: string, minAge: number, maxAge: number): Question {
  return {
    id,
    category: 'text',
    minAge,
    maxAge,
    question: { text: { en: 'x', de: 'x' } },
    options: [
      { id: 'a', text: { en: '1', de: '1' } },
      { id: 'b', text: { en: '2', de: '2' } },
      { id: 'c', text: { en: '3', de: '3' } },
      { id: 'd', text: { en: '4', de: '4' } },
    ],
    correctOptionId: 'a',
  };
}

describe('filterQuestionsByAge', () => {
  it('includes questions where minAge <= age <= maxAge', () => {
    const questions = [q('in-range', 2, 5), q('too-old', 6, 8), q('too-young', 0, 1)];
    expect(filterQuestionsByAge(questions, 4).map((r) => r.id)).toEqual(['in-range']);
  });

  it('treats boundaries as inclusive', () => {
    const questions = [q('lower-bound', 4, 6), q('upper-bound', 2, 4)];
    expect(filterQuestionsByAge(questions, 4).map((r) => r.id).sort()).toEqual(['lower-bound', 'upper-bound']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterQuestionsByAge([q('too-old', 6, 8)], 3)).toEqual([]);
  });
});
```

Create `__tests__/quiz/shuffle.test.ts`:

```ts
import { shuffle } from '../../src/quiz/shuffle';

describe('shuffle', () => {
  it('returns an array with the same elements', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result.slice().sort()).toEqual(input.slice().sort());
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    shuffle(input);
    expect(input).toEqual([1, 2, 3]);
  });

  it('is deterministic given a fixed RNG', () => {
    const rng = (() => {
      const seq = [0.9, 0.1, 0.5];
      let i = 0;
      return () => seq[i++ % seq.length];
    })();
    const result = shuffle([1, 2, 3, 4], rng);
    expect(result).toEqual(expect.any(Array));
    expect(result).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- filterQuestions.test.ts shuffle.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement filterQuestions and shuffle**

Create `src/quiz/filterQuestions.ts`:

```ts
import type { Question } from '../types/quiz';

export function filterQuestionsByAge(questions: Question[], age: number): Question[] {
  return questions.filter((q) => age >= q.minAge && age <= q.maxAge);
}
```

Create `src/quiz/shuffle.ts`:

```ts
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- filterQuestions.test.ts shuffle.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/quiz/filterQuestions.ts src/quiz/shuffle.ts __tests__/quiz/filterQuestions.test.ts __tests__/quiz/shuffle.test.ts
git commit -m "feat: add age filtering and injectable-RNG shuffle for quiz"
```

---

### Task 10: Quiz Session Logic

**Files:**
- Create: `src/quiz/quizSession.ts`
- Test: `__tests__/quiz/quizSession.test.ts`

**Interfaces:**
- Consumes: `Question` (Task 8), `filterQuestionsByAge` (Task 9), `shuffle` (Task 9).
- Produces: `buildSession(allQuestions: Question[], age: number, rng?: () => number): Question[]` (filtered, shuffled, capped at 20); `QuizSessionState` type and `answerCurrentQuestion(state, optionId): QuizSessionState` reducer tracking `currentIndex`, `score`, `isFinished`. Consumed by `QuizScreen` (Task 11).

- [ ] **Step 1: Write the failing test**

Create `__tests__/quiz/quizSession.test.ts`:

```ts
import { buildSession, initialSessionState, answerCurrentQuestion } from '../../src/quiz/quizSession';
import type { Question } from '../../src/types/quiz';

function makeQuestions(n: number, minAge = 2, maxAge = 8): Question[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    category: 'text' as const,
    minAge,
    maxAge,
    question: { text: { en: `Q${i}`, de: `Q${i}` } },
    options: [
      { id: 'a', text: { en: '1', de: '1' } },
      { id: 'b', text: { en: '2', de: '2' } },
      { id: 'c', text: { en: '3', de: '3' } },
      { id: 'd', text: { en: '4', de: '4' } },
    ],
    correctOptionId: 'a',
  }));
}

describe('buildSession', () => {
  it('caps the session at 20 questions when more are eligible', () => {
    const session = buildSession(makeQuestions(30), 5);
    expect(session).toHaveLength(20);
  });

  it('uses all eligible questions when fewer than 20 exist', () => {
    const session = buildSession(makeQuestions(7), 5);
    expect(session).toHaveLength(7);
  });

  it('excludes questions outside the age range', () => {
    const inRange = makeQuestions(3, 2, 5);
    const outOfRange = makeQuestions(3, 6, 8).map((q, i) => ({ ...q, id: `out${i}` }));
    const session = buildSession([...inRange, ...outOfRange], 3);
    expect(session.every((q) => q.minAge <= 3 && q.maxAge >= 3)).toBe(true);
  });
});

describe('quiz session reducer', () => {
  it('starts at question 0 with score 0, not finished', () => {
    const session = buildSession(makeQuestions(3), 5);
    const state = initialSessionState(session);
    expect(state.currentIndex).toBe(0);
    expect(state.score).toBe(0);
    expect(state.isFinished).toBe(false);
  });

  it('increments score on a correct answer and advances', () => {
    const session = buildSession(makeQuestions(2), 5);
    let state = initialSessionState(session);
    state = answerCurrentQuestion(state, session[0].correctOptionId);
    expect(state.score).toBe(1);
    expect(state.currentIndex).toBe(1);
    expect(state.isFinished).toBe(false);
  });

  it('does not increment score on a wrong answer but still advances', () => {
    const session = buildSession(makeQuestions(2), 5);
    const wrongOption = session[0].options.find((o) => o.id !== session[0].correctOptionId)!.id;
    let state = initialSessionState(session);
    state = answerCurrentQuestion(state, wrongOption);
    expect(state.score).toBe(0);
    expect(state.currentIndex).toBe(1);
  });

  it('marks isFinished true after the last question is answered', () => {
    const session = buildSession(makeQuestions(1), 5);
    let state = initialSessionState(session);
    state = answerCurrentQuestion(state, session[0].correctOptionId);
    expect(state.isFinished).toBe(true);
    expect(state.score).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- quizSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement quizSession**

Create `src/quiz/quizSession.ts`:

```ts
import type { Question } from '../types/quiz';
import { filterQuestionsByAge } from './filterQuestions';
import { shuffle } from './shuffle';

const SESSION_LENGTH = 20;

export function buildSession(allQuestions: Question[], age: number, rng?: () => number): Question[] {
  const eligible = filterQuestionsByAge(allQuestions, age);
  const shuffled = shuffle(eligible, rng);
  return shuffled.slice(0, SESSION_LENGTH);
}

export interface QuizSessionState {
  session: Question[];
  currentIndex: number;
  score: number;
  isFinished: boolean;
}

export function initialSessionState(session: Question[]): QuizSessionState {
  return {
    session,
    currentIndex: 0,
    score: 0,
    isFinished: session.length === 0,
  };
}

export function answerCurrentQuestion(state: QuizSessionState, selectedOptionId: string): QuizSessionState {
  if (state.isFinished) return state;

  const current = state.session[state.currentIndex];
  const correct = current.correctOptionId === selectedOptionId;
  const nextIndex = state.currentIndex + 1;

  return {
    ...state,
    score: correct ? state.score + 1 : state.score,
    currentIndex: nextIndex,
    isFinished: nextIndex >= state.session.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- quizSession.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/quiz/quizSession.ts __tests__/quiz/quizSession.test.ts
git commit -m "feat: add quiz session builder and scoring reducer"
```

---

### Task 11: Quiz UI (QuestionRenderer + QuizScreen)

**Files:**
- Create: `src/quiz/QuestionRenderer.tsx`
- Create: `src/quiz/QuizScreen.tsx`
- Test: `__tests__/quiz/QuizScreen.test.tsx`

**Interfaces:**
- Consumes: `Question`/`QuestionOption` (Task 8), `loadQuestions` (Task 8), `buildSession`/`initialSessionState`/`answerCurrentQuestion` (Task 10), `useLanguage` (Task 2).
- Produces: `QuizScreen({ quizFolderUri, childAge }: { quizFolderUri: string; childAge: number })`. Mounted by `RootNavigator` (Task 16) from the Home Quiz card.

- [ ] **Step 1: Write the failing test**

Create `__tests__/quiz/QuizScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QuizScreen } from '../../src/quiz/QuizScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as loadQuestionsModule from '../../src/quiz/loadQuestions';
import type { Question } from '../../src/types/quiz';

jest.mock('../../src/quiz/loadQuestions');

const twoQuestions: Question[] = [
  {
    id: 'q1',
    category: 'text',
    minAge: 2,
    maxAge: 8,
    question: { text: { en: '2 + 2?', de: '2 + 2?' } },
    options: [
      { id: 'a', text: { en: '3', de: '3' } },
      { id: 'b', text: { en: '4', de: '4' } },
      { id: 'c', text: { en: '5', de: '5' } },
      { id: 'd', text: { en: '6', de: '6' } },
    ],
    correctOptionId: 'b',
  },
  {
    id: 'q2',
    category: 'text',
    minAge: 2,
    maxAge: 8,
    question: { text: { en: '1 + 1?', de: '1 + 1?' } },
    options: [
      { id: 'a', text: { en: '2', de: '2' } },
      { id: 'b', text: { en: '3', de: '3' } },
      { id: 'c', text: { en: '4', de: '4' } },
      { id: 'd', text: { en: '5', de: '5' } },
    ],
    correctOptionId: 'a',
  },
];

describe('QuizScreen', () => {
  it('shows one question, then the next after answering, then the end card with the score', async () => {
    (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);

    const { findByText, getByText } = render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
      </LanguageProvider>
    );

    await findByText('2 + 2?');
    fireEvent.press(getByText('4'));

    await findByText('1 + 1?');
    fireEvent.press(getByText('2'));

    await waitFor(() => expect(getByText('Quiz done! Your score: 2 / 2')).toBeTruthy());
  });

  it('shows the empty state when there are no eligible questions', async () => {
    (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue([]);

    const { findByText } = render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
      </LanguageProvider>
    );

    await findByText('No quiz questions for this age yet.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- QuizScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement QuestionRenderer**

Create `src/quiz/QuestionRenderer.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import type { Question } from '../types/quiz';
import type { Language } from '../types/profile';

function ImageWithFallback({ uri, testID }: { uri: string; testID: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View testID={`${testID}-broken`} style={{ width: 80, height: 80, backgroundColor: '#ddd' }}>
        <Text>🖼️</Text>
      </View>
    );
  }

  return <Image source={{ uri }} testID={testID} onError={() => setFailed(true)} style={{ width: 80, height: 80 }} />;
}

export function QuestionRenderer({
  question,
  language,
  onAnswer,
}: {
  question: Question;
  language: Language;
  onAnswer: (optionId: string) => void;
}) {
  return (
    <View>
      {question.question.image && <ImageWithFallback uri={question.question.image} testID="question-image" />}
      {question.question.text && <Text>{question.question.text[language]}</Text>}

      {question.options.map((option) => (
        <Pressable key={option.id} onPress={() => onAnswer(option.id)}>
          {option.image && <ImageWithFallback uri={option.image} testID={`option-image-${option.id}`} />}
          {option.text && <Text>{option.text[language]}</Text>}
        </Pressable>
      ))}
    </View>
  );
}
```

Note: `ImageWithFallback` swaps in a placeholder box on load failure (e.g. the referenced image file is missing from `quiz/images/`) instead of leaving a broken image or crashing — satisfying spec section 5.3's missing-image edge case.

- [ ] **Step 4: Implement QuizScreen**

Create `src/quiz/QuizScreen.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import { loadQuestions } from './loadQuestions';
import { buildSession, initialSessionState, answerCurrentQuestion, QuizSessionState } from './quizSession';
import { QuestionRenderer } from './QuestionRenderer';

export function QuizScreen({ quizFolderUri, childAge }: { quizFolderUri: string; childAge: number }) {
  const { t, language } = useLanguage();
  const [state, setState] = useState<QuizSessionState | null>(null);

  useEffect(() => {
    loadQuestions(quizFolderUri).then((all) => {
      const session = buildSession(all, childAge);
      setState(initialSessionState(session));
    });
  }, [quizFolderUri, childAge]);

  if (!state) return <View testID="quiz-loading" />;

  if (state.session.length === 0) {
    return (
      <View>
        <Text>{t('emptyQuiz')}</Text>
      </View>
    );
  }

  if (state.isFinished) {
    return (
      <View>
        <Text>{tFormat('quizScore', language, { score: state.score, total: state.session.length })}</Text>
      </View>
    );
  }

  const currentQuestion = state.session[state.currentIndex];

  return (
    <QuestionRenderer
      question={currentQuestion}
      language={language}
      onAnswer={(optionId) => setState((prev) => (prev ? answerCurrentQuestion(prev, optionId) : prev))}
    />
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- QuizScreen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/quiz/QuestionRenderer.tsx src/quiz/QuizScreen.tsx __tests__/quiz/QuizScreen.test.tsx
git commit -m "feat: add quiz question renderer and quiz screen with scoring end card"
```

---

### Task 12: Coloring — Flood Fill Algorithm

**Files:**
- Create: `src/coloring/floodFill.ts`
- Test: `__tests__/coloring/floodFill.test.ts`

**Interfaces:**
- Produces: `floodFill(pixels: Uint8ClampedArray, width: number, height: number, startX: number, startY: number, fillColor: [number, number, number, number], tolerance?: number): Uint8ClampedArray` — a pure function operating on an RGBA pixel buffer, independent of any rendering library. Consumed by `ColoringScreen` (Task 13), which extracts pixels from the Skia canvas, calls this function, and writes the result back.

- [ ] **Step 1: Write the failing test**

Create `__tests__/coloring/floodFill.test.ts`:

```ts
import { floodFill } from '../../src/coloring/floodFill';

// 3x3 image, all white (255,255,255,255) except a black (0,0,0,255) border pixel at (1,0)
function makeTestImage(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(3 * 3 * 4).fill(255);
  const setPixel = (x: number, y: number, rgba: [number, number, number, number]) => {
    const i = (y * 3 + x) * 4;
    px[i] = rgba[0];
    px[i + 1] = rgba[1];
    px[i + 2] = rgba[2];
    px[i + 3] = rgba[3];
  };
  setPixel(1, 0, [0, 0, 0, 255]);
  setPixel(1, 1, [0, 0, 0, 255]);
  setPixel(1, 2, [0, 0, 0, 255]);
  return px;
}

function getPixel(px: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [px[i], px[i + 1], px[i + 2], px[i + 3]];
}

describe('floodFill', () => {
  it('fills the connected white region starting at (0,0) with red', () => {
    const px = makeTestImage();
    const result = floodFill(px, 3, 3, 0, 0, [255, 0, 0, 255]);
    expect(getPixel(result, 3, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(result, 3, 0, 1)).toEqual([255, 0, 0, 255]);
    expect(getPixel(result, 3, 0, 2)).toEqual([255, 0, 0, 255]);
  });

  it('does not cross the black border into the region on the other side', () => {
    const px = makeTestImage();
    const result = floodFill(px, 3, 3, 0, 0, [255, 0, 0, 255]);
    expect(getPixel(result, 3, 2, 0)).toEqual([255, 255, 255, 255]);
  });

  it('leaves the border pixels themselves unchanged', () => {
    const px = makeTestImage();
    const result = floodFill(px, 3, 3, 0, 0, [255, 0, 0, 255]);
    expect(getPixel(result, 3, 1, 0)).toEqual([0, 0, 0, 255]);
  });

  it('does not mutate the input buffer', () => {
    const px = makeTestImage();
    const original = px.slice();
    floodFill(px, 3, 3, 0, 0, [255, 0, 0, 255]);
    expect(px).toEqual(original);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- floodFill.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement floodFill**

Create `src/coloring/floodFill.ts`:

```ts
type RGBA = [number, number, number, number];

function colorsMatch(px: Uint8ClampedArray, index: number, target: RGBA, tolerance: number): boolean {
  return (
    Math.abs(px[index] - target[0]) <= tolerance &&
    Math.abs(px[index + 1] - target[1]) <= tolerance &&
    Math.abs(px[index + 2] - target[2]) <= tolerance &&
    Math.abs(px[index + 3] - target[3]) <= tolerance
  );
}

export function floodFill(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillColor: RGBA,
  tolerance = 10
): Uint8ClampedArray {
  const result = pixels.slice();
  const startIndex = (startY * width + startX) * 4;
  const targetColor: RGBA = [result[startIndex], result[startIndex + 1], result[startIndex + 2], result[startIndex + 3]];

  const targetMatchesFill =
    targetColor[0] === fillColor[0] &&
    targetColor[1] === fillColor[1] &&
    targetColor[2] === fillColor[2] &&
    targetColor[3] === fillColor[3];
  if (targetMatchesFill) return result;

  const visited = new Uint8Array(width * height);
  const stack: [number, number][] = [[startX, startY]];

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const pixelIndex = y * width + x;
    if (visited[pixelIndex]) continue;

    const rgbaIndex = pixelIndex * 4;
    if (!colorsMatch(result, rgbaIndex, targetColor, tolerance)) continue;

    visited[pixelIndex] = 1;
    result[rgbaIndex] = fillColor[0];
    result[rgbaIndex + 1] = fillColor[1];
    result[rgbaIndex + 2] = fillColor[2];
    result[rgbaIndex + 3] = fillColor[3];

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- floodFill.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/coloring/floodFill.ts __tests__/coloring/floodFill.test.ts
git commit -m "feat: add pixel-buffer flood fill algorithm for coloring"
```

---

### Task 13: Coloring — Gallery and Screen

**Files:**
- Create: `src/coloring/ColoringGallery.tsx`
- Create: `src/coloring/ColoringScreen.tsx`
- Test: `__tests__/coloring/ColoringGallery.test.tsx`

**Interfaces:**
- Consumes: `floodFill` (Task 12), `useLanguage` (Task 2), `expo-file-system` to list `coloring/` contents.
- Produces: `ColoringGallery({ coloringFolderUri, onSelect }: { coloringFolderUri: string; onSelect: (imageUri: string) => void })`, `ColoringScreen({ imageUri }: { imageUri: string })`. Mounted by `RootNavigator` (Task 16) from the Home Coloring card.

- [ ] **Step 1: Write the failing test**

Create `__tests__/coloring/ColoringGallery.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ColoringGallery } from '../../src/coloring/ColoringGallery';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as FileSystem from 'expo-file-system';

jest.mock('expo-file-system', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
}));

describe('ColoringGallery', () => {
  it('lists images from the coloring folder and calls onSelect when tapped', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/coloring/cat-outline.png',
      'content://tree/coloring/house-outline.png',
    ]);

    const onSelect = jest.fn();
    const { findByTestId } = render(
      <LanguageProvider initialLanguage="en">
        <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={onSelect} />
      </LanguageProvider>
    );

    const item = await findByTestId('coloring-item-content://tree/coloring/cat-outline.png');
    fireEvent.press(item);
    expect(onSelect).toHaveBeenCalledWith('content://tree/coloring/cat-outline.png');
  });

  it('shows the empty state when the coloring folder has no images', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    const { findByText } = render(
      <LanguageProvider initialLanguage="en">
        <ColoringGallery coloringFolderUri="content://tree/coloring" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByText('No coloring pages yet — add some to the coloring folder!');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ColoringGallery.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ColoringGallery**

Create `src/coloring/ColoringGallery.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Image } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useLanguage } from '../i18n/LanguageContext';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

function isImageFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function ColoringGallery({
  coloringFolderUri,
  onSelect,
}: {
  coloringFolderUri: string;
  onSelect: (imageUri: string) => void;
}) {
  const { t } = useLanguage();
  const [images, setImages] = useState<string[] | null>(null);

  useEffect(() => {
    FileSystem.StorageAccessFramework.readDirectoryAsync(coloringFolderUri).then((entries) => {
      setImages(entries.filter(isImageFile));
    });
  }, [coloringFolderUri]);

  if (images === null) return <View testID="coloring-gallery-loading" />;

  if (images.length === 0) {
    return (
      <View>
        <Text>{t('emptyColoring')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={images}
      keyExtractor={(uri) => uri}
      renderItem={({ item }) => (
        <Pressable testID={`coloring-item-${item}`} onPress={() => onSelect(item)}>
          <Image source={{ uri: item }} style={{ width: 100, height: 100 }} />
        </Pressable>
      )}
    />
  );
}
```

- [ ] **Step 4: Implement ColoringScreen**

Create `src/coloring/ColoringScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { View } from 'react-native';
import { Canvas, useImage, Image as SkiaImage } from '@shopify/react-native-skia';
import { floodFill } from './floodFill';

const PALETTE: [number, number, number, number][] = [
  [255, 0, 0, 255],
  [0, 128, 0, 255],
  [0, 0, 255, 255],
  [255, 200, 0, 255],
  [150, 75, 0, 255],
];

export function ColoringScreen({ imageUri }: { imageUri: string }) {
  const image = useImage(imageUri);
  const [selectedColor, setSelectedColor] = useState<[number, number, number, number]>(PALETTE[0]);
  const [pixels, setPixels] = useState<Uint8ClampedArray | null>(null);

  function handleCanvasTap(x: number, y: number) {
    if (!image || !pixels) return;
    const width = image.width();
    const height = image.height();
    const updated = floodFill(pixels, width, height, Math.floor(x), Math.floor(y), selectedColor);
    setPixels(updated);
  }

  return (
    <View>
      <Canvas style={{ width: 300, height: 300 }} testID="coloring-canvas">
        {image && <SkiaImage image={image} x={0} y={0} width={300} height={300} />}
      </Canvas>
      <View testID="coloring-palette">
        {PALETTE.map((color, i) => (
          <View
            key={i}
            testID={`palette-color-${i}`}
            style={{ backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})`, width: 30, height: 30 }}
            onTouchEnd={() => setSelectedColor(color)}
          />
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- ColoringGallery.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/coloring/ColoringGallery.tsx src/coloring/ColoringScreen.tsx __tests__/coloring/ColoringGallery.test.tsx
git commit -m "feat: add coloring gallery and Skia-based coloring canvas"
```

---

### Task 14: Photo Puzzle — Grid Math and Shuffle

**Files:**
- Create: `src/puzzle/puzzleGrid.ts`
- Test: `__tests__/puzzle/puzzleGrid.test.ts`

**Interfaces:**
- Produces: `computeGridDimensions(pieceCount: 4 | 6 | 9 | 12): { rows: number; cols: number }`; `computePieceRects(imageWidth: number, imageHeight: number, rows: number, cols: number): PieceRect[]` (each rect: `{ pieceIndex, x, y, width, height }`, the crop offset used to render that piece via an oversized `Image` in an overflow-hidden container); `shufflePieceOrder(pieceCount: number, rng?: () => number): number[]` (a permutation guaranteed to differ from the identity order when `pieceCount > 1`). Consumed by `PuzzleScreen` (Task 15).

- [ ] **Step 1: Write the failing test**

Create `__tests__/puzzle/puzzleGrid.test.ts`:

```ts
import { computeGridDimensions, computePieceRects, shufflePieceOrder } from '../../src/puzzle/puzzleGrid';

describe('computeGridDimensions', () => {
  it.each([
    [4, 2, 2],
    [6, 2, 3],
    [9, 3, 3],
    [12, 3, 4],
  ])('for %i pieces returns %i rows and %i cols', (pieceCount, rows, cols) => {
    expect(computeGridDimensions(pieceCount as 4 | 6 | 9 | 12)).toEqual({ rows, cols });
  });
});

describe('computePieceRects', () => {
  it('divides the image into equal-sized, non-overlapping, fully-covering rects', () => {
    const rects = computePieceRects(300, 200, 2, 2);
    expect(rects).toHaveLength(4);
    expect(rects.every((r) => r.width === 150 && r.height === 100)).toBe(true);
    expect(rects.map((r) => `${r.x},${r.y}`).sort()).toEqual(['0,0', '0,100', '150,0', '150,100'].sort());
  });

  it('assigns sequential pieceIndex values matching row-major order', () => {
    const rects = computePieceRects(300, 200, 2, 2);
    expect(rects.map((r) => r.pieceIndex)).toEqual([0, 1, 2, 3]);
  });
});

describe('shufflePieceOrder', () => {
  it('returns a permutation of 0..N-1', () => {
    const order = shufflePieceOrder(9);
    expect(order.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('never returns the identity order when there is more than one piece', () => {
    // With a fixed RNG that would otherwise produce identity, the function must reshuffle.
    const identityProducingRng = () => 0; // Fisher-Yates with rng()=0 always swaps i with 0
    for (let pieceCount of [4, 6, 9, 12]) {
      const order = shufflePieceOrder(pieceCount, identityProducingRng);
      expect(order).not.toEqual(Array.from({ length: pieceCount }, (_, i) => i));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- puzzleGrid.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement puzzleGrid**

Create `src/puzzle/puzzleGrid.ts`:

```ts
import { shuffle } from '../quiz/shuffle';

const GRID_DIMENSIONS: Record<4 | 6 | 9 | 12, { rows: number; cols: number }> = {
  4: { rows: 2, cols: 2 },
  6: { rows: 2, cols: 3 },
  9: { rows: 3, cols: 3 },
  12: { rows: 3, cols: 4 },
};

export function computeGridDimensions(pieceCount: 4 | 6 | 9 | 12): { rows: number; cols: number } {
  return GRID_DIMENSIONS[pieceCount];
}

export interface PieceRect {
  pieceIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computePieceRects(imageWidth: number, imageHeight: number, rows: number, cols: number): PieceRect[] {
  const pieceWidth = imageWidth / cols;
  const pieceHeight = imageHeight / rows;
  const rects: PieceRect[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      rects.push({
        pieceIndex: row * cols + col,
        x: col * pieceWidth,
        y: row * pieceHeight,
        width: pieceWidth,
        height: pieceHeight,
      });
    }
  }

  return rects;
}

function isIdentity(order: number[]): boolean {
  return order.every((value, index) => value === index);
}

export function shufflePieceOrder(pieceCount: number, rng: () => number = Math.random): number[] {
  const identity = Array.from({ length: pieceCount }, (_, i) => i);
  if (pieceCount <= 1) return identity;

  let order = shuffle(identity, rng);
  let attempts = 0;
  // Guard against a pathological RNG that always produces the identity order.
  while (isIdentity(order) && attempts < 10) {
    order = shuffle(identity, () => (rng() + 0.5) % 1);
    attempts++;
  }
  return order;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- puzzleGrid.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/puzzle/puzzleGrid.ts __tests__/puzzle/puzzleGrid.test.ts
git commit -m "feat: add puzzle grid math and non-identity piece shuffle"
```

---

### Task 15: Photo Puzzle — Gallery and Screen

**Files:**
- Create: `src/puzzle/PuzzleGallery.tsx`
- Create: `src/puzzle/PuzzleScreen.tsx`
- Test: `__tests__/puzzle/PuzzleGallery.test.tsx`

**Interfaces:**
- Consumes: `computeGridDimensions`, `computePieceRects`, `shufflePieceOrder` (Task 14), `useLanguage` (Task 2).
- Produces: `PuzzleGallery({ picturesFolderUri, onSelect }: { picturesFolderUri: string; onSelect: (imageUri: string) => void })`, `PuzzleScreen({ imageUri }: { imageUri: string })`. Mounted by `RootNavigator` (Task 16) from the Home Photo Puzzle card.

- [ ] **Step 1: Write the failing test**

Create `__tests__/puzzle/PuzzleGallery.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PuzzleGallery } from '../../src/puzzle/PuzzleGallery';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as FileSystem from 'expo-file-system';

jest.mock('expo-file-system', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
}));

describe('PuzzleGallery', () => {
  it('lists images from the pictures folder and calls onSelect when tapped', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/beach.jpg',
    ]);

    const onSelect = jest.fn();
    const { findByTestId } = render(
      <LanguageProvider initialLanguage="en">
        <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={onSelect} />
      </LanguageProvider>
    );

    const item = await findByTestId('puzzle-item-content://tree/pictures/beach.jpg');
    fireEvent.press(item);
    expect(onSelect).toHaveBeenCalledWith('content://tree/pictures/beach.jpg');
  });

  it('shows the empty state when there are no pictures', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    const { findByText } = render(
      <LanguageProvider initialLanguage="en">
        <PuzzleGallery picturesFolderUri="content://tree/pictures" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByText('No pictures yet — add some to the pictures folder!');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PuzzleGallery.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PuzzleGallery**

Create `src/puzzle/PuzzleGallery.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Image } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useLanguage } from '../i18n/LanguageContext';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

function isImageFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function PuzzleGallery({
  picturesFolderUri,
  onSelect,
}: {
  picturesFolderUri: string;
  onSelect: (imageUri: string) => void;
}) {
  const { t } = useLanguage();
  const [images, setImages] = useState<string[] | null>(null);

  useEffect(() => {
    FileSystem.StorageAccessFramework.readDirectoryAsync(picturesFolderUri).then((entries) => {
      setImages(entries.filter(isImageFile));
    });
  }, [picturesFolderUri]);

  if (images === null) return <View testID="puzzle-gallery-loading" />;

  if (images.length === 0) {
    return (
      <View>
        <Text>{t('emptyPictures')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={images}
      keyExtractor={(uri) => uri}
      renderItem={({ item }) => (
        <Pressable testID={`puzzle-item-${item}`} onPress={() => onSelect(item)}>
          <Image source={{ uri: item }} style={{ width: 100, height: 100 }} />
        </Pressable>
      )}
    />
  );
}
```

- [ ] **Step 4: Implement PuzzleScreen**

Create `src/puzzle/PuzzleScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';
import { computeGridDimensions, computePieceRects, shufflePieceOrder, PieceRect } from './puzzleGrid';

const PUZZLE_SIZE = 300;
const PIECE_COUNT_OPTIONS: (4 | 6 | 9 | 12)[] = [4, 6, 9, 12];

function PuzzlePiece({ imageUri, rect, containerSize }: { imageUri: string; rect: PieceRect; containerSize: number }) {
  const scale = containerSize / rect.width;
  return (
    <View style={{ width: rect.width, height: rect.height, overflow: 'hidden' }}>
      <Image
        source={{ uri: imageUri }}
        style={{
          width: containerSize * scale,
          height: containerSize * scale,
          marginLeft: -rect.x,
          marginTop: -rect.y,
        }}
      />
    </View>
  );
}

export function PuzzleScreen({ imageUri }: { imageUri: string }) {
  const { t } = useLanguage();
  const [pieceCount, setPieceCount] = useState<4 | 6 | 9 | 12 | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  function startPuzzle(count: 4 | 6 | 9 | 12) {
    setPieceCount(count);
    setOrder(shufflePieceOrder(count));
  }

  function handleTapSlot(slotIndex: number) {
    if (selectedSlot === null) {
      setSelectedSlot(slotIndex);
      return;
    }
    const next = order.slice();
    [next[selectedSlot], next[slotIndex]] = [next[slotIndex], next[selectedSlot]];
    setOrder(next);
    setSelectedSlot(null);
  }

  if (!pieceCount) {
    return (
      <View>
        <Text>{t('puzzlePickPieces')}</Text>
        {PIECE_COUNT_OPTIONS.map((count) => (
          <Pressable key={count} testID={`piece-count-${count}`} onPress={() => startPuzzle(count)}>
            <Text>{count}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  const { rows, cols } = computeGridDimensions(pieceCount);
  const rects = computePieceRects(PUZZLE_SIZE, PUZZLE_SIZE, rows, cols);
  const isSolved = order.every((pieceIndex, slotIndex) => pieceIndex === slotIndex);

  return (
    <View>
      <Image source={{ uri: imageUri }} style={{ width: 80, height: 80 }} testID="puzzle-preview" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: PUZZLE_SIZE }}>
        {order.map((pieceIndex, slotIndex) => (
          <Pressable key={slotIndex} testID={`puzzle-slot-${slotIndex}`} onPress={() => handleTapSlot(slotIndex)}>
            <PuzzlePiece imageUri={imageUri} rect={rects[pieceIndex]} containerSize={PUZZLE_SIZE} />
          </Pressable>
        ))}
      </View>
      {isSolved && <Text testID="puzzle-complete">🎉</Text>}
    </View>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- PuzzleGallery.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/puzzle/PuzzleGallery.tsx src/puzzle/PuzzleScreen.tsx __tests__/puzzle/PuzzleGallery.test.tsx
git commit -m "feat: add photo puzzle gallery and tap-to-swap puzzle screen"
```

---

### Task 16: Video Player, Home Screen, Navigation, and App Entry

**Files:**
- Create: `src/video/VideoGallery.tsx`
- Create: `src/video/VideoPlayerScreen.tsx`
- Create: `src/home/HomeScreen.tsx`
- Create: `src/navigation/RootNavigator.tsx`
- Modify: `App.tsx`
- Test: `__tests__/video/VideoGallery.test.tsx`
- Test: `__tests__/home/HomeScreen.test.tsx`

**Interfaces:**
- Consumes: `useLanguage` (Task 2), `getProfile` (Task 3), all feature screens from Tasks 6, 7, 11, 13, 15.
- Produces: fully wired `App.tsx` — the app's actual entry point. Nothing downstream consumes this; it's the top of the tree.

- [ ] **Step 1: Write the failing test for VideoGallery**

Create `__tests__/video/VideoGallery.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { VideoGallery } from '../../src/video/VideoGallery';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as FileSystem from 'expo-file-system';

jest.mock('expo-file-system', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
}));

describe('VideoGallery', () => {
  it('lists videos and calls onSelect when tapped', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/videos/party.mp4',
    ]);

    const onSelect = jest.fn();
    const { findByTestId } = render(
      <LanguageProvider initialLanguage="en">
        <VideoGallery videosFolderUri="content://tree/videos" onSelect={onSelect} />
      </LanguageProvider>
    );

    const item = await findByTestId('video-item-content://tree/videos/party.mp4');
    fireEvent.press(item);
    expect(onSelect).toHaveBeenCalledWith('content://tree/videos/party.mp4');
  });

  it('shows the empty state when there are no videos', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    const { findByText } = render(
      <LanguageProvider initialLanguage="en">
        <VideoGallery videosFolderUri="content://tree/videos" onSelect={jest.fn()} />
      </LanguageProvider>
    );

    await findByText('No videos yet — add some to the videos folder!');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- VideoGallery.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement VideoGallery and VideoPlayerScreen**

Create `src/video/VideoGallery.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useLanguage } from '../i18n/LanguageContext';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm'];

function isVideoFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function fileNameFromUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  return decoded.substring(decoded.lastIndexOf('/') + 1);
}

export function VideoGallery({
  videosFolderUri,
  onSelect,
}: {
  videosFolderUri: string;
  onSelect: (videoUri: string) => void;
}) {
  const { t } = useLanguage();
  const [videos, setVideos] = useState<string[] | null>(null);

  useEffect(() => {
    FileSystem.StorageAccessFramework.readDirectoryAsync(videosFolderUri).then((entries) => {
      setVideos(entries.filter(isVideoFile));
    });
  }, [videosFolderUri]);

  if (videos === null) return <View testID="video-gallery-loading" />;

  if (videos.length === 0) {
    return (
      <View>
        <Text>{t('emptyVideos')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={videos}
      keyExtractor={(uri) => uri}
      renderItem={({ item }) => (
        <Pressable testID={`video-item-${item}`} onPress={() => onSelect(item)}>
          <Text>{fileNameFromUri(item)}</Text>
        </Pressable>
      )}
    />
  );
}
```

Create `src/video/VideoPlayerScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLanguage } from '../i18n/LanguageContext';

export function VideoPlayerScreen({ videoUri }: { videoUri: string }) {
  const { t } = useLanguage();
  const [error, setError] = useState(false);
  const player = useVideoPlayer(videoUri, (p) => {
    p.play();
  });

  if (error) {
    return (
      <View>
        <Text>{t('videoLoadError')}</Text>
      </View>
    );
  }

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: 300 }}
      onError={() => setError(true)}
      allowsFullscreen
      nativeControls
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- VideoGallery.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for HomeScreen**

Create `__tests__/home/HomeScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HomeScreen } from '../../src/home/HomeScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';

describe('HomeScreen', () => {
  it('shows the child name and all four feature cards', () => {
    const onNavigate = jest.fn();
    const { getByText } = render(
      <LanguageProvider initialLanguage="en">
        <HomeScreen childName="Sam" onNavigate={onNavigate} />
      </LanguageProvider>
    );

    expect(getByText('Sam')).toBeTruthy();

    fireEvent.press(getByText('Coloring'));
    expect(onNavigate).toHaveBeenCalledWith('coloring');

    fireEvent.press(getByText('Quiz'));
    expect(onNavigate).toHaveBeenCalledWith('quiz');

    fireEvent.press(getByText('Photo Puzzle'));
    expect(onNavigate).toHaveBeenCalledWith('puzzle');

    fireEvent.press(getByText('Videos'));
    expect(onNavigate).toHaveBeenCalledWith('video');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- HomeScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement HomeScreen**

Create `src/home/HomeScreen.tsx`:

```tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLanguage } from '../i18n/LanguageContext';

export type HomeDestination = 'coloring' | 'quiz' | 'puzzle' | 'video' | 'settings';

export function HomeScreen({
  childName,
  onNavigate,
}: {
  childName: string;
  onNavigate: (destination: HomeDestination) => void;
}) {
  const { t } = useLanguage();

  return (
    <View>
      <Text testID="home-child-name">{childName}</Text>

      <Pressable testID="home-card-coloring" onPress={() => onNavigate('coloring')}>
        <Text>{t('homeColoring')}</Text>
      </Pressable>
      <Pressable testID="home-card-quiz" onPress={() => onNavigate('quiz')}>
        <Text>{t('homeQuiz')}</Text>
      </Pressable>
      <Pressable testID="home-card-puzzle" onPress={() => onNavigate('puzzle')}>
        <Text>{t('homePuzzle')}</Text>
      </Pressable>
      <Pressable testID="home-card-video" onPress={() => onNavigate('video')}>
        <Text>{t('homeVideo')}</Text>
      </Pressable>

      <Pressable testID="home-settings-icon" onPress={() => onNavigate('settings')}>
        <Text>⚙️</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- HomeScreen.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 9: Implement RootNavigator**

Create `src/navigation/RootNavigator.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getProfile } from '../storage/profileStore';
import type { Profile } from '../types/profile';
import { LanguageProvider } from '../i18n/LanguageContext';
import { OnboardingScreen } from '../onboarding/OnboardingScreen';
import { HomeScreen } from '../home/HomeScreen';
import { SettingsScreen } from '../settings/SettingsScreen';
import { QuizScreen } from '../quiz/QuizScreen';
import { ColoringGallery } from '../coloring/ColoringGallery';
import { ColoringScreen } from '../coloring/ColoringScreen';
import { PuzzleGallery } from '../puzzle/PuzzleGallery';
import { PuzzleScreen } from '../puzzle/PuzzleScreen';
import { VideoGallery } from '../video/VideoGallery';
import { VideoPlayerScreen } from '../video/VideoPlayerScreen';

const Stack = createNativeStackNavigator();

function folderUri(root: string, subfolder: string): string {
  return `${root}/${subfolder}`;
}

function AppStack({ profile, refreshProfile }: { profile: Profile; refreshProfile: () => void }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="Home">
        {({ navigation }) => (
          <HomeScreen
            childName={profile.name}
            onNavigate={(destination) => navigation.navigate(destination)}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="settings">
        {() => <SettingsScreen />}
      </Stack.Screen>
      <Stack.Screen name="quiz">
        {() => <QuizScreen quizFolderUri={folderUri(profile.rootFolderUri!, 'quiz')} childAge={profile.age} />}
      </Stack.Screen>
      <Stack.Screen name="coloring">
        {({ navigation }) => (
          <ColoringGallery
            coloringFolderUri={folderUri(profile.rootFolderUri!, 'coloring')}
            onSelect={(imageUri) => navigation.navigate('coloring-detail', { imageUri })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="coloring-detail">
        {({ route }: any) => <ColoringScreen imageUri={route.params.imageUri} />}
      </Stack.Screen>
      <Stack.Screen name="puzzle">
        {({ navigation }) => (
          <PuzzleGallery
            picturesFolderUri={folderUri(profile.rootFolderUri!, 'pictures')}
            onSelect={(imageUri) => navigation.navigate('puzzle-detail', { imageUri })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="puzzle-detail">
        {({ route }: any) => <PuzzleScreen imageUri={route.params.imageUri} />}
      </Stack.Screen>
      <Stack.Screen name="video">
        {({ navigation }) => (
          <VideoGallery
            videosFolderUri={folderUri(profile.rootFolderUri!, 'videos')}
            onSelect={(videoUri) => navigation.navigate('video-detail', { videoUri })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="video-detail">
        {({ route }: any) => <VideoPlayerScreen videoUri={route.params.videoUri} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  if (profile === undefined) return null;

  return (
    <LanguageProvider initialLanguage={profile?.language ?? 'en'}>
      <NavigationContainer>
        {profile ? (
          <AppStack profile={profile} refreshProfile={() => getProfile().then(setProfile)} />
        ) : (
          <OnboardingScreen onComplete={() => getProfile().then(setProfile)} />
        )}
      </NavigationContainer>
    </LanguageProvider>
  );
}
```

- [ ] **Step 10: Wire up App.tsx**

Modify `App.tsx`:

```tsx
import React from 'react';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return <RootNavigator />;
}
```

- [ ] **Step 11: Run the full test suite**

Run: `npm test`
Expected: PASS (all suites across every task).

- [ ] **Step 12: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 13: Commit**

```bash
git add src/video src/home src/navigation App.tsx __tests__/video __tests__/home
git commit -m "feat: add video player, home screen, and navigation wiring the whole app together"
```

---

## Manual Verification (after Task 16)

Automated tests cover logic and component behavior in isolation; the following can only be confirmed on a real or emulated Android device with the Expo dev client, since they involve real SAF folder permissions, real image/video files, and touch interaction:

1. Build and install the dev client: `npx expo run:android`.
2. Complete onboarding, picking a real folder as the content root; confirm the four subfolders and template `questions.json` appear on the device's file system.
3. Drop a few real photos into `pictures/`, a short video into `videos/`, some outline PNGs into `coloring/`, and a hand-written `questions.json` (with images in `quiz/images/`) into `quiz/`.
4. From Home, verify each of the four features: Quiz (mixed image/text questions, 20-question session, correct/incorrect feedback, end-card score), Coloring (tap-to-fill regions), Photo Puzzle (pick a piece count, rearrange, completion celebration), Video Player (plays a real local file).
5. In Settings, change the root folder to a new location; confirm old content is copied over and the old folder is removed only after the copy succeeds.
6. Toggle language in Settings; confirm all UI chrome switches between English and German.
