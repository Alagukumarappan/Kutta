import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

// Sample content bundled with the app (see /sample-content at the repo
// root) so a parent's first-time content folder isn't empty on every card —
// require() calls must be static string literals for Metro to bundle these
// as real app assets, so each file is listed explicitly rather than looped
// over a runtime path list.
interface SampleAsset {
  name: string;
  module: number;
  mimeType: string;
}

// Only images that actually WORK as a coloring page belong here. The
// coloring canvas stretches each picture to fill a full landscape canvas
// (~600x400 on a phone) and its main tool is a flood fill with a tolerance
// of 10 (see floodFill.ts) — so a page needs (a) enough real resolution not
// to turn to mush when scaled up, and (b) large FLAT regions the fill can
// actually flood. Two previous entries failed exactly that and were
// dropped: `car-icon.png` was a 72x72 emoji icon (a blurry blob at canvas
// size), and `princess.png` was gradient-shaded clipart, where a tap fills
// only a small speckle of the tapped shade instead of the whole dress —
// which reads to a child as "the color button is broken".
const SAMPLE_COLORING: SampleAsset[] = [
  { name: 'bunny.jpeg', module: require('../../sample-content/coloring/bunny.jpeg'), mimeType: 'image/jpeg' },
  { name: 'elephant.jpeg', module: require('../../sample-content/coloring/elephant.jpeg'), mimeType: 'image/jpeg' },
  { name: 'hero.png', module: require('../../sample-content/coloring/hero.png'), mimeType: 'image/png' },
];

const SAMPLE_PICTURES: SampleAsset[] = [
  { name: 'doll.jpg', module: require('../../sample-content/pictures/doll.jpg'), mimeType: 'image/jpeg' },
  { name: 'farm.jpg', module: require('../../sample-content/pictures/farm.jpg'), mimeType: 'image/jpeg' },
  { name: 'sports-car.jpg', module: require('../../sample-content/pictures/sports-car.jpg'), mimeType: 'image/jpeg' },
  { name: 'superhero.png', module: require('../../sample-content/pictures/superhero.png'), mimeType: 'image/png' },
];

