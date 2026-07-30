# Kutta — Design Spec

Date: 2026-07-30
Status: Approved by user, pending final spec review

## 1. Purpose

A personal Android app ("Kutta") for a 2-8 year old child (initially the developer's
son). The app teaches through play: coloring, an image/text quiz, a photo jigsaw
puzzle built from the family's own photos, and a video player for the family's own
videos. All content the child interacts with (photos, videos, quiz questions, coloring
outlines) is user-supplied and lives entirely on the device — no backend, no network
calls, no data leaves the phone.

Long-term ambition (not required for v1, but informs code quality bar): the app may
eventually be polished and released publicly, so the codebase should be built cleanly
and maintainably from day one rather than as a throwaway prototype.

## 2. Platform & Project

- **Framework:** React Native, using an Expo dev client (not fully-managed Expo,
  because persistent folder access via Android's Storage Access Framework requires a
  native module Expo's managed workflow doesn't fully cover).
- **Language:** TypeScript throughout.
- **Target:** Android only (no iOS requirement).
- **Project name / APK name / package identifiers:** `Kutta`
  - Suggested application id: `com.aramasamy.kutta` (can be changed before first
    release build; has no effect on app behavior).
- **Location:** `/home/aramasamy/repository/mine/Kutta/`
- **Single child profile only.** No multi-profile/switching in v1.

## 3. Storage Model

On first launch, after the user grants storage permission and picks a root folder
(e.g. `GamesForMyKid/` — the folder's own name is user's choice, unrelated to the app
name "Kutta"), the app creates this structure if missing:

```
<chosen-root>/
  pictures/            → source images for the photo puzzle
  videos/              → source video files for the video player
  coloring/            → outline images for the coloring feature (drop-in anytime)
  quiz/
    questions.json      → all quiz content (see schema, Section 5)
    images/              → images referenced by questions/options
```

All four content folders (`pictures`, `videos`, `coloring`, `quiz`) are designed to be
**edited by the user at any time without reinstalling the app** — the app reads their
contents live (or reads + caches with a manual/auto refresh), never bundles this
content into the APK itself.

