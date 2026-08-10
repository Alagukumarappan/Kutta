# Sound effects + popup close button + celebration-bubble fix

## Problem

Three related gaps found while testing the music feature:

1. No audio feedback at all for getting a quiz answer right/wrong, or for
   winning/losing a game — the app is otherwise silent on these moments.
2. `CelebrationOverlay` (the shared completion popup used by Puzzle,
   Tic-Tac-Toe, and Video) has no visible close control — only Android
   back, the backdrop's own Modal dismiss, or its action buttons (Retry/
   Next/etc.) exit it. A visible 'X' is expected UI convention for a popup.
3. Quiz's "🎉 Yay" celebration bubble (`QuestionRenderer.tsx`) auto-fades
   out after ~1.2 seconds. The parent wants it to stay up instead — it's
   not supposed to be a fire-and-forget flourish, it's a small celebratory
   confirmation the child should be able to keep looking at.

## Sound effects

### Sourcing

Two sounds from **Kenney's "Interface Sounds" pack, CC0 (public domain)**,
via the maintained GitHub mirror
`github.com/Calinou/kenney-interface-sounds` (verified real WAV files,
`LICENSE.txt` confirms CC0 1.0 Universal):
- `confirmation_001.wav` → bundled as `sample-content/sfx/correct.wav`
- `error_001.wav` → bundled as `sample-content/sfx/wrong.wav`

Credited in `ATTRIBUTION.md` (no attribution legally required, credited
anyway per this project's existing convention).

### Playback module

`src/audio/soundEffects.ts` — two exported functions, `playCorrectSound()`
and `playWrongSound()`, each a fire-and-forget call (no returned promise the
caller needs to await). Internally:
- Uses `expo-audio`'s `createAudioPlayer(source)` (the non-hook, imperative
  API — these are one-shot sounds fired from event handlers, not tied to a
  component's render lifecycle the way `useAudioPlayer` is).
- Ducks the background music by calling `duckMusicForSoundEffect()` (see
  below) before playing.
- Subscribes to the player's `playbackStatusUpdate` event; once
  `didJustFinish` is true, removes the subscription, calls
  `player.remove()` to release the native player, and calls
  `restoreMusicAfterSoundEffect()`.
- Wrapped in try/catch — a sound effect is a pure enhancement; any failure
  here must never throw into the caller (a quiz-answer handler, a puzzle
  solve check, a game-over effect).

### Ducking the background music

`src/music/musicPlaybackControl.ts` — a tiny non-React module-level
registry (deliberately NOT part of `MusicContext`, to keep
`soundEffects.ts` decoupled from React and independently testable):

```ts
interface MusicPlaybackControls { pause(): void; resume(): void; }
registerMusicPlaybackControls(controls: MusicPlaybackControls | null): void
duckMusicForSoundEffect(): void   // calls the registered pause(), if any
restoreMusicAfterSoundEffect(): void // calls the registered resume(), if any
```

`BackgroundMusicPlayer` registers `{ pause: () => player.pause(), resume:
() => { if (!muted) player.play(); } }` in an effect keyed on `[player,
muted]` (so the closure is always current), and unregisters (`null`) on
unmount. This achieves "stop the current music, play the sound, then
resume" without `soundEffects.ts` needing to know anything about
`expo-audio` players it doesn't own, and without resuming music that was
already muted before the sound effect played.

### Wiring

- **Quiz** (`src/quiz/QuestionRenderer.tsx`): a new effect, keyed on
  `[hasAnswered, isCorrect, question.id]`, with a ref-based rising-edge
  guard (keyed on `question.id`, the same shape as `answerLockRef`) so the
  sound fires exactly once per answered question — `playCorrectSound()` if
  `isCorrect`, else `playWrongSound()`.
- **Puzzle** (`src/puzzle/PuzzleScreen.tsx`): `playCorrectSound()` added
  alongside the existing `recordPuzzleCompleted()` call inside the
  rising-edge `hasRecordedThisSolveRef` effect (lines ~228-239) — a puzzle
  is only ever a "correct" outcome, never wrong, so no wrong-sound case
  here.
- **Tic-Tac-Toe** (`src/tictactoe/TicTacToeScreen.tsx`): a new rising-edge
  ref-guarded effect keyed on `isGameOver`, mirroring the existing
  `retryFiredRef`/`menuFiredRef` reset effect's shape — `playCorrectSound()`
  when `isCelebratoryWin`, `playWrongSound()` when `isHumanLoss`, nothing
  on a draw (a draw is neither a win nor a loss; it doesn't map cleanly to
  either sound, so it stays silent rather than guessing).

## CelebrationOverlay close button

Add a small 'X' `Pressable` positioned top-right inside the card (absolute
positioning within `cardClip`), calling the exact same `fireExit(onRequestClose)`
already used by the backdrop's Modal dismiss and Android back — so it's
governed by the same one-exit-only latch (`actionLatchRef`) already
documented as covering every exit path from this panel. `onRequestClose` is
already required precisely because it's "the non-destructive leave-this-
panel action" for each host (Puzzle → next/gallery, Tic-Tac-Toe → menu,
Video → dismiss the panel) — the X reuses that same wiring, no new prop
needed. Given an accessible label via a new `close` string key already
added for the coloring zoom-overlay feature (`t('close')` — reused, not
re-added).

