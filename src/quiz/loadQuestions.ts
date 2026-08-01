import * as FileSystem from 'expo-file-system/legacy';
import type { Question, QuestionOption } from '../types/quiz';
import { findChildUri, leafNameOf } from '../storage/folderAccess';

function isBilingualText(v: unknown): v is { en: string; de: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).en === 'string' &&
    typeof (v as Record<string, unknown>).de === 'string'
  );
}

function isValidOption(v: unknown): v is QuestionOption {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string') return false;
  if (o.text !== undefined && !isBilingualText(o.text)) return false;
  if (o.image !== undefined && typeof o.image !== 'string') return false;
  return o.text !== undefined || o.image !== undefined;
}

function isValidQuestion(v: unknown): v is Question {
  if (typeof v !== 'object' || v === null) return false;
  const q = v as Record<string, unknown>;

  if (typeof q.id !== 'string') return false;
  if (q.category !== 'image' && q.category !== 'text') return false;
  if (typeof q.minAge !== 'number' || typeof q.maxAge !== 'number') return false;

  if (typeof q.question !== 'object' || q.question === null) return false;
  const question = q.question as Record<string, unknown>;
  const hasQuestionText = question.text !== undefined;
  const hasQuestionImage = question.image !== undefined;
  if (!hasQuestionText && !hasQuestionImage) return false;
  if (hasQuestionText && !isBilingualText(question.text)) return false;
  if (hasQuestionImage && typeof question.image !== 'string') return false;

  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  if (!q.options.every(isValidOption)) return false;

  const optionIds = q.options.map((o) => o.id);
  if (new Set(optionIds).size !== optionIds.length) return false;

  if (typeof q.correctOptionId !== 'string') return false;
  if (!q.options.some((o) => o.id === q.correctOptionId)) return false;

  if (q.minAge > q.maxAge) return false;

  return true;
}

// Thrown by loadQuestions (never by parseQuestionsFile itself) when
// questions.json exists but is unreadable as data — invalid JSON, or valid
// JSON missing its `questions` array entirely. This is deliberately a
// distinct signal from "zero valid questions after per-question validation"
// (e.g. every question filtered out by a bad correctOptionId, or none
// matching the child's age range) — those are ambiguous and may be entirely
// legitimate content, whereas a syntax error or missing `questions` field
// can only mean the file itself is corrupt (hand-edited, half-written by a
// crashed export, etc.). QuizScreen uses this to show a distinct,
// parent-facing hint instead of the same generic "no quiz yet" empty state.
export class QuestionsFileCorruptError extends Error {
  constructor() {
    super('questions.json exists but is not valid quiz data');
    this.name = 'QuestionsFileCorruptError';
  }
}

// Deliberately re-parses/re-checks the same two conditions parseQuestionsFile
// already checks internally (see its own early returns below), rather than
// changing parseQuestionsFile's return shape — that function's contract
// (raw string in, Question[] out, never throws) is directly covered by its
// own unit tests and used as a pure validator elsewhere; overloading it to
// also signal "corrupt" vs. "legitimately empty" would complicate that
// simple contract for every existing caller.
function assertQuestionsFileWellFormed(raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new QuestionsFileCorruptError();
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as Record<string, unknown>).questions)) {
    throw new QuestionsFileCorruptError();
  }
}

export function parseQuestionsFile(raw: string): Question[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null) return [];
  const questionsField = (parsed as Record<string, unknown>).questions;
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
  assertQuestionsFileWellFormed(raw);
  const questions = parseQuestionsFile(raw);
  return resolveQuestionImages(questions, quizFolderUri);
}
