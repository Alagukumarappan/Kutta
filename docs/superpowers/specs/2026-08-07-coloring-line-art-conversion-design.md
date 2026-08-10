# Coloring: convert color photos to line art

## Problem

Coloring pages work best as flat-colored or grayscale line art with clear
enclosed regions — that's the whole reason `sampleContent.ts` had to drop
`car-icon.png` and `princess.png` (see `ATTRIBUTION.md`): a flood fill with
tolerance 10 needs large flat regions, not photographic gradients or noise.

Today, any picture a parent adds to the coloring gallery (via the "+" button,
or dropped directly into their configured coloring folder) is used as-is. A
real photo — continuous color, gradients, texture — makes the flood-fill tool
functionally useless: taps fill a tiny speckle of the tapped shade instead of
a recognizable region, which reads to a 2-8 year old as "the color tool is
broken."

This feature automatically converts photographic images into black-and-white
line art before they're used for coloring, so any photo a parent adds becomes
paintable the same way the bundled samples are.

## Scope

Applies to every picture that can appear in the coloring gallery, regardless
of how it got there:
- Individually added via the "+" `AddFilesButton` picker.
- Present directly in the parent's configured coloring folder (SAF content).

Does **not** apply to already-suitable images: the bundled samples
(`bunny.jpeg`, `elephant.jpeg`, `hero.png`) and any flat clip-art a parent adds
must be left untouched (see Detection below) — only genuinely photographic
images are converted.

## Detection: photographic vs. already-suitable

The naive rule — "has any color → convert it" — is wrong: `hero.png` (the
bundled superhero clipart) has color, but it's already flat solid regions,
exactly what flood-fill wants. Converting it would replace a good coloring
page with a worse one.

Instead, detect **photographic-ness**, not color presence:

`looksPhotographic(pixels, width, height): boolean` — samples pixels across
the image (a fixed grid, not every pixel, for speed), quantizes each sampled
color to a coarse bucket (e.g. 4 bits per channel), and counts distinct
buckets seen. A photo produces hundreds of distinct buckets even at this
coarse quantization (continuous gradients, noise, texture); flat clip art or
existing line art produces only a handful (a small, fixed palette of solid
fills). Below a fixed threshold → leave alone. At or above → convert.

This lives in `src/coloring/lineArtConversion.ts` as a pure function taking a
pixel buffer, independent of Skia/React Native, so it can be unit tested with
synthetic buffers (flat 2-color, grayscale, random-noise, gradient).

## Conversion algorithm

`convertToLineArt(image: SkImage): SkImage`, also in
`src/coloring/lineArtConversion.ts`:

1. Convert to grayscale (a Skia color-matrix `ImageFilter`).
2. Run edge detection via Skia's matrix-convolution `ImageFilter` (a
   Sobel-style kernel) on the grayscale result.
3. Threshold the edge-magnitude output to pure black (edge) / white
   (non-edge).

All three steps render into an offscreen `Skia.Surface.MakeOffscreen`, the
same technique `downscaleForColoring` (existing code in `ColoringScreen.tsx`)
already uses — no new library, no native dependency.

Runs on the already-downscaled image (after `downscaleForColoring`'s existing
1600px cap), so conversion cost is bounded the same way decoding already is.

## Caching

Conversion is real image processing work (decode + multiple offscreen render
passes) — it must not re-run every time a gallery renders or a coloring
screen opens. `src/coloring/lineArtCache.ts` owns this:

- `getDisplayImage(sourceUri: string): Promise<{ uri: string; isConverted: boolean }>`
  — the single entry point both the gallery and the coloring screen call.
- On first call for a `sourceUri`: reads the source bytes, decodes, runs
  `looksPhotographic`. If not photographic, maps `sourceUri` straight to
  itself (no derived file, no wasted storage or work). If photographic, runs
  `convertToLineArt`, encodes the result as PNG, writes it to
  `documentDirectory/kutta-line-art/<hash-of-sourceUri>.png` (a stable hash
  of the source URI, so the same source always maps to the same derived
  filename), and records the mapping.
