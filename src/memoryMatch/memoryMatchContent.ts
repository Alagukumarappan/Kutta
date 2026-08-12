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
  // Real, translated word for this item -- read by MemoryMatchScreen's
  // revealed-card accessibility label instead of the raw `itemId` slug
  // (a screen reader must never announce an internal identifier like
  // "pickup-truck" or "sports-car", and never in the wrong language for
  // a German-language user). Kept alongside the item itself (rather than
  // as a separate lookup table) so a new item can never be added to
  // MEMORY_MATCH_ITEMS without also supplying a display name for it.
  displayName: { en: string; de: string };
}

export const MEMORY_MATCH_ITEMS: MemoryMatchItem[] = [
  { itemId: 'lion', module: require('../../sample-content/memory-match/animals/lion.jpg'), category: 'animal', displayName: { en: 'Lion', de: 'Löwe' } },
  { itemId: 'elephant', module: require('../../sample-content/memory-match/animals/elephant.jpg'), category: 'animal', displayName: { en: 'Elephant', de: 'Elefant' } },
  { itemId: 'giraffe', module: require('../../sample-content/memory-match/animals/giraffe.jpg'), category: 'animal', displayName: { en: 'Giraffe', de: 'Giraffe' } },
  { itemId: 'zebra', module: require('../../sample-content/memory-match/animals/zebra.jpg'), category: 'animal', displayName: { en: 'Zebra', de: 'Zebra' } },
  { itemId: 'panda', module: require('../../sample-content/memory-match/animals/panda.jpg'), category: 'animal', displayName: { en: 'Panda', de: 'Panda' } },
  { itemId: 'koala', module: require('../../sample-content/memory-match/animals/koala.jpg'), category: 'animal', displayName: { en: 'Koala', de: 'Koala' } },
  { itemId: 'kangaroo', module: require('../../sample-content/memory-match/animals/kangaroo.jpg'), category: 'animal', displayName: { en: 'Kangaroo', de: 'Känguru' } },
  { itemId: 'penguin', module: require('../../sample-content/memory-match/animals/penguin.jpg'), category: 'animal', displayName: { en: 'Penguin', de: 'Pinguin' } },
  { itemId: 'owl', module: require('../../sample-content/memory-match/animals/owl.jpg'), category: 'animal', displayName: { en: 'Owl', de: 'Eule' } },
  { itemId: 'dolphin', module: require('../../sample-content/memory-match/animals/dolphin.jpg'), category: 'animal', displayName: { en: 'Dolphin', de: 'Delfin' } },
  { itemId: 'tiger', module: require('../../sample-content/memory-match/animals/tiger.jpg'), category: 'animal', displayName: { en: 'Tiger', de: 'Tiger' } },
  { itemId: 'monkey', module: require('../../sample-content/memory-match/animals/monkey.jpg'), category: 'animal', displayName: { en: 'Monkey', de: 'Affe' } },
  { itemId: 'horse', module: require('../../sample-content/memory-match/animals/horse.jpg'), category: 'animal', displayName: { en: 'Horse', de: 'Pferd' } },
  { itemId: 'rabbit', module: require('../../sample-content/memory-match/animals/rabbit.jpg'), category: 'animal', displayName: { en: 'Rabbit', de: 'Hase' } },
  { itemId: 'sedan', module: require('../../sample-content/memory-match/cars/sedan.jpg'), category: 'car', displayName: { en: 'Sedan', de: 'Limousine' } },
  { itemId: 'suv', module: require('../../sample-content/memory-match/cars/suv.jpg'), category: 'car', displayName: { en: 'SUV', de: 'SUV' } },
  { itemId: 'pickup-truck', module: require('../../sample-content/memory-match/cars/pickup-truck.jpg'), category: 'car', displayName: { en: 'Pickup Truck', de: 'Pickup' } },
  { itemId: 'sports-car', module: require('../../sample-content/memory-match/cars/sports-car.jpg'), category: 'car', displayName: { en: 'Sports Car', de: 'Sportwagen' } },
  { itemId: 'taxi', module: require('../../sample-content/memory-match/cars/taxi.jpg'), category: 'car', displayName: { en: 'Taxi', de: 'Taxi' } },
  { itemId: 'race-car', module: require('../../sample-content/memory-match/cars/race-car.jpg'), category: 'car', displayName: { en: 'Race Car', de: 'Rennwagen' } },
];

// Looks up the display name for `itemId` in the given language, falling
// back to the raw itemId only if the id is somehow not a real bundled
// item (defensive -- every real card's itemId always resolves to a
// MEMORY_MATCH_ITEMS entry, but a screen reader announcement is exactly
// the wrong place to ever throw).
export function displayNameForItemId(itemId: string, language: 'en' | 'de'): string {
  return MEMORY_MATCH_ITEMS.find((item) => item.itemId === itemId)?.displayName[language] ?? itemId;
}

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
// resolution itself throws -- can never FAIL the whole preload: every
// item is attempted independently and this resolves once every attempt
// has settled. Note what this does NOT cover: `Promise.allSettled` only
// protects against a per-item REJECTION, not a `downloadAsync()` call
// that never settles at all (neither resolves nor rejects). That's a
// caller-side concern -- MemoryMatchScreen's preload effect races this
// whole function against `withPreloadTimeout` for exactly that reason.
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
        // Best-effort only -- a REJECTED preload for one card must never
        // fail the round from starting (see this function's own doc
        // comment above). A card whose `downloadAsync()` instead hangs
        // rather than rejecting isn't caught by this `catch` at all --
        // that case is bounded by the caller's `withPreloadTimeout`, not
        // by anything here.
      }
    })
  );
}