## QuestionRenderer celebration bubble: stop auto-fading

In the `Animated.sequence` (lines ~255-266), remove the final
`Animated.timing(opacityAnim, { toValue: 0, ... })` fade-out step and the
`animation.start(({ finished }) => ... setShowCelebration(false))` callback
that hid it afterward — keep only the pop-in
(`Animated.parallel([spring, timing])`). The bubble now stays visible once
it pops in, and is only ever hidden by the EXISTING `if (!isCorrect) {
setShowCelebration(false); ... }` early-return branch at the top of the
same effect — which already correctly fires the moment the question
changes (a new question always resets `isCorrect` to `false` first) or a
"Try Again" clears the answer on the same question. No new hide path is
needed; the auto-timer is simply deleted.

## Testing

- `soundEffects.test.ts`: `playCorrectSound`/`playWrongSound` each call
  `createAudioPlayer` with the correct bundled source, call `.play()`, call
  `duckMusicForSoundEffect`, and — once the mocked player's
  `playbackStatusUpdate` listener reports `didJustFinish: true` — call
  `restoreMusicAfterSoundEffect` and `.remove()`. A thrown error from
  `createAudioPlayer` is swallowed, not propagated.
- `musicPlaybackControl.test.ts`: registering controls then calling
  `duckMusicForSoundEffect`/`restoreMusicAfterSoundEffect` calls the
  registered `pause`/`resume`; calling either with nothing registered (or
  after unregistering via `null`) is a safe no-op.
- `BackgroundMusicPlayer.test.tsx`: extended to assert it registers
  playback controls on mount and unregisters (`null`) on unmount, and that
  the registered `resume` respects the current `muted` value.
- `CelebrationOverlay.test.tsx`: the X button is present, calls
  `onRequestClose`, is governed by the same one-exit latch as the other
  actions (a simultaneous X-press and action-press only fires one), and has
  an accessible label.
- `QuestionRenderer.test.tsx` (or `QuizScreen.test.tsx`, whichever already
  covers the celebration bubble): the bubble is still visible after the
  hold period that used to trigger its fade-out (no `setShowCelebration(false)`
  fires on its own), and still correctly disappears when the next question
  loads.
- `PuzzleScreen.test.tsx` / `TicTacToeScreen.test.tsx`: `playCorrectSound`/
  `playWrongSound` (mocked) are called exactly once on the appropriate
  outcome (solve; win; loss), not on every re-render while the outcome
  persists, and not on a Tic-Tac-Toe draw.

## Out of scope

- No volume/mixing control over sound effects beyond the existing music
  mute toggle (which doesn't affect sound effects — they play regardless of
  whether background music is muted, since a muted "resume" is a no-op but
  the sound effect itself always plays).
- No sound effect for Video completion (no "correct/wrong" concept there).
- No sound for a Tic-Tac-Toe draw (see above).