- The mapping (`sourceUri` → derived file path or "use original") is kept in
  AsyncStorage, mirroring the existing `fileReferenceStore.ts` pattern, so
  every later call is a cache hit with no reprocessing.
- **This cache is the single source of truth for both surfaces** — the
  gallery thumbnail and the coloring canvas both call `getDisplayImage` and
  render whatever it returns, so the preview a child sees in the gallery is
  guaranteed to be exactly the picture they'll color, never a different or
  re-computed conversion.

### Cleanup

When a source picture is removed — pruned from `fileReferenceStore`
(`pruneMissingFileReferences`), explicitly removed via a gallery's multi-select
delete, or its folder-scan entry disappears — its derived file (if one
exists) and cache mapping are deleted too, following the same
no-storage-leak discipline already established for individually-added file
copies (`clearAllFileReferences`, `removeGalleryItems`).

## Gallery & coloring-screen integration

- **`ColoringGallery.tsx`**: each tile resolves its display image via
  `getDisplayImage` asynchronously (same lazy-per-item, show-a-placeholder-
  until-ready pattern already used for gallery thumbnails), rather than
  rendering the raw source URI directly.
- **`ColoringScreen.tsx`**: the existing load effect (which currently reads
  bytes → `Skia.Data.fromBytes` → `MakeImageFromEncoded` →
  `downscaleForColoring`) instead calls `getDisplayImage(imageUri)` first and
  loads whatever URI it returns. Since the cache already ran `downscaleForColoring`-equivalent
  sizing as part of conversion for photographic images, and non-photographic
  images are unchanged from today's path, this doesn't duplicate work.

## Error handling & fallback

- Any failure in the pipeline (unreadable source, Skia decode/surface
  failure, an unexpected exception in `looksPhotographic`/`convertToLineArt`)
  falls back to the **original photo** — `getDisplayImage` returns
  `{ uri: sourceUri, isConverted: false }` on any error, exactly like a
  non-photographic image. This matches today's existing fallback discipline
  throughout `ColoringScreen`/`ColoringGallery` (e.g. `downscaleForColoring`'s
  own full-size fallback).
- A degenerate conversion result (e.g. edge detection finds essentially no
  edges — a near-blank white output) is also treated as a failure and falls
  back to the original, rather than showing a child an all-white "picture."

## Testing

- `looksPhotographic`: unit tests with synthetic `Uint8ClampedArray` buffers
  — flat single/dual-color, grayscale line art, a synthetic gradient, and
  synthetic noise — asserting the boundary behaves as designed.
- `convertToLineArt`: tested via the existing mocked-Skia test patterns
  already used for `downscaleForColoring`, asserting the offscreen-surface
  pipeline (grayscale → convolution → threshold) is invoked correctly and
  that failures propagate as thrown errors (for the cache's fallback to
  catch).
- `lineArtCache.ts`: tested with mocked `expo-file-system`/AsyncStorage the
  same way `fileReferenceStore.test.ts` already mocks them — cache-hit path,
  first-time conversion path, non-photographic pass-through path, and
  cleanup-on-removal.
- `ColoringGallery.tsx` / `ColoringScreen.tsx`: existing test suites extended
  to assert they call `getDisplayImage` and render its returned URI, not the
  raw source.

## Out of scope

- Re-running conversion if a parent replaces a file at the same URI after it
  was already cached (no mtime/fingerprint invalidation) — matches this
  app's existing assumption elsewhere that a picked/referenced file doesn't
  change identity after being added.
- A parent-facing setting to disable conversion — always-on, per this
  design's requirements.
- Improving fill-region quality further with region-flattening on top of
  edge detection (considered and deferred — see the discussion in the design
  session that produced this spec; edge-detection-only is the smallest thing
  that could work, and a natural follow-up if real photos prove too sparse).
