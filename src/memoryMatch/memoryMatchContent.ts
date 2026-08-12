import { Image } from 'react-native';
import { Asset } from 'expo-asset';

// The bundled photo set Memory Match draws from -- a brand-new, dedicated
// set (NOT the parent's own `pictures` folder, NOT the Quiz icon set --
// see docs/superpowers/specs/2026-08-12-memory-match-design.md for why).
// require() calls must be static string literals for Metro to bundle
// these as real app assets, so each file is listed explicitly rather than
// looped over a runtime path list (same convention as sampleContent.ts).
export interface MemoryMatchItem {
  itemId: string;
  module: number;
  category: 'animal' | 'car';
}

export const MEMORY_MATCH_ITEMS: MemoryMatchItem[] = [
  { itemId: 'lion', module: require('../../sample-content/memory-match/animals/lion.jpg'), category: 'animal' },
  { itemId: 'elephant', module: require('../../sample-content/memory-match/animals/elephant.jpg'), category: 'animal' },
  { itemId: 'giraffe', module: require('../../sample-content/memory-match/animals/giraffe.jpg'), category: 'animal' },
  { itemId: 'zebra', module: require('../../sample-content/memory-match/animals/zebra.jpg'), category: 'animal' },
  { itemId: 'panda', module: require('../../sample-content/memory-match/animals/panda.jpg'), category: 'animal' },
  { itemId: 'koala', module: require('../../sample-content/memory-match/animals/koala.jpg'), category: 'animal' },
  { itemId: 'kangaroo', module: require('../../sample-content/memory-match/animals/kangaroo.jpg'), category: 'animal' },
  { itemId: 'penguin', module: require('../../sample-content/memory-match/animals/penguin.jpg'), category: 'animal' },
  { itemId: 'owl', module: require('../../sample-content/memory-match/animals/owl.jpg'), category: 'animal' },
  { itemId: 'dolphin', module: require('../../sample-content/memory-match/animals/dolphin.jpg'), category: 'animal' },
  { itemId: 'tiger', module: require('../../sample-content/memory-match/animals/tiger.jpg'), category: 'animal' },
  { itemId: 'monkey', module: require('../../sample-content/memory-match/animals/monkey.jpg'), category: 'animal' },
  { itemId: 'horse', module: require('../../sample-content/memory-match/animals/horse.jpg'), category: 'animal' },
  { itemId: 'rabbit', module: require('../../sample-content/memory-match/animals/rabbit.jpg'), category: 'animal' },
  { itemId: 'sedan', module: require('../../sample-content/memory-match/cars/sedan.jpg'), category: 'car' },
  { itemId: 'suv', module: require('../../sample-content/memory-match/cars/suv.jpg'), category: 'car' },
  { itemId: 'pickup-truck', module: require('../../sample-content/memory-match/cars/pickup-truck.jpg'), category: 'car' },
  { itemId: 'sports-car', module: require('../../sample-content/memory-match/cars/sports-car.jpg'), category: 'car' },
  { itemId: 'taxi', module: require('../../sample-content/memory-match/cars/taxi.jpg'), category: 'car' },
  { itemId: 'race-car', module: require('../../sample-content/memory-match/cars/race-car.jpg'), category: 'car' },
];

export function moduleForItemId(itemId: string): number | undefined {
  return MEMORY_MATCH_ITEMS.find((item) => item.itemId === itemId)?.module;
}

// Filters out any bundled item whose module fails to resolve to a real
// asset uri -- the same defensive check sampleContent.ts's own history
// motivated (see that file's long comment on the two prior release-build
// asset-resolution failures it worked around). MemoryMatchScreen calls
// this to get the pool `buildDeck` picks from, so a single broken bundled
// asset can never surface as a blank/broken card mid-game -- it's simply
// excluded from the pool up front.
export function resolvableItemIds(): string[] {
  return MEMORY_MATCH_ITEMS.filter((item) => {
    try {
      const resolved = Image.resolveAssetSource(item.module);
      return Boolean(resolved?.uri);
    } catch {
      return false;
    }
  }).map((item) => item.itemId);
}

// Preloads only the bundled photos actually dealt into THIS deck (not all
// 20 available items) so the "memorize the board" preview timer can start
// only once every card the child will actually see has real decoded pixels
// behind it -- without this, MemoryMatchScreen's preview window could be
// spent looking at 36 simultaneously-mounting <Image> components still
// loading, defeating the point of the preview.
//
// Goes through the same `Image.resolveAssetSource` -> `Asset.fromURI(...)`
// seam sampleContent.ts's `seedOneSample` already had to work out the hard
// way (see its own long comment): `Asset.fromModule(module).downloadAsync()`
// looks like the obvious API but silently fails on a real release APK
// (expo-asset's own resolver fabricates a fake network URL for any asset
// not served by expo-updates). Resolving the URI via React Native core's
// resolver FIRST, then handing that already-correct URI to `Asset.fromURI`,
// sidesteps that broken resolution path entirely.
//
// Uses `Promise.allSettled` (not `Promise.all`) so a single asset's
// `downloadAsync()` rejecting -- or resolving to a real Image whose
// resolution itself throws -- can never hang or fail the whole preload:
// every item is attempted independently and this always resolves once
// every attempt has settled, one way or another.
export async function preloadItemImages(itemIds: readonly string[]): Promise<void> {
  await Promise.allSettled(
    itemIds.map(async (itemId) => {
      try {
        const item = MEMORY_MATCH_ITEMS.find((candidate) => candidate.itemId === itemId);
        if (!item) return;
        const resolved = Image.resolveAssetSource(item.module);
        if (!resolved?.uri) return;
        await Asset.fromURI(resolved.uri).downloadAsync();
      } catch {
        // Best-effort only -- a failed/hung preload for one card must never
        // block the round from starting (see this function's own doc
        // comment above).
      }
    })
  );
}
