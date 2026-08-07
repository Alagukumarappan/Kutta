# Bug Hunt Loop — Progress Log

Started per `/loop keep on looping and find and fix bugs...think like a child
and also parent and keep on improving until i say stop. you are a senior
architect and senior bug finder. make a clean way. max iterations of 40`.

**Process per iteration:**
1. Pick one focused area of the app (not touched too recently, or newest/least
   battle-tested code first).
2. Hunt for real bugs from two lenses: **the child** (confusing interactions,
   too-small touch targets, unclear feedback, scary error states, anything a
   2-8 year old would get stuck on) and **the parent** (data safety, privacy,
   correctness, crashes, settings behaving as documented, nothing that would
   embarrass a "senior architect" review).
3. Fix only GENUINE issues found — no manufactured busywork just to log an
   iteration. If a pass turns up nothing real, say so honestly.
4. Verify: full test suite + `npx tsc --noEmit`, both clean, before committing.
5. Commit, log the iteration below, push.
6. Stop conditions: user says stop, 40 iterations reached, or 3 consecutive
   iterations find nothing substantive (diminishing returns — logged clearly
   rather than padded).

**Iteration count: 1 / 40**

---

## Iteration 1 — the newest code: gradient rollout, Paper TextInput migration, sample-content legal fix

Six genuine bugs found and fixed; all 49 suites / 664 tests green and
`npx tsc --noEmit` clean.

**Gradient rollout (sky/skyDark) — contrast the earlier passes missed.** The
earlier fixes only covered the text each screen already knew about; a full
audit of everything painted directly on the gradient found four more:

1. `AddFilesButton` — the "+" control in all three galleries was still on the
   OLD theme's `sky` (#3EC1D3), ~1.07:1 against the new gradient's own sky
   (#3AC7F0). The only way a parent can add their own pictures/videos was
   effectively invisible. Now a white pill with a dark ink outline and glyph;
   its disabled state dims the glyph too (it used to be white on light grey).
2. `QuestionRenderer` progress dots — each dot's ring matched its own fill, so
   a completed jade dot was ~1.06:1 on the gradient and an unanswered one
   ~1.6:1: a child could not see how far through the quiz they were. All
   states now share one ink ring, fills still distinguish them.
3. `LoadingPanel` spinners — tinted with each activity's accent, which on the
   gradient means jade ~1.06:1 and marigold ~1.09:1, i.e. an invisible spinner
   in exactly the blank-screen moment this panel exists to fill. The spinner
   now sits on an opaque white disc (a no-op on the white surfaces it is also
   used on). `ColoringScreen` was also the only caller never passing
   `messageColor`, leaving its text at ~2.9:1.
4. `PuzzleGallery`'s "Retry" label was hard-coded white on its jade card
   (~2.1:1), contradicting tokens.ts, which already picks ink as jade's
   `onAccentText`. Both galleries now read the color from the palette.

**Paper TextInput migration — keyboard handling.** The migration itself is
sound (no Paper character counter, no label/background clash, the
`maxLength` + `slice()` belt-and-braces still correct), but nothing on any of
the three screens handled the keyboard, and this app is LANDSCAPE-locked
where the keyboard eats over half the window:

5. `TicTacToeSetupScreen` was a plain centered View with no scroll, so once a
   child tapped the friend-name field, Start (and often the field itself) was
   clipped away with no gesture able to reach it. Now centered inside a
   ScrollView that only scrolls when the window actually shrinks. All three
   keyboard screens also got `keyboardShouldPersistTaps="handled"`, so the
   first tap on Save/Start counts instead of being swallowed to dismiss the
   keyboard.

**Sample-content legal fix.** The seeding flow itself is correct end-to-end
and no stale `spiderman.png`/`barbie.png`/`coloring/car.png` references
survive anywhere (the only mentions are the deliberate "do not reintroduce"
note in ATTRIBUTION.md). But:

6. Two of the replacement files are not coloring pages: `car-icon.png` was a
   72x72 emoji icon (a pixelated blob once stretched across the canvas) and
   `princess.png` is gradient-shaded, so the flood fill (tolerance 10) fills
   only a small speckle of the tapped shade rather than a region — which
   reads to a child as the color tool being broken. Both dropped; the three
   that genuinely work are still seeded, and ATTRIBUTION.md now records the
   quality bar for anything added later.

**Checked and found fine:** every other text/graphic on the gradient
(resolved token-by-token, including `withAlpha` fades); Settings' staged-save,
migration, and reset flows; the re-entrancy guards on all three screens; the
`maxLength` caps; the Splash orientation comment (accurate — splash really
does run under the PORTRAIT_UP lock).
