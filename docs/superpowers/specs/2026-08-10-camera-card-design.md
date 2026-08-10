# Camera card

## Goal

A new Home card lets the child take photos with the phone's own camera and
see everything they've taken in a gallery, the same interaction shape
(grid, tap to view, long-press to multi-select and delete) as every other
gallery in the app.

## New dependency

`expo-image-picker` (compatible with the installed `expo` ~57.0.9). Its
`launchCameraAsync` opens the OS's native camera app directly — no custom
in-app camera screen, no live preview to build, no zoom/flash controls to
reinvent. `npx expo install` registers its config plugin, which adds the
Android `CAMERA` permission automatically.

## Storage

- New `FileReferenceContentType` member: `'camera'` (added to
  `fileReferenceStore.ts`'s existing union and `ALL_CONTENT_TYPES` array —
  the latter means `clearAllFileReferences()`, already called by Settings'
  "Reset everything", covers camera photos with no other change needed).
- No SAF folder for camera photos at all — unlike Coloring/Puzzle/Video,
  there's nothing for a parent to pre-populate. Every camera photo starts
  life as an individually-added reference.
- A taken photo is copied into `documentDirectory/kutta-added/` via the
  EXISTING `persistPickedFile` (already used by `AddFilesButton` for picked
  images) — reused as-is, not reimplemented, so removal
  (`isAppOwnedCopy`/`removeGalleryItems`) already deletes the bytes
  correctly with zero new code there.

## `useSelectableGallery` change

Currently requires a real `folderUri` and always calls
`StorageAccessFramework.readDirectoryAsync` on it. Camera has no folder at
all, so `folderUri` becomes optional (`folderUri?: string`): when absent,
the folder-listing half is skipped entirely and the gallery is just
whatever `pruneMissingFileReferences('camera')` returns. The three existing
callers (Coloring/Puzzle/Video, all of which always pass a real folder
today) are unaffected.

## New components

- `src/components/TakePhotoButton.tsx` — requests camera permission
  (`ImagePicker.requestCameraPermissionsAsync`), calls
  `ImagePicker.launchCameraAsync`, persists the result via
  `persistPickedFile`, calls `addFileReferences('camera', [uri])`, then
  `onAdded()`. Denied permission or a picker failure shows a translated
  alert (`cameraPermissionError`/`cameraPhotoError`), matching
  `AddFilesButton`'s established error-handling shape. Same synchronous
  double-tap guard (`inFlightRef`) as `AddFilesButton`.
- `src/camera/CameraGallery.tsx` — modeled directly on
  `ColoringGallery.tsx`'s structure (grid, empty state, multi-select,
  `TakePhotoButton` where `AddFilesButton` would go), but with no folder
  prop, and a tap opens an inline full-screen photo viewer (a Modal with a
  Pressable backdrop that dismisses, same shape as the coloring reference
  thumbnail's zoom overlay) instead of navigating to another screen — there
  is no "activity" to do with a camera photo beyond looking at it.

## Home / navigation

- New `ActivityId`/`HomeDestination` member `'camera'`, a new
  `getActivityPalette('camera')` accent, a new Home card (📷) inserted into
  the `CARDS` array.
- New `RootNavigator` `Stack.Screen` named `'camera'` rendering
  `CameraGallery` — no `'camera-detail'` screen needed since viewing is an
  inline modal, not a navigated screen.

## i18n

New keys: `homeCamera`, `homeCameraTagline`, `cameraTakePhoto`,
`cameraPermissionError`, `cameraPhotoError`, `emptyCameraTitle`,
`emptyCamera`.

## Testing

- `useSelectableGallery.test.ts`: extended for the no-folder case (skips the
  SAF call entirely, items come from references only).
- `TakePhotoButton.test.tsx`: happy path (permission granted, photo taken,
  persisted, reference added), permission denied shows translated alert,
  picker failure shows translated alert, double-tap guard.
- `CameraGallery.test.tsx`: renders taken photos, empty state, tap opens
  the full-screen viewer, backdrop tap closes it, long-press multi-select
  delete (reusing `useSelectableGallery`'s already-tested removal path).
- `fileReferenceStore.test.ts`: `clearAllFileReferences` clears the
  `'camera'` type too (extending the existing `ALL_CONTENT_TYPES` coverage
  test if one exists, else adding one).

## Out of scope

- No photo editing/cropping/filters.
- No limit on how many photos can be taken (matches every other gallery's
  unbounded-list precedent).
- No separate "camera roll" folder a parent can browse outside the app —
  photos live only inside this app's own storage until removed.
