import * as FileSystem from 'expo-file-system/legacy';

// A child's profile picture is an optional local file reference
// (`Profile.pictureUri`, see src/types/profile.ts) — never uploaded
// anywhere, matching this app's offline-first/no-tracking constraints. Like
// every other locally-referenced photo this app shows (coloring source
// photos, puzzle photos, videos — see ColoringScreen.tsx's
// `imageLoadFailed` state and VideoGallery's `retryToken` pattern), the
// referenced file can become unreachable after being set: the file gets
// deleted, an SD card is unmounted, or (for a SAF `content://` URI) the
// access grant is revoked. Rather than let a stale/broken URI silently
// reach a future `<Image>` render — which would show a confusing
// broken-image icon a young child can't make sense of — this checks the
// file's actual existence first and gracefully falls back to `null` on any
// missing-file or access failure. Never throws.
export async function resolveProfilePictureUri(uri: string | null | undefined): Promise<string | null> {
  if (!uri) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? uri : null;
  } catch {
    return null;
  }
}
