import { base64ToUint8Array } from '../../src/coloring/base64';

// Known base64 <-> byte fixtures, hand-verified, so this test doesn't depend
// on Node's Buffer (unavailable in this project's tsconfig/RN runtime, and
// deliberately not something the app code relies on either - see base64.ts).
function bytesOf(str: string): number[] {
  return Array.from(str).map((c) => c.charCodeAt(0));
}

describe('base64ToUint8Array', () => {
  it('decodes a string with no padding (byte length a multiple of 3)', () => {
    const bytes = base64ToUint8Array('TWFu'); // "Man"
    expect(Array.from(bytes)).toEqual(bytesOf('Man'));
  });

  it('decodes a string with one padding character', () => {
    const bytes = base64ToUint8Array('TWE='); // "Ma"
    expect(Array.from(bytes)).toEqual(bytesOf('Ma'));
  });

  it('decodes a string with two padding characters', () => {
    const bytes = base64ToUint8Array('TQ=='); // "M"
    expect(Array.from(bytes)).toEqual(bytesOf('M'));
  });

  it('decodes a well-known multi-block phrase (RFC 4648 test vector)', () => {
    // "Many hands make light work." -> known-good base64, from the RFC 4648
    // test vectors.
    const bytes = base64ToUint8Array('TWFueSBoYW5kcyBtYWtlIGxpZ2h0IHdvcmsu');
    expect(Array.from(bytes)).toEqual(bytesOf('Many hands make light work.'));
  });

  it('produces the correct byte length for a real-photo-sized (multi-KB) buffer', () => {
    // A repeating 4-char base64 group decodes to 3 bytes per group with no
    // padding, so N groups of 'TWFu' should decode to exactly 3*N bytes -
    // this exercises the byte-length math at a size in the same ballpark as
    // a real JPEG payload without needing Buffer/atob to build the fixture.
    const groups = 2000; // 8000 base64 chars -> 6000 bytes
    const base64 = 'TWFu'.repeat(groups);
    const decoded = base64ToUint8Array(base64);
    expect(decoded.length).toBe(groups * 3);
    // Spot-check content, not just length: every decoded triple should be
    // "Man" again.
    expect(Array.from(decoded.slice(0, 3))).toEqual(bytesOf('Man'));
    expect(Array.from(decoded.slice(decoded.length - 3))).toEqual(bytesOf('Man'));
  });
});
