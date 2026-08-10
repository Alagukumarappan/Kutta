# Coloring: color reference thumbnail

## Problem

The line-art conversion feature (see
`docs/superpowers/specs/2026-08-07-coloring-line-art-conversion-design.md`)
turns a parent-added color photo into a black-and-white outline before the
child colors it. Tested on a real device, this works, but the child now has
no idea what color anything in the picture actually is — they're coloring a
photo of, say, a red car with no memory of it being red. A reference to the
original photo makes the black-and-white page easier to color correctly.

## Scope

Applies only to `ColoringScreen.tsx`, the canvas screen itself. Only shown
when the picture currently open was actually converted (a photographic
image) — an already-suitable flat-colored/line-art image has no "original
color" to reference that differs from what's already on screen.

## Design

`ColoringScreen` already receives the original photo's uri as its `imageUri`
prop and currently discards it once `getDisplayImage` resolves to the
converted line-art file. It needs to also keep the `isConverted` flag from
that same call (already returned by `getDisplayImage`, just not currently
read).

When `isConverted` is true, render a small (64x64) reference thumbnail in
the top-right corner of the screen, showing the ORIGINAL color photo via a
plain React Native `<Image source={{ uri: imageUri }} />`. This deliberately
does **not** go through Skia's decoder (the same one `ColoringScreen`'s main
canvas load effect uses) — RN's native `<Image>` component already loads
`content://` URIs directly on Android, which is exactly what every gallery
thumbnail in this app already relies on (see `ColoringGalleryTileImage.tsx`,
`ColoringGallery.tsx`'s tiles, etc.) — so this needs no new decoding work at
all, just a plain image view pointed at the untouched original uri.

Positioned `position: absolute` inside the screen's top-level padded
container (which already carries `insets.top`/`insets.right` via
`GradientScreenBackground`'s existing padding), pinned to the top-right with
a small margin, so it sits clear of both the canvas and the toolbar (which
floats at the bottom edge).

### Failure handling

If the original photo fails to load in this thumbnail (e.g. the file
became unreadable after the canvas already showed the converted version),
the thumbnail is hidden entirely — no broken-image icon — via `<Image>`'s
`onError` callback flipping a local "hide" flag. The main canvas is
unaffected either way, since it never depends on this thumbnail loading.

## Testing

Extend `__tests__/coloring/ColoringScreen.test.tsx`:
- Shows the reference thumbnail (asserted via testID) when `getDisplayImage`
  resolves `isConverted: true`, pointed at the original `imageUri`, not the
  converted uri.
- Does NOT show the thumbnail when `isConverted: false`.
- Hides the thumbnail if its own image load fails (`onError` fired),
  without affecting the main canvas's own loaded state.

## Out of scope

- No toggle/peek interaction (the earlier design question settled on
  always-visible, not a toggle).
- No caching/optimization of the reference thumbnail load — it's a single
  small `<Image>` using RN's own built-in image cache, same as every
  gallery tile already does.
