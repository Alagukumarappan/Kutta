// Dependency-free base64 decoder.
//
// We can't rely on atob()/Buffer here: this app runs on Hermes in React
// Native, which provides neither the browser's atob() nor Node's Buffer
// global, so a plain base64 string (as returned by
// FileSystem.readAsStringAsync(uri, { encoding: EncodingType.Base64 })) needs
// its own decode path straight to bytes, which is what Skia.Data.fromBytes
// needs downstream.
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const CHAR_TO_INDEX: Record<string, number> = {};
for (let i = 0; i < BASE64_ALPHABET.length; i++) {
  CHAR_TO_INDEX[BASE64_ALPHABET[i]] = i;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  // Strip any padding/whitespace the platform might include so the length
  // math below (which assumes only meaningful base64 characters plus
  // trailing '=' padding) stays correct.
  const clean = base64.replace(/[\r\n]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  // Every 4 input chars decode to 3 bytes, minus 1 byte per '=' pad
  // character at the end.
  const byteLength = Math.floor((clean.length / 4) * 3) - padding;
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = CHAR_TO_INDEX[clean[i]] ?? 0;
    const c1 = CHAR_TO_INDEX[clean[i + 1]] ?? 0;
    const c2 = clean[i + 2] !== '=' && clean[i + 2] !== undefined ? CHAR_TO_INDEX[clean[i + 2]] ?? 0 : 0;
    const c3 = clean[i + 3] !== '=' && clean[i + 3] !== undefined ? CHAR_TO_INDEX[clean[i + 3]] ?? 0 : 0;

    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

    if (byteIndex < byteLength) bytes[byteIndex++] = (triple >> 16) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = (triple >> 8) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = triple & 0xff;
  }

  return bytes;
}
