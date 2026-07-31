import { toReadableFolderPath } from '../../src/storage/folderPathDisplay';

describe('toReadableFolderPath', () => {
  it('renders the primary volume happy path as "Internal storage / <segments>"', () => {
    const uri = 'content://com.android.externalstorage.documents/tree/primary%3AKutta%2FContent';
    expect(toReadableFolderPath(uri)).toBe('Internal storage / Kutta / Content');
  });

  it('passes through a non-primary volume label (e.g. an SD card id) unchanged', () => {
    const uri = 'content://com.android.externalstorage.documents/tree/1234-5678%3AKutta%2FPhotos';
    expect(toReadableFolderPath(uri)).toBe('1234-5678 / Kutta / Photos');
  });

  it('falls back to the raw string when decodeURIComponent throws on malformed percent-encoding', () => {
    const uri = 'content://com.android.externalstorage.documents/tree/primary%3AFoo%';
    expect(toReadableFolderPath(uri)).toBe(uri);
  });

  it('still produces a readable path when there is no "/tree/" marker and no volume colon either', () => {
    const uri = 'no-tree-marker-here/foo/bar';
    expect(toReadableFolderPath(uri)).toBe('no-tree-marker-here / foo / bar');
  });

  it('shows just the volume label when the path after the volume marker is empty', () => {
    const uri = 'content://com.android.externalstorage.documents/tree/primary%3A';
    expect(toReadableFolderPath(uri)).toBe('Internal storage');
  });

  it('returns the decoded string unchanged when there are no usable segments at all', () => {
    expect(toReadableFolderPath('')).toBe('');
  });

  it('collapses accidental duplicate slashes in the path into single separators', () => {
    const uri = 'content://com.android.externalstorage.documents/tree/primary%3AKutta%2F%2FContent';
    expect(toReadableFolderPath(uri)).toBe('Internal storage / Kutta / Content');
  });
});
