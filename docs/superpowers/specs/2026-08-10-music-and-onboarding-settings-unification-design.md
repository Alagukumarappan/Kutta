# Background music + Onboarding/Settings visual unification

## Problem

The app is currently silent, which reads as "very blunt" (flagged directly
by the parent using it). Separately, Onboarding and Settings — the two
screens that edit the same child profile fields — have drifted into two
different visual languages (Onboarding's playful RaisedCard/AnimatedPressable
look vs. Settings' calmer, plainer parent-register look) and different field
groupings (Onboarding embeds the profile-picture picker inline next to the
name field; Settings has it as its own full-width card).

This work adds one soft looping background track (toggleable, replaceable
with the parent's own music) and unifies Onboarding onto Settings' exact
visual style and field layout.

## Music

### Sourcing

Bundled default track: **"Happy Adventure" by TinyWorlds, CC0 (public
domain)**, downloaded from
`https://opengameart.org/sites/default/files/happy_adveture.mp3` — verified
as a real MPEG Layer III audio file, no attribution legally required (though
still credited in `ATTRIBUTION.md`, matching this project's existing
convention of crediting CC0 assets anyway). Stored at
`sample-content/music/default-track.mp3` and bundled into the compiled APK
the same way `sampleContent.ts` already bundles images (a static `require()`,
copied nowhere at runtime — the bundled asset IS the default track, played
directly, no SAF folder involved).

### New dependency

`expo-audio` (matching the installed `expo` ~57.0.9 — `expo-audio@57.0.x` is
the compatible release). This is Expo's own official audio library
(successor to `expo-av`), from the same publisher already trusted for
`expo-video`. No viable path to background music exists without an audio
library; this is not a candidate for reuse-instead-of-adding since nothing
in this app currently touches audio playback.

### Settings storage

New `src/storage/musicSettingsStore.ts`, structurally identical to the
existing `puzzleDifficultyStore.ts` (a small, independent AsyncStorage-backed
setting, not part of `Profile` — like puzzle difficulty, this is an app
preference that exists independent of whether onboarding has even completed
yet):

```ts
interface MusicSettings {
  muted: boolean; // default false (music ON by default, per product decision)
  customTrackUri: string | null; // null = use the bundled default track
}

getMusicSettings(): Promise<MusicSettings>
saveMusicSettings(settings: MusicSettings): Promise<void>
clearMusicSettings(): Promise<void> // also deletes any copied custom track file
```

### Global playback

New `src/music/MusicContext.tsx`, modeled directly on the existing
`LanguageContext` (a top-level Provider mounted once, consumed by multiple
screens, drives real global app behavior) — `MusicProvider` loads
`MusicSettings` once on mount and exposes `{ muted, customTrackUri,
toggleMuted(), setCustomTrackUri(uri), useDefaultTrack() }` via context,
persisting every change through `musicSettingsStore.ts` immediately.

New `src/music/BackgroundMusicPlayer.tsx` — a bare (no UI) component
mounted once, as a sibling to the Onboarding/AppStack switch in
`RootNavigator.tsx` (inside `MusicProvider`, inside the existing
`NavigationContainer`), so it survives the swap from Onboarding to the app
stack without remounting or restarting the track. Uses `expo-audio`'s
player, set to loop, pointed at `customTrackUri` if set, else the bundled
default; paused (not unloaded) whenever `muted` is true, resumed when false
— so a parent hearing the track and muting it doesn't lose their place, and
switching tracks/muting takes effect immediately since both the settings UI
and the player read the same context.

### Shared UI

New `src/settings/MusicSettingsSection.tsx` — a single full-width card,
visually identical to the existing Profile Picture card in both screens
(same card/label styling), containing:
- A mute/unmute icon button (🔊 / 🔇), toggling `MusicContext`'s `muted`.
- A "Choose your own music" button (`expo-document-picker`, `audio/*`,
  single-select — the same picker pattern `ProfilePicturePicker`'s "Browse
  anywhere" already uses), calling `setCustomTrackUri`.
- A "Use default music" text link, shown only when `customTrackUri` is set,
  calling `useDefaultTrack()`.

Unlike `ProfilePicturePicker`'s "Browse anywhere" (which stores the picked
uri as-is, with the same cache-eviction risk `persistPickedFile` was written
to fix for gallery images), a picked custom track is durably copied into
`documentDirectory/kutta-music/` before its uri is saved — same reasoning as
`persistPickedFile`: the picker hands back a cache-directory copy that
Android can reclaim at any time, and a background track a parent explicitly
chose should not silently disappear later. `musicSettingsStore.ts` owns this
copy step internally (mirrors how `fileReferenceStore.ts` owns
`persistPickedFile`).

This same component instance (not a re-implementation) is used by both
Onboarding and Settings, so the two screens can never visually drift apart
on this section the way Onboarding's profile-picture handling had.

### Reset everything

`clearMusicSettings()` is called from `SettingsScreen.performReset`
alongside the existing `clearAllFileReferences`/`clearLineArtCache`/
`clearPuzzleDifficulty` calls — reverts to the bundled default track,
unmuted, and deletes any copied custom track file. A fresh child should not
inherit the previous child's chosen music, same reasoning as every other
`clear*` call already there.

## Onboarding/Settings visual unification

Per the design discussion: **full visual match**, not just matching field
order. Concretely, `OnboardingScreen.tsx` changes to match
`SettingsScreen.tsx`'s existing implementation:

- Wrapped in `PaperProvider` with `parentPaperTheme` (Settings' existing
  theme), replacing Onboarding's current unthemed Paper usage.
- Every `RaisedCard`/`AnimatedPressable`-based field card replaced with
  Settings' plain `View` + `styles.card`/`styles.halfCard`/`styles.row`
  pattern (copied, not reinvented — same padding/border/background values).
- The name `TextInput` changes from Onboarding's current external-label +
  no-`label`-prop form to Settings' form: a Paper floating `label` prop, no
  separate label `Text` above it.
- The inline avatar-in-name-row is REMOVED from the name card entirely.
- New field order, matching Settings' own order exactly:
  1. Name (own card) | Age (own card) — a row
  2. Language (own card) | Content folder (own card) — a row
  3. Profile picture — full-width card (moved out of the name row, same
     card Settings already has, reusing the same picture-preview +
     choose/remove-button layout)
  4. Music — full-width card (`MusicSettingsSection`, new)
  5. Save button — Settings' plain `Pressable`-based button style, not
     `RaisedPrimaryButton`
- No Reset button (Settings-only, unchanged).
- Validation behavior (name/age/folder required, error messages) is
  UNCHANGED — only the visual presentation and field grouping move.

`SettingsScreen.tsx` itself changes only by inserting the new
`MusicSettingsSection` card between the existing Profile Picture card and
the save/reset buttons — every other part of Settings is already the target
visual style by definition.

## Testing

- `musicSettingsStore.test.ts`: get/save/clear, mirroring
  `puzzleDifficultyStore.test.ts`'s existing test shape; clear also deletes
  the copied custom-track file.
- `MusicContext.test.tsx`: loads settings on mount, `toggleMuted`/
  `setCustomTrackUri`/`useDefaultTrack` each persist through the store and
  update every consumer.
- `BackgroundMusicPlayer.test.tsx`: creates a looping player pointed at the
  default track when no custom track is set, switches source when
  `customTrackUri` changes, pauses (not unloads) when `muted` becomes true
  and resumes when false — `expo-audio` mocked at the same boundary
  `expo-video` is already mocked at elsewhere in this codebase.
- `MusicSettingsSection.test.tsx`: mute icon toggles and reflects state,
  choosing a track calls the picker and persists a durably-copied uri,
  "Use default music" only shows with a custom track set and clears it.
- `OnboardingScreen.test.tsx`: existing validation/save-flow tests updated
  for the new card structure/testIDs; new tests for the Profile picture and
  Music cards now present, and the avatar-in-name-row testIDs removed.
- `SettingsScreen.test.tsx`: new test asserting the Music card renders and
  that `clearMusicSettings` is called on reset, alongside the existing
  `clearAllFileReferences`/`clearLineArtCache`/`clearPuzzleDifficulty`
  assertions.

## Out of scope

- No volume slider — a single mute/unmute toggle only, per the design
  discussion.
- No per-activity or per-screen music (one loop, everywhere), per the
  design discussion.
- No explicit AppState (background/foreground) handling for pausing music
  when the app is backgrounded — `expo-audio`'s default behavior applies;
  revisit only if it proves to be a real problem on-device.
- No change to `ProfilePicturePicker`'s own existing (undurable) "Browse
  anywhere" behavior — noted as a pre-existing, separate gap, not fixed as
  part of this work.
