import * as FileSystem from 'expo-file-system/legacy';
import type { Question, QuestionOption } from '../types/quiz';

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

export async function loadQuestions(quizFolderUri: string): Promise<Question[]> {
  const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(quizFolderUri);
  const questionsFileUri = entries.find((e) => e.endsWith('questions.json') || e.endsWith(encodeURIComponent('questions.json')));
  if (!questionsFileUri) return [];

  const raw = await FileSystem.StorageAccessFramework.readAsStringAsync(questionsFileUri);
  return parseQuestionsFile(raw);
}