const SAMPLE_QUIZ_IMAGES: SampleAsset[] = [
  { name: 'apple.png', module: require('../../sample-content/quiz/images/apple.png'), mimeType: 'image/png' },
  { name: 'ball.png', module: require('../../sample-content/quiz/images/ball.png'), mimeType: 'image/png' },
  { name: 'banana.png', module: require('../../sample-content/quiz/images/banana.png'), mimeType: 'image/png' },
  { name: 'bear.png', module: require('../../sample-content/quiz/images/bear.png'), mimeType: 'image/png' },
  { name: 'bee.png', module: require('../../sample-content/quiz/images/bee.png'), mimeType: 'image/png' },
  { name: 'bird.png', module: require('../../sample-content/quiz/images/bird.png'), mimeType: 'image/png' },
  { name: 'butterfly.png', module: require('../../sample-content/quiz/images/butterfly.png'), mimeType: 'image/png' },
  { name: 'car.png', module: require('../../sample-content/quiz/images/car.png'), mimeType: 'image/png' },
  { name: 'cat.png', module: require('../../sample-content/quiz/images/cat.png'), mimeType: 'image/png' },
  { name: 'chicken.png', module: require('../../sample-content/quiz/images/chicken.png'), mimeType: 'image/png' },
  { name: 'cow.png', module: require('../../sample-content/quiz/images/cow.png'), mimeType: 'image/png' },
  { name: 'dog.png', module: require('../../sample-content/quiz/images/dog.png'), mimeType: 'image/png' },
  { name: 'duck.png', module: require('../../sample-content/quiz/images/duck.png'), mimeType: 'image/png' },
  { name: 'elephant.png', module: require('../../sample-content/quiz/images/elephant.png'), mimeType: 'image/png' },
  { name: 'fish.png', module: require('../../sample-content/quiz/images/fish.png'), mimeType: 'image/png' },
  { name: 'flower.png', module: require('../../sample-content/quiz/images/flower.png'), mimeType: 'image/png' },
  { name: 'frog.png', module: require('../../sample-content/quiz/images/frog.png'), mimeType: 'image/png' },
  { name: 'horse.png', module: require('../../sample-content/quiz/images/horse.png'), mimeType: 'image/png' },
  { name: 'house.png', module: require('../../sample-content/quiz/images/house.png'), mimeType: 'image/png' },
  { name: 'lion.png', module: require('../../sample-content/quiz/images/lion.png'), mimeType: 'image/png' },
  { name: 'monkey.png', module: require('../../sample-content/quiz/images/monkey.png'), mimeType: 'image/png' },
  { name: 'moon.png', module: require('../../sample-content/quiz/images/moon.png'), mimeType: 'image/png' },
  { name: 'mouse.png', module: require('../../sample-content/quiz/images/mouse.png'), mimeType: 'image/png' },
  { name: 'pig.png', module: require('../../sample-content/quiz/images/pig.png'), mimeType: 'image/png' },
  { name: 'rabbit.png', module: require('../../sample-content/quiz/images/rabbit.png'), mimeType: 'image/png' },
  { name: 'sheep.png', module: require('../../sample-content/quiz/images/sheep.png'), mimeType: 'image/png' },
  { name: 'star.png', module: require('../../sample-content/quiz/images/star.png'), mimeType: 'image/png' },
  { name: 'sun.png', module: require('../../sample-content/quiz/images/sun.png'), mimeType: 'image/png' },
  { name: 'tree.png', module: require('../../sample-content/quiz/images/tree.png'), mimeType: 'image/png' },
  { name: 'turtle.png', module: require('../../sample-content/quiz/images/turtle.png'), mimeType: 'image/png' },
];

// A plain JSON require() is parsed by Metro into a real JS object at bundle
// time — no asset resolution/download step needed, unlike the images above.
const SAMPLE_QUESTIONS = require('../../sample-content/quiz/questions.json');

export function getSampleQuestionsJson(): string {
  return JSON.stringify(SAMPLE_QUESTIONS, null, 2);
}

// Copies every sample asset into `folderUri`, but ONLY when that folder is
// genuinely empty — this must never overwrite or duplicate content a parent
// has already added (their own photos, or a previous seeding). One asset
// failing to copy (a flaky download, a revoked SAF grant mid-copy) must not
// block the rest — this is a best-effort convenience, not core onboarding
// logic, so every failure is swallowed rather than surfaced.
async function seedFolderIfEmpty(folderUri: string, samples: SampleAsset[]): Promise<void> {
  let existing: string[];
  try {
    existing = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
  } catch {
    return;
  }
  if (existing.length > 0) return;

  // Each sample goes through several slow SAF IPC round-trips (create +
  // write), and on real hardware (confirmed via an Android bug report from a
  // Samsung S22) a sequential await-per-file loop over ~37 bundled files
  // took long enough to look like the app had permanently frozen — Android's
  // own ActivityManager log showed the activity displayed and healthy the
  // whole time, with no crash/ANR anywhere; this loop was simply still
  // running.
  //
  // Racing every sample fully in parallel fixed that, but traded it for a
  // second, worse real-device bug: a SAF/DocumentsProvider is a single
  // background service shared by every request, and firing off dozens of
  // concurrent create+write calls at once (times three, once per
  // coloring/pictures/quiz folder, all seeding at the same time — see
  // ensureContentStructure) can starve that same provider's ability to
  // answer OTHER, already-awaited SAF calls happening at the same moment
  // (RootNavigator's own folder lookups) — reproduced on a real Samsung S22
  // once its target folder already held a lot of prior content to enumerate
  // (from repeated test installs), which made the provider slow enough that
  // the flood of concurrent seed requests visibly blocked unrelated lookups.
  // A small bounded pool keeps the "much faster than one-at-a-time" benefit
  // without ever putting more than a handful of requests in flight against
  // the provider at once.
  await mapWithConcurrencyLimit(samples, 4, (sample) => seedOneSample(folderUri, sample));
}

