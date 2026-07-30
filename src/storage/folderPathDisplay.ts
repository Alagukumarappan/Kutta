// Best-effort conversion of an Android Storage Access Framework (SAF) tree URI
// into something a parent can actually recognize, e.g. turning
// "content://com.android.externalstorage.documents/tree/primary%3AKutta%2FContent"
// into "Internal storage / Kutta / Content".
//
// SAF URIs from other providers (SD cards, cloud providers, USB drives, etc.)
// have different shapes that this does not attempt to specially handle — in
// those cases (or any parsing surprise) this falls back to just showing the
// decoded raw string, rather than crashing or showing nothing.
export function toReadableFolderPath(uri: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    // Malformed percent-encoding — fall back to the raw string.
    return uri;
  }

  try {
    // Pull out whatever comes after the last "/tree/" segment, which is
    // where SAF encodes the actual directory path.
    const treeMarker = '/tree/';
    const treeIndex = decoded.lastIndexOf(treeMarker);
    const treePart = treeIndex >= 0 ? decoded.slice(treeIndex + treeMarker.length) : decoded;

    // SAF encodes storage volume + path as "<volume>:<path>", e.g.
    // "primary:Kutta/Content" or "1234-5678:Kutta/Content" for an SD card.
    const colonIndex = treePart.indexOf(':');
    const volume = colonIndex >= 0 ? treePart.slice(0, colonIndex) : null;
    const rest = colonIndex >= 0 ? treePart.slice(colonIndex + 1) : treePart;

    const volumeLabel = volume === 'primary' ? 'Internal storage' : volume;

    const segments = [volumeLabel, ...rest.split('/')].filter((s): s is string => !!s && s.length > 0);

    if (segments.length > 0) {
      return segments.join(' / ');
    }

    return decoded;
  } catch {
    return decoded;
  }
}
