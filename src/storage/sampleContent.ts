import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';

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

const SAMPLE_COLORING: SampleAsset[] = [
  { name: 'barbie.png', module: require('../../sample-content/coloring/barbie.png'), mimeType: 'image/png' },
  { name: 'bunny.jpeg', module: require('../../sample-content/coloring/bunny.jpeg'), mimeType: 'image/jpeg' },
  { name: 'car.png', module: require('../../sample-content/coloring/car.png'), mimeType: 'image/png' },
  { name: 'elephant.jpeg', module: require('../../sample-content/coloring/elephant.jpeg'), mimeType: 'image/jpeg' },
  { name: 'spiderman.png', module: require('../../sample-content/coloring/spiderman.png'), mimeType: 'image/png' },
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

  for (const sample of samples) {
    try {
      const assetUri = Image.resolveAssetSource(sample.module)?.uri;
      if (!assetUri) continue;
      const cachePath = `${FileSystem.cacheDirectory}kutta-seed-${sample.name}`;
      const { uri: downloadedUri } = await FileSystem.downloadAsync(assetUri, cachePath);
      // copyAsync onto a SAF *directory* URI copies the source file into it
      // under its own name (the same primitive folderMigration.ts already
      // uses for SAF-to-SAF copies) — no manual base64 read/write needed.
      await FileSystem.StorageAccessFramework.copyAsync({ from: downloadedUri, to: folderUri });
      await FileSystem.deleteAsync(downloadedUri, { idempotent: true });
    } catch {
      // Best-effort: move on to the next sample.
    }
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
