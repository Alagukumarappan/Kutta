import * as FileSystem from 'expo-file-system/legacy';
import type { Question, QuestionOption } from '../types/quiz';
import { findChildUri, leafNameOf } from '../storage/folderAccess';

function isBilingualText(v: unknown): v is { en: string; de: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as any).en === 'string' &&
    typeof (v as any).de === 'string'
  );
}

function isValidOption(v: unknown): v is QuestionOption {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as any;
  if (typeof o.id !== 'string') return false;
  if (o.text !== undefined && !isBilingualText(o.text)) return false;
  if (o.image !== undefined && typeof o.image !== 'string') return false;
  return o.text !== undefined || o.image !== undefined;
}

function isValidQuestion(v: unknown): v is Question {
  if (typeof v !== 'object' || v === null) return false;
  const q = v as any;

  if (typeof q.id !== 'string') return false;
  if (q.category !== 'image' && q.category !== 'text') return false;
  if (typeof q.minAge !== 'number' || typeof q.maxAge !== 'number') return false;

  if (typeof q.question !== 'object' || q.question === null) return false;
  const hasQuestionText = q.question.text !== undefined;
  const hasQuestionImage = q.question.image !== undefined;
  if (!hasQuestionText && !hasQuestionImage) return false;
  if (hasQuestionText && !isBilingualText(q.question.text)) return false;
  if (hasQuestionImage && typeof q.question.image !== 'string') return false;

  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  if (!q.options.every(isValidOption)) return false;

  if (typeof q.correctOptionId !== 'string') return false;
  if (!q.options.some((o: QuestionOption) => o.id === q.correctOptionId)) return false;

  return true;
}

export function parseQuestionsFile(raw: string): Question[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null) return [];
  const questionsField = (parsed as any).questions;
  if (!Array.isArray(questionsField)) return [];

  return questionsField.filter(isValidQuestion);
}

// The schema/loadQuestions store image references as paths relative to the
// quiz folder, e.g. "images/cat.png". That string is not a loadable URI on
// its own — it must be resolved to the real content:// child URI that SAF
// handed back when listing quiz/images, found by exact leaf-name match (not
// a suffix/endsWith check, which was already found buggy elsewhere in this
// project and would also match unrelated siblings).
function basenameOfImagePath(imagePath: string): string {
  const idx = imagePath.lastIndexOf('/');
  return idx === -1 ? imagePath : imagePath.substring(idx + 1);
}

async function resolveQuestionImages(questions: Question[], quizFolderUri: string): Promise<Question[]> {
  const imagesFolderUri = await findChildUri(quizFolderUri, 'images');
  if (!imagesFolderUri) return questions;

  const imageEntries = await FileSystem.StorageAccessFramework.readDirectoryAsync(imagesFolderUri);
  const uriByLeafName = new Map(imageEntries.map((uri) => [leafNameOf(uri), uri]));

  function resolve<T extends string | undefined>(imagePath: T): T {
    if (!imagePath) return imagePath;
    const resolved = uriByLeafName.get(basenameOfImagePath(imagePath));
    // If the image genuinely can't be found, leave the raw relative path in
    // place rather than guessing — ImageWithFallback's existing broken-image
    // placeholder correctly kicks in when that unresolved value fails to load.
    return (resolved ?? imagePath) as T;
  }

  return questions.map((q) => ({
    ...q,
    question: { ...q.question, image: resolve(q.question.image) },
    options: q.options.map((o) => ({ ...o, image: resolve(o.image) })) as Question['options'],
  }));
}

export async function loadQuestions(quizFolderUri: string): Promise<Question[]> {
  const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(quizFolderUri);
  const questionsFileUri = entries.find((e) => leafNameOf(e) === 'questions.json');
  if (!questionsFileUri) return [];

  const raw = await FileSystem.StorageAccessFramework.readAsStringAsync(questionsFileUri);
  const questions = parseQuestionsFile(raw);
  return resolveQuestionImages(questions, quizFolderUri);
}
