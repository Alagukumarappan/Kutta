# Kutta

An offline Android app for a young child (ages 2-8) with four activities: **Coloring**, **Quiz**, **Photo Puzzle**, and a **Video Player**. All content the child sees — photos, videos, coloring pages, and quiz questions — comes from a folder you (the parent) pick on the phone. Nothing is bundled in the app and nothing is ever sent over the internet; the app works entirely offline.

## What's in this app

- **Onboarding** (first launch): enter the child's name, age (2-8), pick English or German, and choose a folder on the phone where content will live.
- **Home screen**: shows the child's name and four cards — Coloring, Quiz, Photo Puzzle, Video Player — plus a settings icon.
- **Quiz**: a 20-question session (or fewer if you haven't written that many yet) picked randomly from questions matching the child's age. Questions can be picture-based (good for non-readers, ages 2-4) or text-based. Shows correct/incorrect feedback on each answer, then a final score.
- **Coloring**: pick an outline picture, tap a color, tap a region to fill it in.
- **Photo Puzzle**: pick one of your own photos, choose how many pieces (4/6/9/12), then tap pieces to swap them until the picture is rebuilt.
- **Video Player**: pick a video from your folder and play it.
- **Settings**: change the child's name/age/language anytime, or move all content to a different folder (safely — it copies everything to the new location, checks it copied correctly, and only then removes the old copy, with a confirmation prompt first).

## The content folder

When you complete onboarding, the app creates this folder structure inside the location you picked:

```
<your chosen folder>/
  pictures/        → drop photo(s) here for the Photo Puzzle
  videos/          → drop video file(s) here for the Video Player
  coloring/        → drop outline image(s) here (.png/.jpg) for Coloring
  quiz/
    questions.json  → all quiz questions live in this one file
    images/          → images referenced by quiz questions/answers go here
```

You can add, remove, or replace files in any of these folders at any time — the app reads them fresh, no reinstall needed.

### Writing quiz questions

`quiz/questions.json` looks like this:

```json
{
  "questions": [
    {
      "id": "q001",
      "category": "image",
      "minAge": 2,
      "maxAge": 4,
      "question": { "image": "images/which_is_cat_prompt.png" },
      "options": [
        { "id": "a", "image": "images/cat.png" },
        { "id": "b", "image": "images/dog.png" },
        { "id": "c", "image": "images/cow.png" },
        { "id": "d", "image": "images/elephant.png" }
      ],
      "correctOptionId": "a"
    },
    {
      "id": "q002",
      "category": "text",
      "minAge": 5,
      "maxAge": 7,
      "question": {
        "text": { "en": "What is 2 + 3?", "de": "Was ist 2 + 3?" }
      },
      "options": [
        { "id": "a", "text": { "en": "4", "de": "4" } },
        { "id": "b", "text": { "en": "5", "de": "5" } },
        { "id": "c", "text": { "en": "6", "de": "6" } },
        { "id": "d", "text": { "en": "7", "de": "7" } }
      ],
      "correctOptionId": "b"
    }
  ]
}
```

Rules:
- Every question needs exactly **4 options**.
- A question (and each option) can have `text`, `image`, or both — at least one is required.
- `text` needs both `en` and `de` if present, so the language switch always works.
- `minAge`/`maxAge` decide which ages a question shows up for (inclusive).
- Image paths are relative to the `quiz/` folder (e.g. `"images/cat.png"` means the file `quiz/images/cat.png`).
- Any question the app can't understand (missing options, broken reference, etc.) is silently skipped rather than crashing the quiz — so a typo in one question won't break the rest.

## Running it locally

This is a React Native app built with Expo, using some custom native modules (folder access, video playback, a drawing canvas) — so it needs a real build, not just the plain Expo Go app from the Play Store.

**First-time setup:**
```bash
npm install
```

**To run on an Android phone:**
1. On the phone: Settings → About Phone → tap "Build Number" 7 times to unlock Developer Options.
2. Settings → Developer Options → turn on USB Debugging.
3. Plug the phone into your computer with USB, and tap "Allow" on the popup that appears on the phone.
4. Run:
   ```bash
   npm run android
   ```
   This builds the app and installs it directly onto the connected phone. The very first build can take several minutes (it's compiling native Android code); later builds are much faster.

**To run on an Android emulator instead** (a virtual phone on your computer — via Android Studio's emulator or Genymotion): start the virtual device first, confirm it shows up with `adb devices`, then run the same `npm run android` command — it installs onto whichever device/emulator it finds.

**Making JS/TS changes fast after the first install:** once the app is installed, run `npx expo start` — this gives you fast reload for code changes without a full native rebuild, as long as you're not adding new native dependencies.

## Rebuilding after changes (when a fast reload isn't enough)

Some changes require more than `npx expo start`'s fast reload — you need a real rebuild. Here's when each situation applies and what to run.

**When you only changed JS/TS code** (a screen, a function, styling, etc.) and the app is already installed:
```bash
npx expo start
```
Reload the app on the device (shake the phone or press `r` in the terminal) — no rebuild needed.

**When you added or changed a native dependency** (anything in `package.json` that touches native code — e.g. `react-native-reanimated`, `expo-video`, `@shopify/react-native-skia`), or `app.json` config that affects the native project (like `orientation`, permissions, the app icon):
```bash
npm install          # if you added/changed a package
npm run android       # rebuilds and reinstalls
```
`npm run android` reuses the existing native `android/` folder if one already exists — it does **not** automatically pick up every `app.json` change (see below).

**When you changed something in `app.json`** (orientation, icon, permissions, plugins) and it doesn't seem to take effect after `npm run android`:
```bash
npx expo prebuild --clean
npm run android
```
`expo prebuild --clean` deletes and regenerates the native `android/` (and `ios/`) folders from scratch based on the current `app.json`. This is necessary because `npm run android` only *builds* the existing native folder — it doesn't regenerate it from `app.json` on every run. Do this any time an `app.json` change (like the landscape orientation lock) doesn't seem to be taking effect.

**If the build fails with confusing native/Gradle errors** (e.g. `[Worklets] runOnUI can only be used with worklets`, or other errors that only show up after adding a native package):
```bash
rm -rf node_modules/.cache .expo
npx expo start -c
```
Leave that running, then in another terminal run `npm run android` again. This clears Metro's bundler cache, which can go stale after adding new native modules like `react-native-reanimated`.

**If Gradle itself fails with a Java-related error** (mentions restricted methods, or JDK version mismatches): this project needs **Java 17** specifically for the Android build tools — a newer or older Java version installed as your default can cause confusing failures. Check with:
```bash
java -version
```
If it's not 17, and you have SDKMAN installed, run `sdk env` in the project folder (there's a `.sdkmanrc` file pinning Java 17) to switch your terminal to the right version before building.

**Quick decision guide:**
| What changed | What to run |
|---|---|
| Just JS/TS code | `npx expo start`, then reload on device |
| Added/changed a package in `package.json` | `npm install` then `npm run android` |
| Changed `app.json` (orientation, icon, permissions) | `npx expo prebuild --clean` then `npm run android` |
| Weird native/worklets error after adding a package | Clear cache (`rm -rf node_modules/.cache .expo`, `npx expo start -c`), then `npm run android` |
| Gradle/Java version errors | Check `java -version` is 17, use `sdk env` if using SDKMAN |

## Running the tests

```bash
npm test
```

This runs the full automated test suite (component tests, logic tests) — no device or emulator needed for this. Should show all suites passing.

To type-check without running tests:
```bash
npx tsc --noEmit
```

## Project structure

```
src/
  types/        → shared TypeScript types (Profile, quiz Question, etc.)
  i18n/         → bilingual (en/de) string dictionary + language context
  storage/      → profile storage, folder permission/creation, folder migration
  onboarding/   → first-launch screen
  settings/     → settings screen
  home/         → home screen (the 4 cards)
  quiz/         → quiz question loading, filtering, session logic, and UI
  coloring/     → flood-fill algorithm + coloring gallery/screen
  puzzle/       → puzzle grid math + gallery/screen
  video/        → video gallery + player screen
  navigation/   → wires every screen together into the actual app
__tests__/      → mirrors src/, one test file per module that has one
```

Each feature folder is self-contained: the "pure logic" pieces (e.g. the flood-fill algorithm, quiz scoring, puzzle-piece math) have no dependency on React Native and are fully unit-tested; the screen components use that logic plus the shared storage/i18n layers.

## Notes on how this was built

Every piece of this app was built test-first (write a failing test, then the code to pass it) and went through an independent code review before being considered done — including a final pass reviewing the whole app together, which caught a couple of real bugs (quiz images not loading correctly, and the folder-move safety check not being thorough enough) that were then fixed and re-verified. The design spec and full task-by-task implementation plan are kept in `docs/superpowers/` if you want the full history of decisions.