async function mapWithConcurrencyLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function seedOneSample(folderUri: string, sample: SampleAsset): Promise<void> {
  try {
      // Two previous attempts at this got progressively closer but still
      // failed on a genuine standalone release APK:
      //
      // 1. `Image.resolveAssetSource(module).uri` + `FileSystem.downloadAsync`
      //    only worked while Metro's dev server was running (a real http://
      //    URL) — in a release build (no Metro server), the resolved URI is
      //    an Android `asset:///` reference, which `downloadAsync` can't
      //    fetch (it's not a network request).
      //
      // 2. Switching to `expo-asset`'s `Asset.fromModule(module).downloadAsync()`
      //    seemed like the SDK-official fix, and DOES work in Jest (mocked)
      //    and in a Metro-connected dev build — but still silently failed on
      //    a real release APK. Root cause, found by extracting a real built
      //    APK and tracing expo-asset's own source: `expo-asset`'s internal
      //    `AssetSourceResolver.defaultAsset()` (a separate reimplementation
      //    of React Native core's own resolver, NOT a re-export of it)
      //    unconditionally builds a fake `https://expo.dev/...` "asset
      //    server" URL for ANY app not using expo-updates — even for a
      //    purely local, bundled, offline asset. `downloadAsync` then
      //    genuinely tries to fetch that URL over the network, which always
      //    fails (there is no such server for this app's assets) - the same
      //    root problem as attempt 1, just further disguised.
      //
      // React Native CORE's own `Image.resolveAssetSource` (a DIFFERENT,
      // correct implementation - see `AssetSourceResolver.js` in
      // react-native itself) correctly returns a bare Android resource
      // identifier (no scheme, e.g. "z6") for a release build with no dev
      // server, which is exactly what expo-asset's NATIVE downloadAsync
      // module already knows how to read directly via
      // `Resources.getIdentifier(...)` + `openRawResource(...)` - no network
      // involved. Resolving through RN core first, then handing that
      // correct URI to `Asset.fromURI` (a public expo-asset entry point that
      // trusts the URI it's given instead of re-deriving one), sidesteps
      // expo-asset's own broken resolution entirely while still reusing its
      // native "read this asset's real bytes" implementation.
      const resolved = Image.resolveAssetSource(sample.module);
      const asset = Asset.fromURI(resolved.uri);
      await asset.downloadAsync();
      const localUri = asset.localUri;
      if (!localUri) return;

      // StorageAccessFramework.copyAsync's native Android implementation
      // (FileSystemLegacyModule.kt) only handles a few specific from/to
      // scheme combinations, none of which is "a plain app-local file://
      // source into a SAF content:// directory destination" — read-as-
      // base64-then-write-base64 is the same technique this app already
      // relies on elsewhere for SAF writes (e.g. ensureContentStructure's
      // questions.json, and ColoringScreen's own photo reads), so it's
      // proven to actually work rather than resting on an untested
      // cross-scheme copyAsync assumption.
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        folderUri,
        sample.name,
        sample.mimeType
      );
      await FileSystem.StorageAccessFramework.writeAsStringAsync(destUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
  } catch {
    // Best-effort: this one sample failing must not block the rest.
  }
}

export async function seedSampleColoring(coloringFolderUri: string): Promise<void> {
  await seedFolderIfEmpty(coloringFolderUri, SAMPLE_COLORING);
}

export async function seedSamplePictures(picturesFolderUri: string): Promise<void> {
  await seedFolderIfEmpty(picturesFolderUri, SAMPLE_PICTURES);
}

export async function seedSampleQuizImages(quizImagesFolderUri: string): Promise<void> {
  await seedFolderIfEmpty(quizImagesFolderUri, SAMPLE_QUIZ_IMAGES);
}
