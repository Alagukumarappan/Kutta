import { Image } from 'react-native';
import {
  MEMORY_MATCH_ITEMS,
  moduleForItemId,
  resolvableItemIds,
} from '../../src/memoryMatch/memoryMatchContent';

describe('memoryMatchContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({ uri: 'asset:///fake.jpg' } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('MEMORY_MATCH_ITEMS', () => {
    it('has exactly 20 items', () => {
      expect(MEMORY_MATCH_ITEMS).toHaveLength(20);
    });

    it('has exactly 14 animals and 6 cars', () => {
      const animals = MEMORY_MATCH_ITEMS.filter((item) => item.category === 'animal');
      const cars = MEMORY_MATCH_ITEMS.filter((item) => item.category === 'car');
      expect(animals).toHaveLength(14);
      expect(cars).toHaveLength(6);
    });

    it('gives every item a unique itemId', () => {
      const ids = MEMORY_MATCH_ITEMS.map((item) => item.itemId);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('moduleForItemId', () => {
    it('returns the module for a real itemId', () => {
      const first = MEMORY_MATCH_ITEMS[0];
      expect(moduleForItemId(first.itemId)).toBe(first.module);
    });

    it('returns undefined for an unknown itemId', () => {
      expect(moduleForItemId('not-a-real-item')).toBeUndefined();
    });
  });

  describe('resolvableItemIds', () => {
    it('returns every itemId when every module resolves successfully', () => {
      const ids = resolvableItemIds();
      expect(ids).toHaveLength(20);
      expect(new Set(ids)).toEqual(new Set(MEMORY_MATCH_ITEMS.map((item) => item.itemId)));
    });

    it('excludes an item whose module fails to resolve (returns no uri)', () => {
      const failingItemId = MEMORY_MATCH_ITEMS[0].itemId;
      (Image.resolveAssetSource as jest.Mock).mockImplementation((module: any) => {
        if (module === MEMORY_MATCH_ITEMS[0].module) return { uri: undefined };
        return { uri: 'asset:///fake.jpg' };
      });

      const ids = resolvableItemIds();

      expect(ids).not.toContain(failingItemId);
      expect(ids).toHaveLength(19);
    });

    it('excludes an item whose resolution throws', () => {
      const failingItemId = MEMORY_MATCH_ITEMS[1].itemId;
      (Image.resolveAssetSource as jest.Mock).mockImplementation((module: any) => {
        if (module === MEMORY_MATCH_ITEMS[1].module) throw new Error('bad asset');
        return { uri: 'asset:///fake.jpg' };
      });

      const ids = resolvableItemIds();

      expect(ids).not.toContain(failingItemId);
      expect(ids).toHaveLength(19);
    });
  });
});