Internal app state (kept separately, NOT in the user's chosen folder): child's name,
age, language preference, the chosen root folder's path/permission grant, and quiz
progress/session state.

## 4. Onboarding & Settings

**First launch:**
1. Request Android storage permission.
2. Single form: child's **name**, **age** (2-8), **language** (English/German), and a
   folder picker for the root content folder.
3. On **Save**: create the four subfolders (Section 3) if missing, and write a
   template/empty `quiz/questions.json` if one doesn't already exist there.
4. Navigate to the **Home screen**.

**Home screen:**
- Child's name displayed at the top.
- Four cards: **Coloring**, **Quiz**, **Photo Puzzle**, **Video Player**.
- A settings (gear) icon, always accessible.

**Settings screen:**
- Edit name, age, language at any time.
- Change root folder: user picks a new folder → app copies all existing content from
  the old root to the new root → **only after the copy is verified complete and
  successful** does it delete the old root's content. If the copy fails partway, the
  old location is left untouched and the user is shown an error (no partial/lossy
  state).

## 5. Quiz

### 5.1 Content Schema (`quiz/questions.json`)

One shared, subject-agnostic schema — "subject" (animals, math, general knowledge,
etc.) is just whatever content the user writes; it is not a taxonomy the app enforces.

```json
{
  "questions": [
    {
      "id": "q001",
      "category": "image",
      "minAge": 2,
      "maxAge": 5,
      "question": {
        "text": { "en": "What animal is this?", "de": "Welches Tier ist das?" },
        "image": "images/cat.png"
      },
      "options": [
        { "id": "a", "text": { "en": "Cat", "de": "Katze" }, "image": "images/cat1.png" },
        { "id": "b", "text": { "en": "Dog", "de": "Hund" }, "image": "images/dog.png" },
        { "id": "c", "text": { "en": "Cow", "de": "Kuh" }, "image": "images/cow.png" },
        { "id": "d", "text": { "en": "Elephant", "de": "Elefant" }, "image": "images/elephant.png" }
      ],
      "correctOptionId": "a"
    }
  ]
}
```

Rules:
- `question.text` and `question.image` are each **independently optional** — a
  question may be image-only, text-only, or both together.
- Each option's `text` and `image` are likewise each independently optional.
- **Every question has exactly 4 options.**
- `minAge`/`maxAge` (inclusive) determine eligibility against the child's saved age.
  For ages 2-4, the user is expected to author only `category: "image"` questions
  (not enforced by the app — a content-authoring convention).
- `category` is a descriptive tag (`"image"` or `"text"`), not a filter used to split
  the quiz into separate modes — image and text questions are mixed together in the
  same session.
- The app must tolerate unknown/future fields in a question object without breaking
  (e.g. a future `hint` or `difficulty` field) — parse defensively, don't fail on
  extra keys.
- Both `en` and `de` text must be present wherever `text` is present, so the language
  toggle works everywhere without missing-translation gaps.

### 5.2 Quiz Flow

1. Tap the Quiz card on Home.
2. Load `quiz/questions.json`, filter to questions where
   `minAge <= childAge <= maxAge`.
3. Shuffle the filtered set and take the first 20 (or all of them if fewer than 20
   are eligible — show what's available rather than erroring).
4. Show one question per screen. Child taps one of the 4 options.
5. Immediate visual/audio feedback: correct or incorrect.
6. Advance to the next (already-shuffled) question.
7. After the 20th question (or the last available one), show an end card:
   "Quiz done! Your score: X / 20" (or "X / N" if fewer than 20 were available).

### 5.3 Edge Cases

- `questions.json` missing, empty, or invalid JSON → Quiz card shows a friendly
  "no quiz content yet" state instead of crashing.
- Fewer than 4 options, missing `correctOptionId`, or `correctOptionId` not matching
  any option `id` → that individual question is skipped (logged, not shown), rather
  than crashing the whole quiz.
- Zero eligible questions for the child's current age → friendly empty state,
  suggesting the user add age-appropriate content.
- Referenced image file missing → show a placeholder/broken-image state for that
  option/question rather than crashing.

## 6. Coloring

- Outline images are loaded from the external `coloring/` folder — same drop-in,
  edit-anytime model as the other content folders (not bundled in the APK).
- UI: pick an outline from a grid → coloring screen with the outline plus a color
  palette at the bottom → tap a color, then tap a region of the outline to fill it
  with that color.
- Region-fill approach: outlines need distinguishable, enclosed regions (flood-fill by
  tapped pixel color, bounded by outline strokes) — this constrains what "outline
  image" formats work well; documented for the user as guidance on preparing images,
  not enforced by validation.

## 7. Photo Puzzle

- Grid of thumbnails sourced from `pictures/`.
- Tap a thumbnail → puzzle screen: small preview of the full image (reference) + main
  area with the image cut into pieces and shuffled.
- Before starting, the user picks a piece count: 4, 6, 9, or 12 (difficulty scales
  with the child's age).
- Drag-and-drop (or tap-to-swap, whichever proves more usable for small children) to
  rearrange pieces into the correct positions.
- Celebration animation/feedback on successful completion.
- Edge case: `pictures/` empty → friendly empty state, no crash.

## 8. Video Player

- List/grid of videos sourced from `videos/` (thumbnail + filename where available).
- Tap a video → full-screen playback with standard controls (play/pause/seek,
  fullscreen toggle).
- No streaming/network playback — local files only.
- Edge case: `videos/` empty → friendly empty state, no crash.
  Unsupported/corrupt video file → friendly error instead of a crash.

## 9. Internationalization

- Every user-facing string in the app chrome (buttons, labels, onboarding, settings,
  empty states, error messages) is bilingual (English/German) from the start, driven
  by the language setting captured at onboarding and changeable later in Settings.
- Quiz content bilinguality is the content author's responsibility (Section 5.1) —
  the app itself doesn't translate content, only its own UI strings.

## 10. Explicitly Out of Scope for v1

- Multiple child profiles.
- Any backend/server/cloud sync — fully offline.
- iOS support.
- Enforcing/validating coloring outline image format beyond basic loading.
- Automatic content moderation/validation of user-supplied media.
- Mathematics as a separate home-screen card (folded into the unified Quiz feature,
  Section 5).

## 11. Code Quality Bar

Given the possibility of a future public release, the codebase should be organized
with clear feature-module boundaries (coloring / quiz / photo-puzzle / video-player /
onboarding / settings, each isolated), shared/reusable UI components where features
overlap (e.g. a single question-renderer component used for all quiz question
shapes), typed data schemas (TypeScript types mirroring Section 5.1's JSON shape),
and no shortcuts that would require a rewrite to reach release quality later.
