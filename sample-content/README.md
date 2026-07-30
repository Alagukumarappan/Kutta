# Sample Content for Kutta

This folder is **starter content**, not part of the app itself — the app never bundles content, per its design (everything the child sees comes from a folder you pick on the phone). This is just a ready-made set of quiz questions you can copy onto the phone to get started immediately, instead of writing `questions.json` from scratch.

## What's here

```
sample-content/
  quiz/
    questions.json   → 120 starter quiz questions (20 for each age, 2-7)
    images/           → 30 icon images the questions above reference
  ATTRIBUTION.md      → license credit for the icons (required — read before using)
```

## How to use it

1. Copy the entire `quiz/` folder from here into the content folder you picked during onboarding (the same folder that already has `pictures/`, `videos/`, `coloring/`, and an empty `quiz/` inside it) — overwrite the empty `quiz/questions.json` and `quiz/images/` the app created.
2. That's it — reopen the Quiz on the phone and these questions will be there, filtered automatically by whatever age is set in the app.

## What's included

- **Ages 2-4** (60 questions, 20 per age): pure picture-matching questions — no reading required. The child sees one picture and taps the matching picture among 4 choices (e.g. sees a picture of a rabbit, taps the rabbit among a rabbit/cow/monkey/dog).
- **Ages 5-7** (60 questions, 20 per age): a mix of simple math (addition for age 5; addition/subtraction for age 6; addition/subtraction/simple multiplication for age 7) and general-knowledge questions (colors, animals, geography, science, etc.), all bilingual (English/German).

## Making it your own

This is a starting point, not a fixed set:
- **Edit** `questions.json` directly to change wording, difficulty, or answers (see the main project README for the exact file format).
- **Add** your own questions — nothing stops you from writing more, for any age, mixing text and pictures however you like.
- **Delete** anything you don't want — remove entries from the JSON file, or delete image files you're not using (just make sure you also remove any question that still references a deleted image).
- **Replace the icons** with your own photos or drawings if you'd rather not use these — just update the `image` fields in `questions.json` to match whatever filenames you use.

## About the images

The 30 icons in `quiz/images/` are simple, colorful, and immediately recognizable to a toddler — see `ATTRIBUTION.md` for where they're from and their license. They're intentionally generic (a cat, a rabbit, a car, an apple) rather than characters from any movie/show/toy line, so there's no copyright concern using or sharing them.
